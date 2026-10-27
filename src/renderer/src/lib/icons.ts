/**
 * Local cache for icon URLs (avoids repeated IPC calls).
 */
const iconUrlCache = new Map<string, string | null>()

/**
 * Prefetches the icons for a list of paths.
 */
export async function prefetchIconUrls(paths: (string | null)[]): Promise<void> {
  const uniquePaths = [...new Set(paths.filter(Boolean))] as string[]
  await window.api.icons.prefetch(uniquePaths)
  
  // Update the cache
  for (const path of uniquePaths) {
    const url = await window.api.icons.getUrl(path)
    iconUrlCache.set(path, url)
  }
}

/**
 * Converts an icon path into a URL (local if available, otherwise remote).
 * Uses the local cache when already resolved.
 */
export async function iconUrlAsync(path: string | null): Promise<string | null> {
  if (!path) return null
  
  if (iconUrlCache.has(path)) {
    return iconUrlCache.get(path)!
  }
  
  const url = await window.api.icons.getUrl(path)
  iconUrlCache.set(path, url)
  return url
}

/**
 * Synchronous version kept for compatibility (returns the remote URL when not cached).
 * For new calls, prefer iconUrlAsync.
 */
export function iconUrl(path: string | null): string | null {
  if (!path) return null
  
  if (iconUrlCache.has(path)) {
    return iconUrlCache.get(path)!
  }
  
  // Fallback: direct remote URL (bypassing the cache so we never block)
  // XIVAPI v2 format for assets
  if (path.startsWith('ui/') || path.startsWith('/ui/')) {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path
    return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(cleanPath)}&format=png`
  }
  // Classic achievement icon format
  return `https://xivapi.com${path}`
}
