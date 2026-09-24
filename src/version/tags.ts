import semver from 'semver'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const formatTemplate = (template: string, version: string) => template.replaceAll('{version}', version)

/** Versions encoded in tags that match the tag template. */
export function versionsFromTags(tags: string[], template: string): string[] {
  const [prefix, suffix] = template.split('{version}').map(escape) as [string, string]
  const pattern = new RegExp(`^${prefix}(.+)${suffix}$`)
  return tags.flatMap((tag) => {
    const version = pattern.exec(tag)?.[1]
    return version && semver.valid(version) ? [version] : []
  })
}

export function latestStable(versions: string[]): string | null {
  const stable = versions.filter((v) => semver.prerelease(v) === null)
  return stable.length > 0 ? semver.rsort(stable)[0]! : null
}

/** Next `<base>-<channel>.N`, continuing after the highest existing N for that base and channel. */
export function nextPrerelease(base: string, channel: string, versions: string[]): string {
  const numbers = versions.flatMap((v) => {
    const parsed = semver.parse(v)
    if (!parsed || `${parsed.major}.${parsed.minor}.${parsed.patch}` !== base) return []
    const [id, n] = parsed.prerelease
    return id === channel && typeof n === 'number' && parsed.prerelease.length === 2 ? [n] : []
  })
  const n = numbers.length > 0 ? Math.max(...numbers) + 1 : 0
  return `${base}-${channel}.${n}`
}
