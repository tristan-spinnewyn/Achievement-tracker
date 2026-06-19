/**
 * Cache local pour les URLs d'icônes (évite les appels IPC répétés).
 */
const iconUrlCache = new Map<string, string | null>()

/**
 * Précharge les icônes pour une liste de chemins.
 */
export async function prefetchIconUrls(paths: (string | null)[]): Promise<void> {
  const uniquePaths = [...new Set(paths.filter(Boolean))] as string[]
  await window.api.icons.prefetch(uniquePaths)
  
  // Mettre à jour le cache
  for (const path of uniquePaths) {
    const url = await window.api.icons.getUrl(path)
    iconUrlCache.set(path, url)
  }
}

/**
 * Convertit un chemin d'icône en URL (locale si disponible, sinon distante).
 * Utilise le cache local si déjà résolu.
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
 * Version synchrone pour compatibilité (retourne l'URL distante si non en cache).
 * Pour les nouveaux appels, préférer iconUrlAsync.
 */
export function iconUrl(path: string | null): string | null {
  if (!path) return null
  
  if (iconUrlCache.has(path)) {
    return iconUrlCache.get(path)!
  }
  
  // Fallback : URL distante directe (sans passer par le cache pour ne pas bloquer)
  // Format XIVAPI v2 pour les assets
  if (path.startsWith('ui/') || path.startsWith('/ui/')) {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path
    return `https://v2.xivapi.com/api/asset?path=${encodeURIComponent(cleanPath)}&format=png`
  }
  // Format classique des icônes d'achievements
  return `https://xivapi.com${path}`
}
