import type { UserMeta } from '@shared/types'
import { store } from '../store'

/** Returns the user metadata of an achievement, creating it with defaults if missing. */
export function ensureMeta(id: number): UserMeta {
  let m = store.user.userMeta[id]
  if (!m) {
    m = { achievementId: id, priority: 0, inFocus: false, focusOrder: null, note: null, deadline: null }
    store.user.userMeta[id] = m
  }
  return m
}
