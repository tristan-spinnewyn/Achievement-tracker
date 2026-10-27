export default function ProgressBar({ owned, total }: { owned: number; total: number }) {
  const pct = total ? Math.round((owned / total) * 100) : 0
  return (
    <div className="max-w-md">
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>
          {owned} / {total} obtenu(s)
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
