import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { AchievementRow } from '@shared/types'
import { useStore } from '../store/useStore'
import { PRIORITY_DOT } from '../lib/priority'

function FocusItem({
  row,
  onSelect,
  onRemove
}: {
  row: AchievementRow
  onSelect: (id: number) => void
  onRemove: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded border border-slate-800 bg-slate-800/60 px-3 py-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-500 hover:text-slate-300"
        title="Glisser pour réordonner"
      >
        ⠿
      </button>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[row.priority]}`} />
      <span className="w-12 text-right font-mono text-amber-400">{row.points}</span>
      <button onClick={() => onSelect(row.id)} className="flex-1 truncate text-left hover:text-white">
        {row.name}
      </button>
      <span className="hidden truncate text-xs text-slate-500 md:block">{row.categoryName}</span>
      {row.completed && <span className="text-xs text-emerald-400">✓</span>}
      <button
        onClick={() => onRemove(row.id)}
        className="text-slate-500 hover:text-red-400"
        title="Retirer du focus"
      >
        ✕
      </button>
    </li>
  )
}

export default function FocusView() {
  const [items, setItems] = useState<AchievementRow[]>([])
  const select = useStore((s) => s.select)
  const rows = useStore((s) => s.rows)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const load = async () => setItems(await window.api.achievements.focusList())
  // Recharge aussi quand les données changent (ex. priorité modifiée via le panneau de détail).
  useEffect(() => {
    load()
  }, [rows])

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    const next = arrayMove(items, oldIndex, newIndex)
    setItems(next)
    await window.api.achievements.reorderFocus(next.map((i) => i.id))
  }

  const remove = async (id: number) => {
    await window.api.achievements.setFocus(id, false)
    await load()
    await useStore.getState().loadRows()
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <h2 className="mb-4 text-lg font-bold">
        Liste Focus <span className="text-sm font-normal text-slate-500">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="text-slate-400">
          Aucun objectif en focus. Ajoute des hauts faits au focus depuis la liste (icône ★).
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="max-w-2xl space-y-2">
              {items.map((row) => (
                <FocusItem key={row.id} row={row} onSelect={select} onRemove={remove} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
