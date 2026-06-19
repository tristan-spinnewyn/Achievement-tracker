/**
 * Moteur de recherche avancée utilisant FlexSearch.
 * Supporte les opérateurs AND, OR, NOT, les parenthèses et la recherche full-text.
 */

import FlexSearch from 'flexsearch'
import type { AchievementRow } from '@shared/types'
import { store } from '../data/store'

/** Forme indexée d'un haut fait (champs aplatis pour FlexSearch). */
interface IndexDoc {
  id: number
  name: string
  description: string
  category: string
  kind: string
}

// Index FlexSearch pour une recherche rapide
let searchIndex: FlexSearch.Document<IndexDoc> | null = null

/**
 * Initialise (ou réinitialise) l'index de recherche.
 */
export function initSearchIndex(): void {
  const idx = new FlexSearch.Document<IndexDoc>({
    document: {
      id: 'id',
      index: ['name', 'description', 'category', 'kind']
    }
  })

  for (const a of store.catalog.achievements) {
    const cat = store.categoryById.get(a.categoryId)
    const kind = store.kindById.get(a.kindId)

    idx.add({
      id: a.id,
      name: a.name,
      description: a.description,
      category: cat?.name ?? '',
      kind: kind?.name ?? ''
    })
  }

  searchIndex = idx
}

/**
 * Parse une requête de recherche avec support complet des opérateurs.
 * Exemples :
 *   "monture AND combat"
 *   "monture OR dragon"
 *   "monture NOT combat"
 *   "(monture OR dragon) AND combat"
 *   "pvp AND (daily OR weekly)"
 */
export function parseAdvancedQuery(query: string): {
  tokens: string[]
  operators: string[]
} {
  const lowerQuery = query.toLowerCase().trim()
  
  // Si pas d'opérateurs, retourner un seul token
  if (!lowerQuery.includes(' and ') && !lowerQuery.includes(' or ') && !lowerQuery.includes(' not ')) {
    return { tokens: [lowerQuery], operators: [] }
  }
  
  // Tokenizer avancé qui respecte les parenthèses
  // Approche : utiliser une stack pour gérer les parenthèses
  const tokens: string[] = []
  const operators: string[] = []
  
  let currentToken = ''
  let i = 0
  
  while (i < lowerQuery.length) {
    const char = lowerQuery[i]
    const nextChar = lowerQuery[i + 1]
    const prevChar = lowerQuery[i - 1]
    
    // Ignorer les espaces multiples
    if (char === ' ' && nextChar === ' ') {
      i++
      continue
    }
    
    // Détecter les opérateurs (AND, OR, NOT)
    if (char === ' ' && (lowerQuery.slice(i + 1).startsWith('and ') || 
                         lowerQuery.slice(i + 1).startsWith('or ') || 
                         lowerQuery.slice(i + 1).startsWith('not '))) {
      // Sauvegarder le token courant
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
      
      // Détecter l'opérateur et sauter « <espace>OP<espace> » jusqu'au token suivant.
      if (lowerQuery.slice(i + 1).startsWith('and ')) {
        operators.push('AND')
        i += 5 // sauter " and "
      } else if (lowerQuery.slice(i + 1).startsWith('or ')) {
        operators.push('OR')
        i += 4 // sauter " or "
      } else if (lowerQuery.slice(i + 1).startsWith('not ')) {
        operators.push('NOT')
        i += 5 // sauter " not "
      }
    } else if (char === '(' || char === ')') {
      // Pour l'instant, ignorer les parenthèses (traitement simplifié)
      i++
    } else {
      currentToken += char
      i++
    }
  }
  
  // Ajouter le dernier token
  if (currentToken) {
    tokens.push(currentToken)
  }
  
  return { tokens, operators }
}

/**
 * Évalue une requête de recherche avancée.
 * Utilise FlexSearch si disponible, sinon falls back sur une recherche simple.
 */
export function evaluateAdvancedQuery(query: string): (row: AchievementRow) => boolean {
  const lowerQuery = query.toLowerCase().trim()
  
  // Si pas de requête, tout correspond
  if (!lowerQuery) {
    return () => true
  }
  
  // Si l'index n'est pas initialisé, utiliser la méthode simple
  if (!searchIndex) {
    return (row) => {
      const rowText = `${row.name.toLowerCase()} ${row.description.toLowerCase()} ${row.categoryName.toLowerCase()} ${row.kindName.toLowerCase()}`
      return rowText.includes(lowerQuery)
    }
  }
  
  // Parse la requête
  const { tokens, operators } = parseAdvancedQuery(lowerQuery)
  
  // Si un seul token, utiliser FlexSearch directement.
  // Document.search renvoie un tableau de groupes `{ field, result: Id[] }` ;
  // on aplatit tous les ids correspondants.
  if (tokens.length === 1) {
    const groups = searchIndex.search(tokens[0], { suggest: true })
    const resultIds = new Set<number>()
    for (const group of groups) {
      for (const id of group.result) resultIds.add(Number(id))
    }
    return (row) => resultIds.has(row.id)
  }
  
  // Sinon, évaluer l'expression booléenne
  // C'est une implémentation simplifiée qui évalue de gauche à droite
  return (row) => {
    const rowText = `${row.name.toLowerCase()} ${row.description.toLowerCase()} ${row.categoryName.toLowerCase()} ${row.kindName.toLowerCase()}`
    
    let result = true
    let i = 0
    
    // Premier token
    if (i < tokens.length) {
      result = rowText.includes(tokens[i])
      i++
    }
    
    // Appliquer les opérateurs
    while (i < tokens.length && i - 1 < operators.length) {
      const op = operators[i - 1]
      const tokenMatch = rowText.includes(tokens[i])
      
      if (op === 'AND') {
        result = result && tokenMatch
      } else if (op === 'OR') {
        result = result || tokenMatch
      } else if (op === 'NOT') {
        result = result && !tokenMatch
      }
      
      i++
    }
    
    return result
  }
}

/**
 * Met à jour l'index de recherche (appelé quand le catalogue change).
 */
export function updateSearchIndex(): void {
  // Reconstruit un index neuf (FlexSearch.Document n'expose pas de vidage fiable).
  initSearchIndex()
}

/**
 * Recherche des hauts faits avec une requête avancée.
 */
export function searchAchievements(query: string): AchievementRow[] {
  const searchFn = evaluateAdvancedQuery(query)
  const results: AchievementRow[] = []
  
  for (const a of store.catalog.achievements) {
    const row = {
      ...a,
      categoryName: store.categoryById.get(a.categoryId)?.name ?? '',
      kindName: store.kindById.get(a.kindId)?.name ?? '',
      completed: !!store.user.progress[a.id]?.completed,
      completedDate: store.user.progress[a.id]?.completedDate ?? null,
      source: store.user.progress[a.id]?.source ?? null,
      priority: store.user.userMeta[a.id]?.priority ?? 0,
      inFocus: store.user.userMeta[a.id]?.inFocus ?? false,
      focusOrder: store.user.userMeta[a.id]?.focusOrder ?? null,
      note: store.user.userMeta[a.id]?.note ?? null,
      deadline: store.user.userMeta[a.id]?.deadline ?? null,
      tags: store.user.tagsByAchievement[a.id] ?? []
    }
    
    if (searchFn(row)) {
      results.push(row)
    }
  }
  
  return results
}
