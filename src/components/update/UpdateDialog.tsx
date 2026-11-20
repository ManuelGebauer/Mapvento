import { useEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { LATEST_RELEASE_URL } from '../../features/update-check/updateCheck'
import { openExternalUrl } from '../../integrations/desktop/externalUrl'
import './UpdateDialog.css'

export function UpdateDialog({
  currentVersion,
  availableVersion,
  onClose,
}: {
  currentVersion: string
  availableVersion: string
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    dialogRef.current?.focus()
    return () => { if (previous instanceof HTMLElement) setTimeout(() => previous.focus(), 0) }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const buttons = dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
    if (!buttons.length) return
    if (event.shiftKey && (document.activeElement === buttons[0] || document.activeElement === dialogRef.current)) {
      event.preventDefault()
      buttons[buttons.length - 1].focus()
    } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
      event.preventDefault()
      buttons[0].focus()
    }
  }

  return createPortal(
    <div className="update-backdrop">
      <div
        ref={dialogRef}
        className="update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 id="update-title">Software-Update</h2>
        <p>Eine neue Version von Mapvento ist verfügbar.</p>
        <div className="version-info">
          <span>Gestartete Version</span>
          <span>{currentVersion}</span>

          <span>Verfügbare Version</span>
          <span>{availableVersion}</span>
        </div>
        <footer>
          <button type="button" onClick={onClose}>Schließen</button>
          <button type="button" className="update-download" onClick={() => { void openExternalUrl(LATEST_RELEASE_URL) }}>Zum Download</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
