import type { Priority } from '@shared/types'

export const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'Aucune',
  1: 'Basse',
  2: 'Moyenne',
  3: 'Haute'
}

export const PRIORITY_SHORT: Record<Priority, string> = {
  0: '—',
  1: 'B',
  2: 'M',
  3: 'H'
}

export const PRIORITY_TEXT: Record<Priority, string> = {
  0: 'text-slate-500',
  1: 'text-sky-400',
  2: 'text-amber-400',
  3: 'text-red-400'
}

export const PRIORITY_DOT: Record<Priority, string> = {
  0: 'bg-slate-600',
  1: 'bg-sky-500',
  2: 'bg-amber-500',
  3: 'bg-red-500'
}

export const nextPriority = (p: Priority): Priority => ((p + 1) % 4) as Priority
