/**
 * Gestion du cache local des icônes FFXIV.
 * Télécharge les icônes depuis XIVAPI et les stocke localement.
 */

import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { fetchWithRetry } from './fetch'

const ICON_CACHE_DIR = 'icon-cache'
const XIVAPI_V2_BASE = 'https://v2.xivapi.com'

/**
 * Format accepté pour un chemin d'icône : segments alphanumériques séparés par « / »
 * et une extension (ex: "ui/icon/062000/062904.tex", "/i/000000/000123.png").
 * Exclut « .. », « \ », « : » et toute URL : le chemin sert à la fois de nom de
 * fichier local et de paramètre de requête, il ne doit jamais sortir du cache.
 */
const SAFE_ICON_PATH = /^\/?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+$/

export function isSafeIconPath(iconPath: string | null | undefined): iconPath is string {
  return typeof iconPath === 'string' && iconPath.length <= 256 && SAFE_ICON_PATH.test(iconPath)
}

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
  // userData plutôt que le dossier d'installation : ce dernier ne doit pas être
  // modifiable à l'exécution (et il est remplacé à chaque mise à jour).
  const dir = join(app.getPath('userData'), ICON_CACHE_DIR)

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
export function iconPathToFilename(iconPath: string | null): string | null {
  if (!isSafeIconPath(iconPath)) return null

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
 * URL de l'asset PNG sur XIVAPI v2 (seul hôte contacté pour les icônes).
 * L'API attend un chemin relatif ("ui/icon/…") : avec un « / » initial elle répond 404.
 */
export function remoteAssetUrl(iconPath: string): string {
  return `${XIVAPI_V2_BASE}/api/asset?path=${encodeURIComponent(iconPath.replace(/^\//, ''))}&format=png`
}

/**
 * Télécharge une icône depuis XIVAPI et la stocke dans le cache.
 */
async function downloadIcon(iconPath: string): Promise<string | null> {
  const filename = iconPathToFilename(iconPath)
  if (!filename) return null
  
  const cacheDir = getCacheDir()
  const filePath = join(cacheDir, filename)
  
  // Si déjà en cache, retourner le chemin
  if (existsSync(filePath)) {
    return filePath
  }
  
  try {
    const response = await fetchWithRetry(remoteAssetUrl(iconPath))
    
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
  if (!isSafeIconPath(iconPath)) return null

  const localPath = getLocalIconPath(iconPath)
  if (localPath) {
    // Retourner une URL file:// correctement encodée pour usage direct
    return pathToFileURL(localPath).href
  }

  // Fallback sur l'URL distante via XIVAPI v2
  return remoteAssetUrl(iconPath)
}

/**
 * Précharge plusieurs icônes en arrière-plan.
 */
export async function prefetchIcons(iconPaths: (string | null)[]): Promise<void> {
  if (!Array.isArray(iconPaths)) return
  const uniquePaths = [...new Set(iconPaths.filter(isSafeIconPath))]

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
