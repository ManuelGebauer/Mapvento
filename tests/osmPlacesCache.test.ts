import { indexedDB } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPlacesEntryFresh, PLACES_MAX_AGE, PlacesCache } from '../src/features/osm-places/placesCache'
import { cellForPosition, cellKey, legacyCellKey } from '../src/features/osm-places/placeCells'

let database = 0

describe('OSM places cache', () => {
  beforeEach(() => vi.stubGlobal('indexedDB', indexedDB))
  afterEach(() => vi.unstubAllGlobals())

  it('persists empty and populated cells across cache instances and expires after 14 days', async () => {
    const name = `places-${database++}`
    const first = new PlacesCache(name)
    const entries = [
      { key: 'cell:water', downloadedAt: 1000, places: [] },
      { key: 'cell:food', downloadedAt: 1000, places: [{
        type: 'node' as const, id: 5, latitude: 50, longitude: 8, tags: { amenity: 'restaurant', access: 'customers' },
      }] },
    ]
    await first.put(entries)
    const restored = await new PlacesCache(name).get(entries.map((entry) => entry.key))
    expect(restored.get('cell:water')?.places).toEqual([])
    expect(restored.get('cell:food')?.places[0].id).toBe(5)
    expect(restored.get('cell:food')?.places[0].tags.access).toBe('customers')
    expect(isPlacesEntryFresh(entries[0], 1000 + PLACES_MAX_AGE - 1)).toBe(true)
    expect(isPlacesEntryFresh(entries[0], 1000 + PLACES_MAX_AGE)).toBe(false)
    expect(isPlacesEntryFresh(entries[0], 999)).toBe(false)
  })

  it('finds cached places over a large visible area and prefers complete entries over legacy data', async () => {
    const cache = new PlacesCache(`places-${database++}`)
    const west = cellForPosition(50, -179.9)
    const east = cellForPosition(50, 179.9)
    const outside = cellForPosition(50, 8)
    const spring = (id: number, longitude: number) => ({
      type: 'node' as const, id, latitude: 50, longitude, tags: { natural: 'spring' },
    })
    await cache.put([
      { key: legacyCellKey(west, 'water'), downloadedAt: 20, places: [spring(1, -179.9)] },
      { key: cellKey(west, 'spring'), downloadedAt: 10, places: [] },
      { key: legacyCellKey(east, 'water'), downloadedAt: 20, places: [spring(2, 179.9)] },
      { key: cellKey(outside, 'spring'), downloadedAt: 20, places: [spring(3, 8)] },
    ])
    const entries = await cache.getVisible({ south: 40, north: 60, west: 179, east: 181 }, ['spring'])
    expect(entries.size).toBe(2)
    expect(entries.get(cellKey(west, 'spring'))?.places).toEqual([])
    expect(entries.get(cellKey(east, 'spring'))?.places.map((place) => place.id)).toEqual([2])
    expect(entries.has(cellKey(outside, 'spring'))).toBe(false)
    expect((await cache.getVisible({ south: -90, north: 90, west: -360, east: 360 }, ['spring'])).size).toBe(3)
  })

  it('retains previous data when a replacement exceeds the storage limit', async () => {
    const cache = new PlacesCache(`places-${database++}`, 300)
    await cache.put([{ key: 'cell', downloadedAt: 1, places: [] }])
    await expect(cache.put([{ key: 'cell', downloadedAt: 2, places: [{
      type: 'node', id: 1, latitude: 50, longitude: 8, tags: { name: 'x'.repeat(500) },
    }] }])).rejects.toThrow()
    expect((await cache.get(['cell'])).get('cell')?.downloadedAt).toBe(1)
    await cache.clear()
    expect((await cache.get(['cell'])).size).toBe(0)
  })

  it('evicts old entries when the bounded cache fills', async () => {
    const entries = ['a', 'b', 'c'].map((key, index) => ({ key, downloadedAt: index + 1, places: [] }))
    const bytes = new TextEncoder().encode(JSON.stringify(entries[0])).byteLength
    const cache = new PlacesCache(`places-${database++}`, bytes * 2)
    for (const entry of entries) await cache.put([entry])
    const stored = await cache.get(['a', 'b', 'c'])
    expect([...stored.keys()]).toEqual(['b', 'c'])
  })

  it('discards a corrupt persisted entry and keeps other cache reads usable', async () => {
    const name = `places-${database++}`
    const cache = new PlacesCache(name)
    await cache.get([])
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const tx = db.transaction('places', 'readwrite')
    tx.objectStore('places').put({ key: 'bad', version: 1, downloadedAt: 1, places: 'not-an-array' })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error)
    })
    expect(await cache.get(['bad'])).toEqual(new Map())
    expect(await cache.get(['bad'])).toEqual(new Map())
    db.close()
  })
})
