import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildCollections, normalizeName } from '../src/main/services/collectionsCatalog'

type Rows = { row_id: number; fields?: Record<string, unknown> }[]

/**
 * Fake XIVAPI v2 / FFXIV Collect: `sheets[sheet][lang]` = rows of the first page
 * (the following pages, requested with `after`, are empty).
 */
function stubApis(sheets: Record<string, Partial<Record<string, Rows>>>, collect: Record<string, unknown[] | 'error' | 'throw'>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      calls.push(input)
      const url = new URL(input)
      if (url.hostname === 'ffxivcollect.com') {
        const ep = url.pathname.replace('/api/', '')
        const res = collect[ep]
        if (res === 'error') return new Response('', { status: 500 })
        if (res === 'throw') throw new Error('offline')
        return Response.json({ results: res ?? [] })
      }
      const sheet = url.pathname.split('/').pop()!
      const lang = url.searchParams.get('language')!
      const s = sheets[sheet]
      if (s === undefined) return new Response('', { status: 404 })
      const rows = url.searchParams.has('after') ? [] : (s[lang] ?? [])
      return Response.json({ version: sheet === 'Mount' ? 'v7.3' : undefined, rows })
    })
  )
  return calls
}

const icon = (path: string) => ({ path })

const baseSheets = (): Record<string, Partial<Record<string, Rows>>> => ({
  Mount: {
    fr: [
      { row_id: 1, fields: { Singular: 'licorne', Icon: icon('ui/m1.tex'), Order: 5 } },
      { row_id: 2, fields: { Singular: '' } }
    ],
    en: [{ row_id: 1, fields: { Singular: 'Unicorn' } }, { row_id: 99, fields: { Singular: 'Ghost' } }],
    de: [{ row_id: 1, fields: { Singular: 'Einhorn' } }],
    ja: [{ row_id: 1, fields: { Singular: 'ユニコーン' } }, { row_id: 1, fields: { Singular: '' } }]
  },
  Companion: { fr: [{ row_id: 7, fields: { Singular: 'bébé chocobo' } }] },
  Glasses: { fr: [{ row_id: 3, fields: { Name: 'Lunettes', Singular: 'lunettes', Icon: icon('ui/g.tex') } }] },
  OrchestrionUiparam: {
    fr: [
      { row_id: 10, fields: { Order: 2, OrchestrionCategory: { row_id: 4, fields: { Name: 'Donjons', Order: 2, Icon: icon('ui/oc.tex') } } } },
      { row_id: 11, fields: { OrchestrionCategory: { value: 3, fields: { Name: 'Raids', Order: 1 } } } },
      { row_id: 12, fields: { OrchestrionCategory: { fields: { Name: '' } } } }
    ]
  },
  Orchestrion: {
    fr: [
      { row_id: 10, fields: { Name: 'Air 1', Description: ' desc ' } },
      { row_id: 13, fields: { Name: 'Air orphelin' } },
      { row_id: 14, fields: { Name: '' } }
    ]
  },
  Emote: {
    fr: [{ row_id: 20, fields: { Name: 'Danse', Icon: icon('ui/e.tex') } }, { row_id: 21, fields: { Name: '' } }],
    en: [{ row_id: 20, fields: { Name: 'Dance' } }, { row_id: 20, fields: { Name: 'danse' } }, { row_id: 50, fields: { Name: 'x' } }]
  },
  Ornament: { fr: [{ row_id: 30, fields: { Singular: 'parasol' } }] },
  Title: { fr: [{ row_id: 40, fields: { Masculine: 'le Brave', Icon: icon('ui/t.tex') } }] },
  AozAction: {
    fr: [
      { row_id: 1, fields: { Action: { fields: { Name: 'Canon à eau', Icon: icon('ui/s.tex') } } } },
      { row_id: 2, fields: { Action: { fields: { Name: '' } } } }
    ]
  },
  TripleTriadCard: {
    fr: [
      { row_id: 1, fields: { Name: 'dodo', Description: ' Un oiseau ' } },
      { row_id: 2, fields: { Name: '0' } },
      { row_id: 3, fields: { Name: 'gobelin' } }
    ]
  },
  TripleTriadCardResident: {
    fr: [
      { row_id: 1, fields: { SortKey: 9, AcquisitionType: { fields: { Text: { fields: { Text: 'Tournoi\n  :' } } } } } },
      { row_id: 3 }
    ]
  },
  XBMPet: {
    fr: [
      { row_id: 0, fields: {} },
      { row_id: 1, fields: { Pet: { fields: { Name: 'cu sith' } }, Unknown0: 'Chien', Unknown3: 123456, Unknown7: 2 } },
      { row_id: 2, fields: { Pet: { fields: { Name: '' } } } },
      { row_id: 4, fields: { Pet: { fields: { Name: 'bombo' } }, Unknown7: 0 } }
    ]
  }
})

afterEach(() => vi.unstubAllGlobals())

describe('normalizeName', () => {
  it('strips accents, case, typographic apostrophes and extra spaces', () => {
    expect(normalizeName('  Élégant   Chocobo’s  ')).toBe("elegant chocobo's")
  })
})

