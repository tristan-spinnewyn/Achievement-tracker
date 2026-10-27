/** Shared styles and helpers of the settings sections. */

export const ctrl =
  'mt-1 w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-emerald-500'

export const sectionClass = 'max-w-xl space-y-3 rounded border border-slate-800 bg-slate-950 p-4'

export function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR')
  } catch {
    return iso
  }
}
