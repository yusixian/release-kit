import semver from 'semver'
import { bumpRank, type Bump, type Config } from '../config/schema.ts'
import type { Fragment } from '../fragments/parse.ts'
import { parsePr } from '../fragments/validate.ts'
import { fail, warning, type Issue } from '../issues.ts'
import { isRepo, listTags } from '../git.ts'
import { readVersion } from './files.ts'
import { formatTemplate, latestStable, nextPrerelease, versionsFromTags } from './tags.ts'

export const STABLE = 'stable'

export interface Reason {
  change: string
  kind: string
  bump: Bump
  effective: Bump
}

export interface ChangeSummary {
  id: string
  kind: string
  pr: number | null
  [field: string]: unknown
}

export interface Plan {
  channel: string
  current: string
  next: string | null
  bump: Bump
  source: 'fragments' | 'explicit'
  pre1Adjusted: boolean
  reason: Reason[]
  changes: ChangeSummary[]
  tag: string | null
  notesPath: string | null
}

export interface Baseline {
  current: string
  tagVersions: string[]
  issues: Issue[]
}

/** Current version from the first version file (or the latest stable tag when no files are configured). */
export function resolveBaseline(root: string, config: Config): Baseline {
  const tagVersions = isRepo(root) ? versionsFromTags(listTags(root), config.versioning.tag) : []
  const latest = latestStable(tagVersions)
  const file = config.versioning.files[0]
  if (!file) {
    if (!latest)
      throw fail.environment('RK042', 'No version files configured and no release tags found', {
        fix: `git fetch --tags, or create the first tag: git tag ${formatTemplate(config.versioning.tag, '0.1.0')}`,
      })
    return { current: latest, tagVersions, issues: [] }
  }
  const current = readVersion(root, file)
  const issues =
    latest && semver.gt(latest, current)
      ? [
          warning('RK043', `${file.path} is at ${current} but tag ${formatTemplate(config.versioning.tag, latest)} exists`, {
            file: file.path,
            fix: `Set "${file.key}" in ${file.path} to ${latest} if that release was published`,
          }),
        ]
      : []
  return { current, tagVersions, issues }
}

export function computeBump(fragments: Fragment[], config: Config, current: string) {
  const pre1 = semver.major(current) === 0
  const entries = fragments.map((f) => {
    const kind = String(f.data.kind)
    const bump = config.kinds[kind]?.bump ?? 'none'
    const effective: Bump = pre1 && bump === 'major' ? config.versioning.pre1.breaking : bump
    return { change: f.id, kind, bump, effective }
  })
  const max = (key: 'bump' | 'effective') =>
    entries.reduce<Bump>((acc, e) => (bumpRank(e[key]) > bumpRank(acc) ? e[key] : acc), 'none')
  const bump = max('effective')
  return {
    bump,
    pre1Adjusted: max('bump') !== bump,
    reason: bump === 'none' ? [] : entries.filter((e) => e.effective === bump),
  }
}

export function summarize(fragments: Fragment[], config: Config): ChangeSummary[] {
  return fragments.map((f) => {
    const fields = Object.fromEntries(Object.keys(config.fields).map((name) => [name, f.data[name] ?? null]))
    return { id: f.id, kind: String(f.data.kind), pr: parsePr(f.data.pr) ?? null, ...fields }
  })
}

export interface PlanOptions {
  channel: string
  baseline: Baseline
  explicitVersion?: string
}

export function computePlan(fragments: Fragment[], config: Config, options: PlanOptions): Plan {
  const { current } = options.baseline
  const { bump, pre1Adjusted, reason } = computeBump(fragments, config, current)
  let next = bump === 'none' ? null : semver.inc(current, bump)
  if (options.explicitVersion) next = options.explicitVersion
  if (next && options.channel !== STABLE) {
    const parsed = semver.parse(next)!
    next = nextPrerelease(`${parsed.major}.${parsed.minor}.${parsed.patch}`, options.channel, options.baseline.tagVersions)
  }
  return {
    channel: options.channel,
    current,
    next,
    bump,
    source: options.explicitVersion ? 'explicit' : 'fragments',
    pre1Adjusted,
    reason,
    changes: summarize(fragments, config),
    tag: next ? formatTemplate(config.versioning.tag, next) : null,
    notesPath: next && options.channel === STABLE ? `${config.notes.dir}/${formatTemplate(config.notes.file, next)}` : null,
  }
}
