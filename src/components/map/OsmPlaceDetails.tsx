import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Place } from '../../features/osm-places/places'
import { ExternalLink } from '../shared/ExternalLink'

type Selection = { place: Place; anchor: { x: number; y: number; bounds: DOMRect } }
type PopupPosition = { left: number; top: number }

function externalHttpUrl(value: string): string | null {
  try {
    const normalized = value.trim().replace(/^File:(?=https?:\/\/)/i, '')
    const url = new URL(normalized)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname ||
      url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

function tagUrl(key: string, value: string): string | null {
  const url = externalHttpUrl(value)
  if (url) return url
  const file = key === 'wikimedia_commons' ? /^File:(.+)$/i.exec(value.trim())?.[1] : undefined
  if (!file) return null
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file).replace(/%20/g, '_')}`
}

function isImageTag(key: string): boolean {
  return /^image(?::\d+)?$/i.test(key)
}

function canPreviewImage(url: string): boolean {
  return /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(new URL(url).pathname)
}

function popupPosition(element: HTMLElement, anchor: Selection['anchor']): PopupPosition {
  const { bounds } = anchor
  const margin = 8
  const rect = element.getBoundingClientRect()
  const width = Math.min(rect.width || 360, Math.max(0, bounds.width - margin * 2))
  const height = Math.min(rect.height || 420, Math.max(0, bounds.height - margin * 2))
  return {
    left: Math.max(bounds.left + margin, Math.min(anchor.x + 14, bounds.right - width - margin)),
    top: Math.max(bounds.top + margin, Math.min(anchor.y - height / 2, bounds.bottom - height - margin)),
  }
}

function osmObjectUrl(place: Place): string {
  return `https://www.openstreetmap.org/${place.type}/${place.id}`
}

export function OsmPlaceDetails({ selection, onClose }: { selection: Selection | null; onClose: () => void }) {
  if (!selection) return null
  return <OsmPlaceDetailsDialog key={`${selection.place.type}/${selection.place.id}`}
    selection={selection} onClose={onClose} />
}

function OsmPlaceDetailsDialog({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const { place, anchor } = selection
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [previewUrls, setPreviewUrls] = useState<Set<string>>(() => new Set())
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set())
  const [position, setPosition] = useState<PopupPosition | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    return () => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus()
      previousFocus.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    setPosition(popupPosition(element, anchor))
  }, [anchor, failedUrls, previewUrls])

  useEffect(() => {
    const reposition = () => {
      if (dialog.current) setPosition(popupPosition(dialog.current, anchor))
    }
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [anchor])

  const tags = Object.entries(place.tags)
  const name = place.tags.name?.trim()

  return createPortal(<div className="osm-place-details-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section ref={dialog} className="osm-place-details" role="dialog" aria-modal="true"
      style={{
        left: position?.left ?? anchor.x,
        top: position?.top ?? anchor.y,
        maxWidth: Math.min(360, window.innerWidth - 24, Math.max(0, anchor.bounds.width - 16)),
        maxHeight: Math.min(420, window.innerHeight * 0.7, Math.max(0, anchor.bounds.height - 16)),
        visibility: position ? 'visible' : 'hidden',
      }}
      aria-labelledby="osm-place-details-title" onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        } else if (event.key === 'Tab') {
          const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
          )
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }
      }}>
      <header className="osm-place-details-header">
        <div>
          <h2 id="osm-place-details-title">{name || 'OSM-Ort'}</h2>
          <p>
            {place.type} {place.id}
            {' · '}{place.latitude}, {place.longitude}
          </p>
          <p><ExternalLink url={osmObjectUrl(place)}>In OpenStreetMap öffnen</ExternalLink></p>
        </div>
        <button ref={closeButton} type="button" className="map-layer-close"
          aria-label="Ortsdetails schließen" onClick={onClose}>×</button>
      </header>
      <div className="osm-place-details-content">
        <h3>OSM-Tags ({tags.length})</h3>
        {tags.length
          ? <table>
            <thead><tr><th scope="col">Schlüssel</th><th scope="col">Wert</th></tr></thead>
            <tbody>{tags.map(([key, rawValue]) => {
              const value = typeof rawValue === 'string' ? rawValue : ''
              const url = tagUrl(key, value)
              const imageUrl = url && isImageTag(key) && canPreviewImage(url) ? url : null
              return <tr key={key}>
                <th scope="row">{key}</th>
                <td>
                  {value
                    ? url ? <ExternalLink url={url}>{value}</ExternalLink> : value
                    : <span className="osm-place-missing-value">Kein Wert angegeben</span>}
                  {imageUrl && (previewUrls.has(imageUrl)
                    ? failedUrls.has(imageUrl)
                      ? <p className="osm-place-image-error" role="status">Bildvorschau konnte nicht geladen werden.</p>
                      : <img className="osm-place-image-preview" src={imageUrl} alt={`Vorschaubild: ${name || key}`}
                        loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
                        onError={() => setFailedUrls((current) => new Set(current).add(imageUrl))} />
                    : <button type="button" className="osm-place-image-load"
                      onClick={() => setPreviewUrls((current) => new Set(current).add(imageUrl))}>
                      Bildvorschau laden
                    </button>)}
                </td>
              </tr>
            })}</tbody>
          </table>
          : <p>Für dieses Objekt wurden keine Tags geliefert.</p>}
      </div>
    </section>
  </div>, document.body)
}
