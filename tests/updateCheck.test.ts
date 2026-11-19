import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate, LATEST_RELEASE_API_URL } from '../src/features/update-check/updateCheck'

function response(tag_name: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => ({ tag_name }) } as Response
}

describe('startup update check', () => {
  it('requests the latest GitHub release and reports a newer version', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('v1.4.0'))
    const update = await checkForUpdate('1.3.9', new AbortController().signal, fetcher)
    expect(fetcher).toHaveBeenCalledWith(LATEST_RELEASE_API_URL, expect.objectContaining({
      headers: { Accept: 'application/vnd.github+json' },
    }))
    expect(update).toEqual({ currentVersion: '1.3.9', availableVersion: '1.4.0' })
  })

  it('does not report the same or an older release as an update', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('v1.3.0'))
    await expect(checkForUpdate('1.3.0', new AbortController().signal, fetcher)).resolves.toBeNull()
    fetcher.mockResolvedValue(response('v1.2.9'))
    await expect(checkForUpdate('1.3.0', new AbortController().signal, fetcher)).resolves.toBeNull()
  })

  it('recognizes a stable release as newer than a prerelease and rejects malformed release data', async () => {
    const fetcher = vi.fn().mockResolvedValue(response('1.3.0'))
    await expect(checkForUpdate('1.3.0-beta.2', new AbortController().signal, fetcher))
      .resolves.toMatchObject({ availableVersion: '1.3.0' })
    fetcher.mockResolvedValue(response('not-a-version'))
    await expect(checkForUpdate('1.3.0', new AbortController().signal, fetcher)).rejects.toThrow('ungültig')
  })

  it('surfaces HTTP failures instead of treating them as no update', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(null, false))
    await expect(checkForUpdate('1.3.0', new AbortController().signal, fetcher)).rejects.toThrow('HTTP 503')
  })
})
