export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/decaritat/mapvento/releases/latest'
export const LATEST_RELEASE_URL = 'https://github.com/decaritat/Mapvento/releases/latest'

type ParsedVersion = {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export type AvailableUpdate = {
  currentVersion: string
  availableVersion: string
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim())
  if (!match) return null
  const core = match.slice(1, 4).map(Number)
  if (core.some((part) => !Number.isSafeInteger(part))) return null
  return {
    major: core[0],
    minor: core[1],
    patch: core[2],
    prerelease: match[4]?.split('.') ?? [],
  }
}

function comparePrerelease(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return left.length === right.length ? 0 : left.length === 0 ? 1 : -1
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === b) continue
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) return BigInt(a) < BigInt(b) ? -1 : 1
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
    return a < b ? -1 : 1
  }
  return left.length === right.length ? 0 : left.length < right.length ? -1 : 1
}

function isNewerVersion(candidate: ParsedVersion, current: ParsedVersion) {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (candidate[key] !== current[key]) return candidate[key] > current[key]
  }
  return comparePrerelease(candidate.prerelease, current.prerelease) > 0
}

export async function checkForUpdate(
  currentVersion: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AvailableUpdate | null> {
  const current = parseVersion(currentVersion)
  if (!current) throw new Error(`Gestartete Version ist ungültig: ${currentVersion}`)

  const response = await fetcher(LATEST_RELEASE_API_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  })
  if (!response.ok) throw new Error(`GitHub Release konnte nicht geladen werden (HTTP ${response.status}).`)

  const payload: unknown = await response.json()
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload) ||
      !('tag_name' in payload) || typeof payload.tag_name !== 'string') {
    throw new Error('Die GitHub-Release-Antwort enthält keinen gültigen Versions-Tag.')
  }
  const availableVersion = payload.tag_name.trim().replace(/^v(?=\d)/i, '')
  const available = parseVersion(availableVersion)
  if (!available) throw new Error(`Verfügbare Release-Version ist ungültig: ${payload.tag_name}`)
  return isNewerVersion(available, current) ? { currentVersion, availableVersion } : null
}
