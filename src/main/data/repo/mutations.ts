import type { Priority } from '@shared/types'
import { store } from '../store'
import { countCompleted } from './achievements'
import { pushUndoAction } from './history'
import { ensureMeta } from './meta'
import { assertAchievementId, assertString } from '../sanitize'

// ---------------------------------------------------------------- Mutations

export function setManualCompletion(id: number, completed: boolean): void {
  assertAchievementId(id)
  const now = new Date().toISOString()
  // Lock: an achievement obtained via the Lodestone cannot be unchecked manually.
  if (!completed && store.user.progress[id]?.source === 'lodestone') return

  // Save the current state for the history
  const previousData: Record<string, unknown> = {
    completed: store.user.progress[id]?.completed ?? false
  }

  if (completed) {
    const ex = store.user.progress[id]
    store.user.progress[id] = {
      achievementId: id,
      completed: true,
      completedDate: ex?.completedDate ?? now.slice(0, 10),
      source: 'manual',
      updatedAt: now
    }
  } else {
    delete store.user.progress[id]
  }

  // Record the action for undo/redo
  pushUndoAction({
    type: 'setCompletion',
    achievementId: id,
    timestamp: now,
    previousData,
    newData: { completed }
  })

  store.saveUser()
}

/** The Lodestone only lists obtained achievements: we add, never remove. */
export function applyLodestoneCompletions(
  items: { id: number; date: string | null }[]
): { newly: number; total: number } {
  const now = new Date().toISOString()
  let newly = 0
  for (const it of items) {
    const ex = store.user.progress[it.id]
    if (!ex || !ex.completed) newly++
    store.user.progress[it.id] = {
      achievementId: it.id,
      completed: true,
      completedDate: it.date ?? ex?.completedDate ?? null,
      source: 'lodestone',
      updatedAt: now
    }
  }
  store.saveUser()
  return { newly, total: countCompleted() }
}

export function setPriority(id: number, priority: Priority): void {
  const meta = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    priority: meta.priority
  }

  meta.priority = priority

  pushUndoAction({
    type: 'setPriority',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { priority }
  })

  store.saveUser()
}

export function setFocus(id: number, inFocus: boolean): void {
  const m = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    inFocus: m.inFocus,
    focusOrder: m.focusOrder
  }

  m.inFocus = inFocus
  if (inFocus) {
    const max = Math.max(0, ...Object.values(store.user.userMeta).map((x) => x.focusOrder ?? 0))
    m.focusOrder = max + 1
  } else {
    m.focusOrder = null
  }

  pushUndoAction({
    type: 'setFocus',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { inFocus, focusOrder: m.focusOrder }
  })

  store.saveUser()
}

export function reorderFocus(ids: number[]): void {
  if (!Array.isArray(ids)) throw new TypeError('Invalid focus order')
  ids.forEach(assertAchievementId)
  ids.forEach((id, i) => {
    ensureMeta(id).focusOrder = i + 1
  })
  store.saveUser()
}

export function setNote(id: number, note: string | null): void {
  const meta = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    note: meta.note
  }

  meta.note = note && note.trim() ? note : null

  pushUndoAction({
    type: 'setNote',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { note: meta.note }
  })

  store.saveUser()
}

export function setDeadline(id: number, deadline: string | null): void {
  const meta = ensureMeta(id)
  const previousData: Record<string, unknown> = {
    deadline: meta.deadline
  }

  meta.deadline = deadline || null

  pushUndoAction({
    type: 'setDeadline',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { deadline: meta.deadline }
  })

  store.saveUser()
}

export function setAchievementTags(id: number, tags: string[]): void {
  assertAchievementId(id)
  if (!Array.isArray(tags)) throw new TypeError('Invalid tags')
  tags.forEach((t) => assertString(t, 'tag'))
  const previousData: Record<string, unknown> = {
    tags: [...(store.user.tagsByAchievement[id] ?? [])]
  }

  const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
  if (clean.length) store.user.tagsByAchievement[id] = clean
  else delete store.user.tagsByAchievement[id]

  pushUndoAction({
    type: 'setTags',
    achievementId: id,
    timestamp: new Date().toISOString(),
    previousData,
    newData: { tags: clean }
  })

  store.saveUser()
}