describe('buildCollections', () => {
  it('assembles every collection with aliases, patches, sources and categories', async () => {
    stubApis(baseSheets(), {
      mounts: [{ id: 1, patch: '2.0', sources: [{ type: 'Quête', text: 'MSQ' }, { text: '' }, {}] }],
      minions: [],
      orchestrions: [{ id: 10, patch: '3.0', sources: [{ type: 'Donjon' }] }],
      emotes: [{ id: 20, name: 'Dance', patch: '2.0' }, { id: 22, name: 'Wave', icon: 'https://x/api/asset?path=ui%2Fw.tex&f=png' }],
      fashions: [{ id: 30, name: 'Parasol' }],
      hairstyles: [{ id: 60, name: 'Coupe', icon: 'https://x/no-path.png' }, { id: 61, name: '' }],
      bardings: [{ id: 70, name: 'Barde' }],
      titles: [{ id: 40, name: 'the Brave' }],
      spells: [{ id: 1, name: 'Water Cannon' }, { id: 5, name: 'Flamethrower', icon: 'https://x/a?path=ui%2Ff.tex' }],
      beasts: [
        { id: 1, patch: '7.5' },
        { id: 3, name: 'Wolf', description: 'Loup', image: 'https://x/a?path=ui%2Fwolf.tex' },
        { id: 5, icon: 'https://x/a?path=ui%2Fi5.tex' }
      ]
    })

    const res = await buildCollections()
    expect(res.gameVersion).toBe('v7.3')
    const get = (type: string, id: number) => res.items.find((i) => i.type === type && i.id === id)!

    // Mounts: capitalised name (Singular), multi-language aliases, Collect patch/sources
    const mount = get('mount', 1)
    expect(mount).toMatchObject({ name: 'Licorne', iconPath: 'ui/m1.tex', order: 5, patch: '2.0', sources: ['Quête : MSQ'] })
    expect(mount.aliases).toEqual(['licorne', 'unicorn', 'einhorn', 'ユニコーン'])
    expect(res.items.some((i) => i.type === 'mount' && i.id === 2)).toBe(false)

    expect(get('minion', 7)).toMatchObject({ name: 'Bébé chocobo', patch: null, sources: [] })
    expect(get('faceaccessory', 3)).toMatchObject({ name: 'Lunettes', order: 3, aliases: ['lunettes'] })

    // Orchestrion: sorted categories, category icon
    expect(res.categories.filter((c) => c.type === 'orchestrion').map((c) => c.id)).toEqual([3, 4])
    expect(get('orchestrion', 10)).toMatchObject({ description: 'desc', iconPath: 'ui/oc.tex', categoryId: 4, order: 2, patch: '3.0', sources: ['Donjon'] })
    expect(get('orchestrion', 13)).toMatchObject({ iconPath: null, categoryId: null, order: 13 })

    // FFXIV Collect collections
    expect(get('emote', 20)).toMatchObject({ name: 'Danse', iconPath: 'ui/e.tex', aliases: ['danse', 'dance'] })
    expect(get('emote', 22)).toMatchObject({ name: 'Wave', iconPath: 'ui/w.tex', aliases: [] })
    expect(get('fashion', 30).name).toBe('Parasol')
    expect(get('hairstyle', 60).iconPath).toBeNull()
    expect(res.items.some((i) => i.type === 'hairstyle' && i.id === 61)).toBe(false)
    expect(get('title', 40)).toMatchObject({ name: 'le Brave', iconPath: null })

    // Blue Magic: FR override via AozAction
    expect(get('spell', 1)).toMatchObject({ name: 'Canon à eau', iconPath: 'ui/s.tex' })
    expect(get('spell', 5)).toMatchObject({ name: 'Flamethrower', iconPath: 'ui/f.tex' })

    // Triple Triad
    expect(get('tripletriad', 1)).toMatchObject({
      name: 'Dodo',
      description: 'Un oiseau',
      iconPath: 'ui/icon/088000/088001.tex',
      order: 9,
      sources: ['Tournoi']
    })
    expect(get('tripletriad', 3)).toMatchObject({ order: 3, sources: [] })
    expect(res.items.some((i) => i.type === 'tripletriad' && i.id === 2)).toBe(false)

    // Bestiary: XIVAPI + Collect merge
    expect(get('beast', 1)).toMatchObject({ name: 'Cu sith', description: 'Chien', categoryId: 2, iconPath: 'ui/icon/123000/123456_hr1.tex', patch: '7.5' })
    expect(get('beast', 3)).toMatchObject({ name: 'Wolf', description: 'Loup', iconPath: 'ui/wolf.tex', categoryId: null, patch: '7.56' })
    expect(get('beast', 4)).toMatchObject({ name: 'Bombo', iconPath: null, categoryId: null })
    expect(get('beast', 5)).toMatchObject({ name: 'Bête #5', iconPath: 'ui/i5.tex' })
    expect(res.categories.filter((c) => c.type === 'beast')).toHaveLength(8)
  })

  it('carries on without FFXIV Collect or XBMPet when unavailable', async () => {
    const sheets = baseSheets()
    delete sheets.XBMPet
    stubApis(sheets, {
      mounts: 'error',
      minions: 'throw',
      orchestrions: 'error',
      beasts: [{ id: 2, name: 'Rat' }]
    })
    const res = await buildCollections()
    expect(res.items.find((i) => i.type === 'mount' && i.id === 1)?.patch).toBeNull()
    const beasts = res.items.filter((i) => i.type === 'beast')
    expect(beasts).toEqual([expect.objectContaining({ id: 2, name: 'Rat', iconPath: null, patch: '7.56' })])
  })

  it('surfaces an XIVAPI error on a required sheet', async () => {
    const sheets = baseSheets()
    delete sheets.Mount
    stubApis(sheets, {})
    await expect(buildCollections()).rejects.toThrow('XIVAPI HTTP 404 (Mount)')
  })

  it('paginates with `after` and keeps the last known version', async () => {
    const calls = stubApis(baseSheets(), {})
    const res = await buildCollections()
    expect(calls.some((u) => u.includes('/Mount?') && u.includes('after=1'))).toBe(true)
    expect(res.gameVersion).toBe('v7.3')
  })
})
