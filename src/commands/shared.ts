import { loadConfig } from '../config/load.ts'
import type { Config } from '../config/schema.ts'
import { loadFragments } from '../fragments/load.ts'
import type { Fragment } from '../fragments/parse.ts'
import { requireRepo } from '../git.ts'
import { fail, hasErrors, type Issue } from '../issues.ts'
import { STABLE, type Baseline } from '../version/plan.ts'
import { formatTemplate } from '../version/tags.ts'

export interface Project {
  config: Config
  fragments: Fragment[]
  issues: Issue[]
}

/** Config plus valid fragments; any fragment error aborts with exit code 1. */
export function loadProject(root: string): Project {
  const { config } = loadConfig(root)
  const { fragments, issues } = loadFragments(root, config)
  if (hasErrors(issues)) throw fail.validation(issues)
  return { config, fragments, issues }
}

export function resolveChannel(config: Config, channel: string | undefined, command: string): string {
  const name = channel ?? STABLE
  const known = [STABLE, ...Object.keys(config.versioning.channels)]
  if (!known.includes(name))
    throw fail.usage('RK901', `Unknown channel "${name}"`, `release-kit ${command} --channel ${known.join('|')}`)
  return name
}

/** Prerelease numbering is derived from tags, so a checkout without tags would silently restart at .0. */
export function requireTags(root: string, config: Config, baseline: Baseline, channel: string): void {
  if (channel === STABLE) return
  requireRepo(root)
  if (baseline.tagVersions.length === 0)
    throw fail.environment('RK042', `No tags matching "${config.versioning.tag}" found; prerelease numbers come from tags`, {
      fix: `git fetch --tags, or tag the current release: git tag ${formatTemplate(config.versioning.tag, baseline.current)}`,
    })
}
