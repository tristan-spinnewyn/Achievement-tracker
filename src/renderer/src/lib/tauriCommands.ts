/**
 * `window.api` methods already ported to Rust: the Tauri command each one calls
 * and the names of its arguments (positional in `window.api`, named for Tauri,
 * which converts the camelCase keys to the snake_case Rust parameters).
 */
export interface PortedCommand {
  command: string
  params: string[]
}

const cmd = (command: string, ...params: string[]): PortedCommand => ({ command, params })

export const PORTED_COMMANDS: Record<string, PortedCommand> = {
  'catalog.status': cmd('catalog_status'),

  'achievements.list': cmd('achievements_list', 'filter'),
  'achievements.get': cmd('achievements_get', 'id'),
  'achievements.focusList': cmd('achievements_focus_list'),
  'achievements.latestPatch': cmd('achievements_latest_patch'),
  'achievements.setCompletion': cmd('achievements_set_completion', 'id', 'completed'),
  'achievements.setPriority': cmd('achievements_set_priority', 'id', 'priority'),
  'achievements.setFocus': cmd('achievements_set_focus', 'id', 'inFocus'),
  'achievements.reorderFocus': cmd('achievements_reorder_focus', 'ids'),
  'achievements.setNote': cmd('achievements_set_note', 'id', 'note'),
  'achievements.setDeadline': cmd('achievements_set_deadline', 'id', 'deadline'),
  'achievements.setTags': cmd('achievements_set_tags', 'id', 'tags'),

  'meta.kinds': cmd('meta_kinds'),
  'meta.categories': cmd('meta_categories'),
  'meta.tags': cmd('meta_tags'),
  'meta.patches': cmd('meta_patches'),
  'meta.seasonalEvents': cmd('meta_seasonal_events'),

  dashboard: cmd('dashboard_get'),

  'history.undo': cmd('history_undo'),
  'history.redo': cmd('history_redo'),
  'history.canUndo': cmd('history_can_undo'),
  'history.canRedo': cmd('history_can_redo'),

  'settings.get': cmd('settings_get'),
  'settings.update': cmd('settings_update', 'partial'),
  'lodestone.syncLog': cmd('lodestone_sync_log'),

  'collections.status': cmd('collections_status'),
  'collections.pending': cmd('collections_pending'),
  'collections.allProgress': cmd('collections_all_progress'),
  'collections.patches': cmd('collections_patches', 'kind'),
  'collections.list': cmd('collections_list', 'filter'),
  'collections.categories': cmd('collections_categories', 'kind'),
  'collections.progress': cmd('collections_progress', 'kind'),
  'collections.setOwned': cmd('collections_set_owned', 'kind', 'id', 'owned'),

  'recurring.list': cmd('recurring_list'),
  'recurring.add': cmd('recurring_add', 'input'),
  'recurring.delete': cmd('recurring_delete', 'id'),
  'recurring.setDone': cmd('recurring_set_done', 'id', 'done'),
  'recurring.pending': cmd('recurring_pending')
}
