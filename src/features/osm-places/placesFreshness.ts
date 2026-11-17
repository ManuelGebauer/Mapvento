import type { CachedPlaces } from './placesCache'

export const PLACES_MAX_AGE = 14 * 24 * 60 * 60 * 1000

export function isPlacesEntryFresh(entry: CachedPlaces, now = Date.now()): boolean {
  return entry.downloadedAt <= now && now - entry.downloadedAt < PLACES_MAX_AGE
}
