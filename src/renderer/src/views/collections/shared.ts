import type { CollectionItemRow } from '@shared/types'

/** An item verified on the Lodestone cannot be unchecked manually. */
export const isLocked = (row: CollectionItemRow): boolean => row.owned && row.source === 'lodestone'
