import picomatch from 'picomatch'
import { bumpRank, type Config } from '../config/schema.ts'
import type { Fragment } from '../fragments/parse.ts'
import { issue, warning, type Issue } from '../issues.ts'

export interface PrTitle {
  type: string
  breaking: boolean
}

const CONVENTIONAL = /^(?<type>[a-zA-Z]+)(?:\([^()]*\))?(?<bang>!)?: \S/

export const parsePrTitle = (title: string): PrTitle | null => {
  const match = CONVENTIONAL.exec(title.trim())
  return match?.groups ? { type: match.groups.type!.toLowerCase(), breaking: Boolean(match.groups.bang) } : null
}

const addHint = (kind: string) => `release-kit add --kind ${kind} --body "<what users notice>"`

/** The title's kind must be present and carry the highest bump among the PR's fragments. */
export function checkPrTitle(title: string, fragments: Fragment[], config: Config): Issue[] {
  const parsed = parsePrTitle(title)
  if (!parsed)
    return [issue('RK013', `PR title "${title}" is not a Conventional Commits title`, {
      fix: `Rename the PR to "<type>: <summary>", e.g. "fix: …"; types: ${Object.keys(config.kinds).join(', ')}`,
    })]
  const expected = parsed.breaking
    ? Object.entries(config.kinds).filter(([, k]) => k.bump === 'major').map(([name]) => name)
    : parsed.type in config.kinds
      ? [parsed.type]
      : []
  const bumpOf = (f: Fragment) => config.kinds[String(f.data.kind)]?.bump ?? 'none'
  const maxRank = Math.max(-1, ...fragments.map((f) => bumpRank(bumpOf(f))))
  const top = fragments.find((f) => bumpRank(bumpOf(f)) === maxRank)
  const label = parsed.breaking ? `${parsed.type}!` : parsed.type

  if (expected.length === 0) {
    const releasing = fragments.find((f) => bumpOf(f) !== 'none')
    return releasing
      ? [warning('RK031', `PR title type "${label}" implies no release, but fragment kind is "${String(releasing.data.kind)}"`, {
          file: releasing.file,
          line: releasing.lines.kind ?? 2,
          fix: `Rename the PR to "${String(releasing.data.kind)}: …", or change the fragment kind`,
        })]
      : []
  }
  if (fragments.length === 0) {
    const kind = expected[0]!
    return config.kinds[kind]!.bump === 'none'
      ? []
      : [issue('RK030', `PR title type is "${label}" but the PR has no change fragment`, { fix: addHint(kind) })]
  }
  const matching = fragments.filter((f) => expected.includes(String(f.data.kind)))
  const expectedRank = Math.max(...expected.map((k) => bumpRank(config.kinds[k]!.bump)))
  if (matching.length > 0 && expectedRank >= maxRank) return []
  const target = top ?? fragments[0]!
  const kind = String(target.data.kind)
  const retitle = bumpOf(target) === 'major' ? `${parsed.type}!` : kind
  return [issue('RK012', `PR title type is "${label}", but fragment kind is "${kind}"`, {
    file: target.file,
    line: target.lines.kind ?? 2,
    fix: `Change the kind to ${expected.join(' or ')}, or rename the PR to "${retitle}: …"`,
  })]
}

/** Requires a fragment when the PR touches configured paths, unless its title type is exempt. */
export function checkRequiredChange(
  changed: string[],
  prFragments: Fragment[],
  config: Config,
  title: PrTitle | null,
): Issue[] {
  const rule = config.checks.requireChange
  if (!rule || rule.paths.length === 0 || prFragments.length > 0) return []
  if (title && rule.exemptTitleTypes.includes(title.type)) return []
  const isMatch = picomatch(rule.paths, { dot: true })
  const hit = changed.find((path) => isMatch(path))
  if (!hit) return []
  const noRelease = Object.entries(config.kinds).find(([, k]) => k.bump === 'none')?.[0]
  return [issue('RK030', `Changes under ${rule.paths.join(', ')} need a change fragment (first: ${hit})`, {
    file: hit,
    fix: `${addHint('<kind>')}${noRelease ? `; use --kind ${noRelease} for changes users cannot notice` : ''}`,
  })]
}
