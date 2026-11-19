import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPlacesQuery, fetchPlaces, OverpassHttpError, OverpassSizeError, parsePlaces, placeKind } from '../src/features/osm-places/places'
import { abortPlaces } from '../src/features/osm-places/placesDiagnostics'

describe('OSM places provider', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('queries only the selected types within the requested bounds', () => {
    const query = buildPlacesQuery({ south: 50, west: 8, north: 51, east: 9 }, ['spring', 'supermarket'])
    expect(query).toContain('nwr["natural"="spring"]["shelter_type"!="public_transport"](50,8,51,9)')
    expect(query).toContain('nwr["shop"="supermarket"]["shelter_type"!="public_transport"](50,8,51,9)')
    expect(query).toContain('["shelter_type"!="public_transport"]')
    expect(query).not.toContain('drinking_water')
    expect(query).not.toContain('restaurant')
    expect(query).not.toContain('nwr["amenity"="parking"]')
    expect(() => buildPlacesQuery({ south: 50, west: 8, north: 51, east: 9 }, [])).toThrow()
  })

  it('queries and classifies all supermarket variants and the independently selected shops', () => {
    const bounds = { south: 50, west: 8, north: 51, east: 9 }
    const query = buildPlacesQuery(bounds, ['supermarket'])
    for (const shop of ['supermarket', 'convenience', 'variety_store', 'general', 'food']) {
      expect(query).toContain(`nwr["shop"="${shop}"]["shelter_type"!="public_transport"](50,8,51,9)`)
      const place = { type: 'node' as const, id: 1, latitude: 50, longitude: 8, tags: { shop } }
      expect(placeKind(place, ['supermarket'])?.icon).toBe('supermarket')
      expect(placeKind(place, ['bakery', 'butcher'])).toBeUndefined()
    }
    expect(query).not.toContain('bakery')
    expect(query).not.toContain('butcher')
    for (const shop of ['bakery', 'butcher'] as const) {
      const place = { type: 'node' as const, id: 1, latitude: 50, longitude: 8, tags: { shop } }
      expect(buildPlacesQuery(bounds, [shop])).toContain(`nwr["shop"="${shop}"]`)
      expect(placeKind(place, [shop])?.icon).toBe(shop)
      expect(placeKind(place, ['supermarket'])).toBeUndefined()
    }
  })

  it('preserves tags and object identity while excluding explicitly inaccessible places', () => {
    const places = parsePlaces({ elements: [
      { type: 'node', id: 1, lat: 50, lon: 8, tags: { natural: 'spring', name: 'Quelle', access: 'yes' } },
      { type: 'way', id: 1, center: { lat: 50.1, lon: 8.1 }, tags: { tourism: 'museum' } },
      { type: 'node', id: 2, lat: 50, lon: 8, tags: { amenity: 'parking', access: 'private' } },
      { type: 'node', id: 3, lat: 50, lon: 8, tags: { amenity: 'restaurant', access: 'customers' } },
      { type: 'node', id: 4, lat: 50, lon: 8, tags: { amenity: 'restaurant', access: '  Customers  ' } },
      { type: 'node', id: 5, lat: 50, lon: 8, tags: { amenity: 'shelter', shelter_type: 'public_transport' } },
    ] })
    expect(places.map((place) => place.id)).toEqual([1, 1, 3, 4])
    expect(places[0].tags.name).toBe('Quelle')
    expect(places[1]).toMatchObject({ type: 'way', id: 1, latitude: 50.1, longitude: 8.1 })
    expect(placeKind(places[1], ['museum'])?.icon).toBe('museum')
    expect(placeKind(places[1], ['spring'])).toBeUndefined()
  })

  it('excludes closed objects and inactive primary tags without excluding unrelated tags', () => {
    const node = (id: number, tags: Record<string, string>) =>
      ({ type: 'node' as const, id, lat: 50, lon: 8, tags })
    const places = parsePlaces({ elements: [
      node(1, { amenity: 'restaurant', disused: ' YES ' }),
      node(2, { amenity: 'restaurant', opening_hours: ' Closed ' }),
      node(3, { 'disused:amenity': 'restaurant' }),
      node(4, { amenity: 'restaurant', 'disused:amenity': 'restaurant' }),
      node(5, { shop: 'bakery', 'abandoned:shop': 'bakery' }),
      node(6, { amenity: 'restaurant', 'abandoned:shop': 'bakery' }),
      node(7, { amenity: 'restaurant', disused: 'no', opening_hours: 'Mo-Fr 09:00-17:00' }),
      node(8, { natural: 'spring', 'abandoned:natural': 'spring' }),
      node(9, { railway: 'station', 'disused:railway': 'station' }),
      node(10, { amenity: 'restaurant', shop: 'bakery', 'disused:shop': 'bakery' }),
    ] })
    expect(places.map((place) => place.id)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
    const kinds = ['restaurant', 'bakery', 'spring', 'train'] as const
    expect(places.map((place) => placeKind(place, kinds)?.id)).toEqual([
      undefined, undefined, undefined, 'restaurant', 'restaurant', undefined, undefined, 'restaurant',
    ])
    for (const tags of [{ amenity: 'restaurant', disused: 'yes' },
      { amenity: 'restaurant', opening_hours: 'closed' }]) {
      expect(placeKind({ type: 'node', id: 11, latitude: 50, longitude: 8, tags }, kinds)).toBeUndefined()
    }
  })

  it('rejects incomplete or invalid responses rather than caching them as complete', () => {
    expect(() => parsePlaces({ remark: 'runtime error', elements: [] })).toThrow()
    expect(() => parsePlaces({ elements: [{ type: 'way', id: 1, tags: {} }] })).toThrow()
    expect(() => parsePlaces({ elements: [{ type: 'node', id: 1, lat: 100, lon: 0, tags: {} }] })).toThrow()
  })

  it('uses a bounded POST and accepts a complete Overpass response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ elements: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    await expect(fetchPlaces({ south: 50, west: 8, north: 51, east: 9 }, ['spring'], signal)).resolves.toEqual([])
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', signal })
  })

  it('preserves rate-limit errors and rejects incomplete or excessive responses', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '45' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ remark: 'runtime error: Query timed out', elements: [] })))
      .mockResolvedValueOnce(new Response('', { headers: { 'Content-Length': '5000000' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ remark: 'other runtime error', elements: [] })))
    vi.stubGlobal('fetch', fetch)
    const bounds = { south: 50, west: 8, north: 51, east: 9 }
    const signal = new AbortController().signal
    await expect(fetchPlaces(bounds, ['spring'], signal)).rejects.toMatchObject<Partial<OverpassHttpError>>({ status: 429, retryAfterMs: 45_000 })
    await expect(fetchPlaces(bounds, ['spring'], signal)).rejects.toThrow('Zeitlimit des Servers')
    await expect(fetchPlaces(bounds, ['spring'], signal)).rejects.toBeInstanceOf(OverpassSizeError)
    await expect(fetchPlaces(bounds, ['spring'], signal)).rejects.toThrow('unvollständige Antwort')
  })

  it('records HTTP errors and distinguishes timeouts from requests without an HTTP response', async () => {
    const diagnostic = vi.fn()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason))
      }))
    vi.stubGlobal('fetch', fetch)
    const bounds = { south: 50, west: 8, north: 51, east: 9 }
    await expect(fetchPlaces(bounds, ['spring'], new AbortController().signal, diagnostic)).rejects.toBeInstanceOf(OverpassHttpError)
    await expect(fetchPlaces(bounds, ['spring'], new AbortController().signal, diagnostic)).rejects.toThrow('Netzwerk- oder CORS-Fehler')
    const controller = new AbortController()
    const pending = fetchPlaces(bounds, ['spring'], controller.signal, diagnostic)
    controller.abort(new DOMException('timeout', 'TimeoutError'))
    await expect(pending).rejects.toBeDefined()
    expect(diagnostic.mock.calls.map(([event]) => [event.outcome, event.httpStatus])).toEqual([
      ['http-error', 503], ['network-error', null], ['timeout', null],
    ])
    expect(diagnostic.mock.calls[1][0]).toMatchObject({ phase: 'request', detail: 'network-or-cors' })
    expect(diagnostic.mock.calls[2][0]).toMatchObject({ phase: 'request', abortReason: null, errorName: 'TimeoutError' })
  })

  it('records safe server classifications without recording response text or credentials', async () => {
    const secret = 'https://example.test/api/secret-key?bbox=50,8,51,9'
    const busy = `runtime error: open64: 0 Success /osm3s_osm_base Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy. ${secret}`
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(busy, { status: 504 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ remark: busy, elements: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ remark: `unknown ${secret}`, elements: [] })))
      .mockResolvedValueOnce(new Response('{bad json'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [{ id: 1 }] })))
      .mockResolvedValueOnce(new Response(`<html>${busy}</html>`)))
    const events = vi.fn()
    const bounds = { south: 50, west: 8, north: 51, east: 9 }
    for (let i = 0; i < 6; i++) {
      await expect(fetchPlaces(bounds, ['spring'], new AbortController().signal, events)).rejects.toBeDefined()
    }
    expect(events.mock.calls.map(([event]) => [event.outcome, event.phase, event.detail])).toEqual([
      ['http-error', 'body', 'server-busy'],
      ['invalid-response', 'parse', 'server-busy'],
      ['invalid-response', 'parse', 'overpass-error'],
      ['invalid-response', 'parse', 'invalid-json'],
      ['invalid-response', 'parse', 'invalid-data'],
      ['invalid-response', 'parse', 'server-busy'],
    ])
    expect(JSON.stringify(events.mock.calls)).not.toContain('secret-key')
    expect(JSON.stringify(events.mock.calls)).not.toContain('50,8,51,9')
  })

  it('records a typed cancellation cause without accepting arbitrary abort messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) =>
      new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(options.signal?.reason)))))
    const events = vi.fn()
    const bounds = { south: 50, west: 8, north: 51, east: 9 }
    const controller = new AbortController()
    const pending = fetchPlaces(bounds, ['spring'], controller.signal, events)
    abortPlaces(controller, 'map-movement')
    await expect(pending).rejects.toBeDefined()
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'aborted', abortReason: 'map-movement' }))
    const other = new AbortController()
    const otherPending = fetchPlaces(bounds, ['spring'], other.signal, events)
    other.abort(new DOMException('secret-key', 'AbortError'))
    await expect(otherPending).rejects.toBeDefined()
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'aborted', abortReason: 'unknown' }))
    expect(JSON.stringify(events.mock.calls)).not.toContain('secret-key')
  })

  it('bounds HTTP error inspection and does not read error bodies when diagnostics are disabled', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const response = new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel }), { status: 503 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(new Response('secret', { status: 503 })))
    const events = vi.fn()
    const bounds = { south: 50, west: 8, north: 51, east: 9 }
    const pending = fetchPlaces(bounds, ['spring'], new AbortController().signal, events)
    const rejected = expect(pending).rejects.toBeInstanceOf(OverpassHttpError)
    await vi.advanceTimersByTimeAsync(1001)
    await rejected
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'http-error', detail: 'body-unavailable' }))
    expect(cancel).toHaveBeenCalled()
    await expect(fetchPlaces(bounds, ['spring'], new AbortController().signal, events, () => false))
      .rejects.toBeInstanceOf(OverpassHttpError)
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'request', detail: null }))
  })

  it('preserves the HTTP error if the diagnostic response body cannot be opened', async () => {
    const response = new Response('unavailable', { status: 503 })
    const reader = response.body!.getReader()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const events = vi.fn()
    await expect(fetchPlaces({ south: 50, west: 8, north: 51, east: 9 }, ['spring'],
      new AbortController().signal, events)).rejects.toMatchObject({ status: 503 })
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'http-error', detail: 'body-unavailable' }))
    reader.releaseLock()
  })

  it('reports invalid local inputs separately from network failures', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const diagnostic = vi.fn()
    await expect(fetchPlaces({ south: 50, west: 8, north: 51, east: 9 }, [], new AbortController().signal, diagnostic)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ phase: 'prepare', outcome: 'client-error', detail: 'invalid-request' }))
  })
})
