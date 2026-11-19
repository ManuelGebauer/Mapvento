import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OsmPlaceDetails } from '../src/components/map/OsmPlaceDetails'
import type { Place } from '../src/features/osm-places/places'
import { createPoiDraftFromOsmPlace } from '../src/features/osm-places/poiDraft'

const place: Place = {
  type: 'way',
  id: 42,
  latitude: 50.1,
  longitude: 8.6,
  tags: { amenity: 'restaurant', name: 'Waldschänke', description: 'Kleine Gaststätte', cuisine: 'regional' },
}

describe('OSM place POI preparation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps only known fields, matches a POI icon, and preserves OSM provenance', () => {
    expect(createPoiDraftFromOsmPlace(place, 'poi-1')).toEqual({
      id: 'poi-1',
      name: 'Waldschänke',
      description: 'Kleine Gaststätte',
      coordinate: [8.6, 50.1],
      source: 'poi',
      icon: 'restaurant',
      osmReference: { type: 'way', id: 42 },
    })
    expect(createPoiDraftFromOsmPlace({
      ...place,
      tags: { shop: 'bicycle', note: 'Not transferred', name: '  ' },
    }, 'poi-2')).toMatchObject({
      name: 'OSM-Ort',
      description: '',
      icon: 'flag',
    })
  })

  it('opens the editable POI action and leaves details open if replacement is declined', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const onClose = vi.fn()
    const onCreatePoi = vi.fn().mockReturnValue(false)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      await act(async () => root.render(<OsmPlaceDetails
        selection={{ place, anchor: { x: 200, y: 200, bounds: new DOMRect(0, 0, 500, 500) } }}
        onClose={onClose} onCreatePoi={onCreatePoi} />))
      const createButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === 'Einen POI erstellen')
      expect(createButton).toBeDefined()
      expect(createButton?.parentElement?.classList.contains('osm-place-details-links')).toBe(true)
      expect(createButton?.parentElement?.querySelector('a')?.textContent).toBe('In OpenStreetMap öffnen')
      await act(async () => createButton!.click())
      expect(onCreatePoi).toHaveBeenCalledWith(place, expect.any(Number), expect.any(Number))
      expect(onClose).not.toHaveBeenCalled()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
