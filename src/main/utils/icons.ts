/**
 * Local cache management for FFXIV icons.
 * Downloads icons from XIVAPI and stores them locally.
 */

import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { fetchWithRetry } from './fetch'

const ICON_CACHE_DIR = 'icon-cache'
const XIVAPI_V2_BASE = 'https://v2.xivapi.com'

/**
 * Accepted format for an icon path: alphanumeric segments separated by "/"
 * and an extension (e.g. "ui/icon/062000/062904.tex", "/i/000000/000123.png").
 * Rejects "..", "\", ":" and any URL: the path is used both as a local file
 * name and as a query parameter, so it must never escape the cache.
 */
const SAFE_ICON_PATH = /^\/?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+$/

export function isSafeIconPath(iconPath: string | null | undefined): iconPath is string {
  return typeof iconPath === 'string' && iconPath.length <= 256 && SAFE_ICON_PATH.test(iconPath)
}

export interface IconCache {
  /** Path to the local icon file, or null if unavailable. */
  localPath: string | null
  /** Remote URL of the icon (fallback). */
  remoteUrl: string | null
}

/**
 * Returns the path of the icon cache folder.
 */
function getCacheDir(): string {
  // userData rather than the install folder: the latter must not be
  // writable at runtime (and it is replaced on every update).
  const dir = join(app.getPath('userData'), ICON_CACHE_DIR)

  // Create the folder if it does not exist
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // Ignore if the folder already exists
  }
  
  return dir
}

/**
 * Converts an XIVAPI icon path into a valid file name.
 * E.g. "/i/000000/000123.png" -> "000000_000123.png"
 */
export function iconPathToFilename(iconPath: string | null): string | null {
  if (!isSafeIconPath(iconPath)) return null

  // Strip the "/i/" prefix and replace "/" with "_"
  const cleanPath = iconPath.replace(/^\/i\//, '').replace(/\//g, '_')
  return cleanPath
}

/**
 * Checks whether an icon is in the local cache.
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
 * Returns the local path of an icon.
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
 * URL of the PNG asset on XIVAPI v2 (the only host contacted for icons).
 * The API expects a relative path ("ui/icon/…"): with a leading "/" it returns 404.
 */
export function remoteAssetUrl(iconPath: string): string {
  return `${XIVAPI_V2_BASE}/api/asset?path=${encodeURIComponent(iconPath.replace(/^\//, ''))}&format=png`
}

/**
 * Downloads an icon from XIVAPI and stores it in the cache.
 */
async function downloadIcon(iconPath: string): Promise<string | null> {
  const filename = iconPathToFilename(iconPath)
  if (!filename) return null
  
  const cacheDir = getCacheDir()
  const filePath = join(cacheDir, filename)
  
  // Already cached: return the path
  if (existsSync(filePath)) {
    return filePath
  }
  
  try {
    const response = await fetchWithRetry(remoteAssetUrl(iconPath))
    
    if (!response.ok) {
      return null
    }
    
    // Read the image as an ArrayBuffer
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Write the file
    writeFileSync(filePath, buffer)
    return filePath
  } catch (error) {
    console.error(`[icons] Failed to download ${iconPath}:`, error)
    return null
  }
}

/**
 * Returns the path of an icon (local if available, otherwise null).
 * Does not download automatically.
 */
export function getIconPath(iconPath: string | null): string | null {
  if (!iconPath) return null
  return getLocalIconPath(iconPath)
}

/**
 * Returns the path of an icon, downloading it if needed.
 * Returns the local path, or null on failure.
 */
export async function getIconPathWithDownload(iconPath: string | null): Promise<string | null> {
  if (!iconPath) return null
  
  // Check the cache first
  const localPath = getLocalIconPath(iconPath)
  if (localPath) {
    return localPath
  }
  
  // Download if not cached
  return downloadIcon(iconPath)
}

/**
 * Returns the full URL of an icon (local if available, otherwise remote).
 * Used by the renderer to display icons.
 */
export function getIconUrl(iconPath: string | null): string | null {
  if (!isSafeIconPath(iconPath)) return null

  const localPath = getLocalIconPath(iconPath)
  if (localPath) {
    // Return a properly encoded file:// URL for direct use
    return pathToFileURL(localPath).href
  }

  // Fall back to the remote XIVAPI v2 URL
  return remoteAssetUrl(iconPath)
}

/**
 * Prefetches several icons in the background.
 */
export async function prefetchIcons(iconPaths: (string | null)[]): Promise<void> {
  if (!Array.isArray(iconPaths)) return
  const uniquePaths = [...new Set(iconPaths.filter(isSafeIconPath))]

  // Cap the number of concurrent downloads
  const CONCURRENCY = 5
  const queue: string[] = []
  
  for (let i = 0; i < Math.min(CONCURRENCY, uniquePaths.length); i++) {
    queue.push(uniquePaths[i])
    downloadIcon(uniquePaths[i]).catch(() => {}) // Ignore errors
  }
  
  // Start the remaining downloads with a delay
  for (let i = CONCURRENCY; i < uniquePaths.length; i++) {
    queue.push(uniquePaths[i])
    setTimeout(() => {
      downloadIcon(uniquePaths[i]).catch(() => {})
    }, i * 100)
  }
}
