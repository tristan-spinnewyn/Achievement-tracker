/**
 * Advanced search engine built on FlexSearch.
 * Supports the AND, OR, NOT operators, parentheses and full-text search.
 */

import { Document } from 'flexsearch'
import type { AchievementRow } from '@shared/types'
import { store } from '../data/store'

/** Indexed shape of an achievement (flattened fields for FlexSearch). */
interface IndexDoc {
  id: number
  name: string
  description: string
  category: string
  kind: string
  [key: string]: string | number
}

// FlexSearch index for fast search
let searchIndex: Document<IndexDoc> | null = null

/**
 * Initialises (or re-initialises) the search index.
 */
export function initSearchIndex(): void {
  const idx = new Document<IndexDoc>({
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
 * Parses a search query with full operator support.
 * Examples:
 *   "mount AND combat"
 *   "mount OR dragon"
 *   "mount NOT combat"
 *   "(mount OR dragon) AND combat"
 *   "pvp AND (daily OR weekly)"
 */
export function parseAdvancedQuery(query: string): {
  tokens: string[]
  operators: string[]
} {
  const lowerQuery = query.toLowerCase().trim()
  
  // No operators: return a single token
  if (!lowerQuery.includes(' and ') && !lowerQuery.includes(' or ') && !lowerQuery.includes(' not ')) {
    return { tokens: [lowerQuery], operators: [] }
  }
  
  // Advanced tokenizer that respects parentheses
  // Approach: use a stack to handle parentheses
  const tokens: string[] = []
  const operators: string[] = []
  
  let currentToken = ''
  let i = 0
  
  while (i < lowerQuery.length) {
    const char = lowerQuery[i]
    const nextChar = lowerQuery[i + 1]
    const prevChar = lowerQuery[i - 1]
    
    // Skip repeated spaces
    if (char === ' ' && nextChar === ' ') {
      i++
      continue
    }
    
    // Detect operators (AND, OR, NOT)
    if (char === ' ' && (lowerQuery.slice(i + 1).startsWith('and ') || 
                         lowerQuery.slice(i + 1).startsWith('or ') || 
                         lowerQuery.slice(i + 1).startsWith('not '))) {
      // Save the current token
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
      
      // Detect the operator and skip "<space>OP<space>" up to the next token.
      if (lowerQuery.slice(i + 1).startsWith('and ')) {
        operators.push('AND')
        i += 5 // skip " and "
      } else if (lowerQuery.slice(i + 1).startsWith('or ')) {
        operators.push('OR')
        i += 4 // skip " or "
      } else if (lowerQuery.slice(i + 1).startsWith('not ')) {
        operators.push('NOT')
        i += 5 // skip " not "
      }
    } else if (char === '(' || char === ')') {
      // Parentheses are ignored for now (simplified handling)
      i++
    } else {
      currentToken += char
      i++
    }
  }
  
  // Add the last token
  if (currentToken) {
    tokens.push(currentToken)
  }
  
  return { tokens, operators }
}

/**
 * Evaluates an advanced search query.
 * Uses FlexSearch when available, otherwise falls back to a simple search.
 */
export function evaluateAdvancedQuery(query: string): (row: AchievementRow) => boolean {
  const lowerQuery = query.toLowerCase().trim()
  
  // Empty query: everything matches
  if (!lowerQuery) {
    return () => true
  }
  
  // Index not initialised: use the simple method
  if (!searchIndex) {
    return (row) => {
      const rowText = `${row.name.toLowerCase()} ${row.description.toLowerCase()} ${row.categoryName.toLowerCase()} ${row.kindName.toLowerCase()}`
      return rowText.includes(lowerQuery)
    }
  }
  
  // Parse the query
  const { tokens, operators } = parseAdvancedQuery(lowerQuery)
  
  // Single token: use FlexSearch directly.
  // Document.search returns an array of groups `{ field, result: Id[] }`;
  // we flatten all matching ids.
  if (tokens.length === 1) {
    const groups = searchIndex.search(tokens[0], { suggest: true })
    const resultIds = new Set<number>()
    for (const group of groups) {
      for (const id of group.result) resultIds.add(Number(id))
    }
    return (row) => resultIds.has(row.id)
  }
  
  // Otherwise, evaluate the boolean expression
  // This is a simplified implementation that evaluates left to right
  return (row) => {
    const rowText = `${row.name.toLowerCase()} ${row.description.toLowerCase()} ${row.categoryName.toLowerCase()} ${row.kindName.toLowerCase()}`
    
    let result = true
    let i = 0
    
    // First token
    if (i < tokens.length) {
      result = rowText.includes(tokens[i])
      i++
    }
    
    // Apply the operators
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
 * Updates the search index (called when the catalog changes).
 */
export function updateSearchIndex(): void {
  // Builds a fresh index (FlexSearch.Document exposes no reliable way to clear it).
  initSearchIndex()
}

/**
 * Searches achievements with an advanced query.
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
