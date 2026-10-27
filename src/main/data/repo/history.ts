import type { Priority, UndoableAction } from '@shared/types'
import { store } from '../store'
import { ensureMeta } from './meta'

// ---------------------------------------------------------------- Undo/Redo history

const MAX_HISTORY = 50

/**
 * Records an action in the undo history.
 */
export function pushUndoAction(action: UndoableAction): void {
  // Cap the history size
  if (store.user.undoStack.length >= MAX_HISTORY) {
    store.user.undoStack.shift()
  }
  store.user.undoStack.push(action)
  // Clear the redo stack when a new action is performed
  store.user.redoStack = []
  store.saveUser()
}

/**
 * Undoes the last action.
 */
export function undo(): boolean {
  const action = store.user.undoStack.pop()
  if (!action) return false

  // Apply the inverse action
  restoreActionState(action.previousData, action.achievementId)

  // Push onto the redo stack
  if (store.user.redoStack.length >= MAX_HISTORY) {
    store.user.redoStack.shift()
  }
  store.user.redoStack.push(action)

  store.saveUser()
  return true
}

/**
 * Redoes the last undone action.
 */
export function redo(): boolean {
  const action = store.user.redoStack.pop()
  if (!action) return false

  // Apply the action
  restoreActionState(action.newData, action.achievementId)

  // Push onto the undo stack
  if (store.user.undoStack.length >= MAX_HISTORY) {
    store.user.undoStack.shift()
  }
  store.user.undoStack.push(action)

  store.saveUser()
  return true
}

/**
 * Checks whether an action can be undone.
 */
export function canUndo(): boolean {
  return store.user.undoStack.length > 0
}

/**
 * Checks whether an action can be redone.
 */
export function canRedo(): boolean {
  return store.user.redoStack.length > 0
}

/**
 * Restores an achievement's state from saved data.
 */
function restoreActionState(data: Record<string, unknown>, achievementId: number): void {
  const id = String(achievementId)

  // Restore progress
  if ('completed' in data) {
    const completed = data.completed as boolean | undefined
    if (completed === true) {
      const progress = store.user.progress[id] ?? { achievementId, completed: false, completedDate: null, source: 'manual', updatedAt: '' }
      store.user.progress[id] = {
        ...progress,
        completed: true
      }
    } else if (completed === false) {
      delete store.user.progress[id]
    }
  }

  // Restore metadata
  if ('priority' in data) {
    ensureMeta(achievementId).priority = data.priority as Priority
  }
  if ('inFocus' in data) {
    ensureMeta(achievementId).inFocus = data.inFocus as boolean
  }
  if ('focusOrder' in data) {
    ensureMeta(achievementId).focusOrder = data.focusOrder as number | null
  }
  if ('note' in data) {
    ensureMeta(achievementId).note = data.note as string | null
  }
  if ('deadline' in data) {
    ensureMeta(achievementId).deadline = data.deadline as string | null
  }

  // Restore tags
  if ('tags' in data) {
    const tags = data.tags as string[] | undefined
    if (tags && tags.length > 0) {
      store.user.tagsByAchievement[id] = [...tags]
    } else {
      delete store.user.tagsByAchievement[id]
    }
  }
}
