import { defaultPoiIcon } from '../../domain/poiIconIds'
import type { MapPoint } from '../../domain/routeModel'
import { PLACE_KINDS, type Place } from './places'

export function createPoiDraftFromOsmPlace(place: Place, id: string): MapPoint {
  const matchingKind = PLACE_KINDS.find(
    (kind) => place.tags[kind.key] === kind.value,
  )

  return {
    id,
    name: place.tags.name?.trim(),
    description: place.tags.description?.trim().slice(0, 180) ?? '',
    coordinate: [place.longitude, place.latitude],
    source: 'poi',
    icon: matchingKind?.icon ?? defaultPoiIcon,
    osmReference: { type: place.type, id: place.id },
  }
}
