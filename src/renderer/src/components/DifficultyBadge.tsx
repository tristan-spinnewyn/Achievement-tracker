import { useStore } from '../store/useStore'
import type { AchievementDifficulty } from '@shared/types'

/**
 * Badge de difficulté pour un haut fait
 */
export function DifficultyBadge({ achievementId }: { achievementId: number }) {
  const difficulties = useStore((s) => s.difficulties)
  const difficulty = difficulties.get(achievementId)

  if (!difficulty) {
    return <div className="text-xs text-slate-500">—</div>
  }

  return (
    <div
      className="flex items-center gap-1 overflow-hidden rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${difficulty.color}20`, color: difficulty.color }}
      title={`Difficulté: ${difficulty.levelName} (Score: ${difficulty.score})`}
    >
      <span className="shrink-0">{difficulty.stars}</span>
      <span className="hidden truncate sm:inline">{difficulty.levelName}</span>
    </div>
  )
}

export default DifficultyBadge
