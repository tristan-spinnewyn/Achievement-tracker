import type { RecurringTask, RecurringType } from '@shared/types'
import { randomUUID } from 'crypto'
import { isDoneThisPeriod, periodStart, previousPeriodStart } from '@shared/resets'
import { store } from '../store'
import { assertAchievementId, assertRecurringType, assertString, safeIconPathOrNull } from '../sanitize'

// ---------------------------------------------------------------- Recurring tasks

/** Removes tasks linked to an achievement that is now obtained (auto-cleanup). */
function pruneCompletedRecurring(): void {
  const before = store.user.recurringTasks.length
  store.user.recurringTasks = store.user.recurringTasks.filter(
    (t) => t.achievementId == null || !(store.user.progress[t.achievementId]?.completed ?? false)
  )
  if (store.user.recurringTasks.length !== before) store.saveUser()
}

export function getRecurringTasks(): RecurringTask[] {
  pruneCompletedRecurring()
  return store.user.recurringTasks
}

export function addRecurringTask(input: {
  name: string
  type: RecurringType
  achievementId?: number | null
  iconPath?: string | null
}): RecurringTask {
  assertString(input.name, 'task name')
  assertRecurringType(input.type)
  if (input.achievementId != null) assertAchievementId(input.achievementId)
  const task: RecurringTask = {
    id: randomUUID(),
    name: input.name.trim(),
    type: input.type,
    achievementId: input.achievementId ?? null,
    iconPath: safeIconPathOrNull(input.iconPath),
    lastCompletedAt: null,
    streak: 0,
    createdAt: new Date().toISOString()
  }
  store.user.recurringTasks.push(task)
  store.saveUser()
  return task
}

export function deleteRecurringTask(id: string): void {
  store.user.recurringTasks = store.user.recurringTasks.filter((t) => t.id !== id)
  store.saveUser()
}

export function setRecurringDone(id: string, done: boolean): void {
  const t = store.user.recurringTasks.find((x) => x.id === id)
  if (!t) return

  const now = new Date()
  const alreadyDone = isDoneThisPeriod(t.type, t.lastCompletedAt, now)

  if (done) {
    if (alreadyDone) return // idempotent: already checked this period
    // The streak continues if the previous check fell in the period just before.
    const prevStart = previousPeriodStart(t.type, now)
    const curStart = periodStart(t.type, now)
    const last = t.lastCompletedAt ? new Date(t.lastCompletedAt) : null
    const continued = !!last && last.getTime() >= prevStart.getTime() && last.getTime() < curStart.getTime()
    t.streak = continued ? (t.streak ?? 0) + 1 : 1
    t.lastCompletedAt = now.toISOString()
  } else {
    if (!alreadyDone) return // nothing to undo for this period
    t.streak = Math.max(0, (t.streak ?? 0) - 1)
    t.lastCompletedAt = null
  }

  store.saveUser()
}

export function countPendingRecurring(
  now: Date = new Date()
): { daily: number; weekly: number; daily22: number } {
  pruneCompletedRecurring()
  let daily = 0
  let weekly = 0
  let daily22 = 0
  for (const t of store.user.recurringTasks) {
    if (!isDoneThisPeriod(t.type, t.lastCompletedAt, now)) {
      if (t.type === 'weekly') weekly++
      else if (t.type === 'daily22') daily22++
      else daily++
    }
  }
  return { daily, weekly, daily22 }
}
