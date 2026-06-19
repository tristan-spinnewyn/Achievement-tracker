/**
 * Gestion du cache local des icônes FFXIV.
 * Télécharge les icônes depuis XIVAPI et les stocke localement.
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fetchWithRetry } from './fetch'

const ICON_CACHE_DIR = 'icon-cache'
const XIVAPI_BASE = 'https://xivapi.com'
const XIVAPI_V2_BASE = 'https://v2.xivapi.com'

export interface IconCache {
  /** Chemin vers le fichier d'icône local, ou null si non disponible. */
  localPath: string | null
  /** URL distante de l'icône (pour fallback). */
  remoteUrl: string | null
}

/**
 * Récupère le chemin du dossier de cache des icônes.
 */
function getCacheDir(): string {
  const dir = app.isPackaged
    ? join(process.resourcesPath, ICON_CACHE_DIR)
    : join(app.getAppPath(), ICON_CACHE_DIR)
  
  // Créer le dossier s'il n'existe pas
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Ignorer si le dossier existe déjà
  }
  
  return dir
}

/**
 * Convertit un chemin d'icône XIVAPI en nom de fichier valide.
 * Ex: "/i/000000/000123.png" -> "000000_000123.png"
 */
function iconPathToFilename(iconPath: string | null): string | null {
  if (!iconPath) return null
  
  // Enlever le préfixe "/i/" et remplacer les "/" par "_"
  const cleanPath = iconPath.replace(/^\/i\//, '').replace(/\//g, '_')
  return cleanPath
}

/**
 * Vérifie si une icône est dans le cache local.
 */
function isIconCached(iconPath: string | null): boolean {
  if (!iconPath) return false
  const filename = iconPathToFilename(iconPath)
  if (!filename) return false
  
  const cacheDir = getCacheDir()
  const filePath = join(cacheDir, filename)
  return existsSync(filePath)
}

/**
 * Récupère le chemin local d'une icône.
 */
function getLocalIconPath(iconPath: string | null): string | null {
  if (!iconPath) return null
  const filename = iconPathToFilename(iconPath)
  if (!filename) return null
  
  const cacheDir = getCacheDir()
  const filePath = join(cacheDir, filename)
  return existsSync(filePath) ? filePath : null
}

/**
 * Télécharge une icône depuis XIVAPI et la stocke dans le cache.
 */
async function downloadIcon(iconPath: string): Promise<string | null> {
  if (!iconPath) return null
  
  const filename = iconPathToFilename(iconPath)
  if (!filename) return null
  
  const cacheDir = getCacheDir()
  const filePath = join(cacheDir, filename)
  
  // Si déjà en cache, retourner le chemin
  if (existsSync(filePath)) {
    return filePath
  }
  
  try {
    // Normaliser l'URL de l'icône pour utiliser XIVAPI v2 asset endpoint
    let remoteUrl: string
    // Les chemins d'icônes de XIVAPI v2 sont au format "/ui/icon/000000/000000.tex"
    // On utilise l'endpoint /api/asset qui retourne le fichier brut
    if (iconPath.startsWith('/')) {
      // Chemin absolu, utiliser l'API v2
      remoteUrl = `${XIVAPI_V2_BASE}/api/asset?path=${encodeURIComponent(iconPath)}&format=png`
    } else if (iconPath.includes('/')) {
      // Chemin relatif avec slash, utiliser l'API v2
      remoteUrl = `${XIVAPI_V2_BASE}/api/asset?path=${encodeURIComponent('/' + iconPath)}&format=png`
    } else if (!iconPath.startsWith('http://') && !iconPath.startsWith('https://')) {
      // Chemin simple, utiliser l'API v2
      remoteUrl = `${XIVAPI_V2_BASE}/api/asset?path=${encodeURIComponent('/' + iconPath)}&format=png`
    } else {
      // URL complète, utiliser tel quel
      remoteUrl = iconPath
    }
    
    const response = await fetchWithRetry(remoteUrl)
    
    if (!response.ok) {
      return null
    }
    
    // Lire l'image comme ArrayBuffer
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Écrire le fichier
    writeFileSync(filePath, buffer)
    return filePath
  } catch (error) {
    console.error(`[icons] Échec du téléchargement de ${iconPath}:`, error)
    return null
  }
}

/**
 * Récupère le chemin d'une icône (local si disponible, sinon null).
 * Ne télécharge pas automatiquement.
 */
export function getIconPath(iconPath: string | null): string | null {
  if (!iconPath) return null
  return getLocalIconPath(iconPath)
}

/**
 * Récupère le chemin d'une icône, en la téléchargeant si nécessaire.
 * Retourne le chemin local ou null si échec.
 */
export async function getIconPathWithDownload(iconPath: string | null): Promise<string | null> {
  if (!iconPath) return null
  
  // Vérifier d'abord le cache
  const localPath = getLocalIconPath(iconPath)
  if (localPath) {
    return localPath
  }
  
  // Télécharger si non en cache
  return downloadIcon(iconPath)
}

/**
 * Récupère l'URL complète d'une icône (locale si disponible, sinon distante).
 * Utilisé par le renderer pour afficher les icônes.
 */
export function getIconUrl(iconPath: string | null): string | null {
  if (!iconPath) return null
  
  const localPath = getLocalIconPath(iconPath)
  if (localPath) {
    // Retourner un chemin file:// pour usage direct
    return `file://${localPath}`
  }
  
  // Fallback sur l'URL distante via XIVAPI v2
  if (iconPath.startsWith('/')) {
    return `${XIVAPI_V2_BASE}/api/asset?path=${encodeURIComponent(iconPath)}&format=png`
  }
  return `${XIVAPI_V2_BASE}/api/asset?path=${encodeURIComponent('/' + iconPath)}&format=png`
}

/**
 * Précharge plusieurs icônes en arrière-plan.
 */
export async function prefetchIcons(iconPaths: (string | null)[]): Promise<void> {
  const uniquePaths = [...new Set(iconPaths.filter(Boolean))] as string[]
  
  // Limiter le nombre de téléchargements simultanés
  const CONCURRENCY = 5
  const queue: string[] = []
  
  for (let i = 0; i < Math.min(CONCURRENCY, uniquePaths.length); i++) {
    queue.push(uniquePaths[i])
    downloadIcon(uniquePaths[i]).catch(() => {}) // Ignorer les erreurs
  }
  
  // Lancer les téléchargements restants avec un délai
  for (let i = CONCURRENCY; i < uniquePaths.length; i++) {
    queue.push(uniquePaths[i])
    setTimeout(() => {
      downloadIcon(uniquePaths[i]).catch(() => {})
    }, i * 100)
  }
}
