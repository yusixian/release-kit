import { requiresUpgrade, type Config } from '../config/schema.ts'
import { issue, warning, type Issue } from '../issues.ts'
import type { Fragment } from './parse.ts'

const BUILTIN_FIELDS = new Set(['kind', 'pr'])

export function parsePr(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return undefined
  const n = typeof value === 'string' ? Number(value.replace(/^#/, '')) : value
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

export function validateFragment(fragment: Fragment, config: Config): Issue[] {
  const issues: Issue[] = []
  const { file, data, lines } = fragment
  const lineOf = (key: string) => lines[key] ?? 2
  const kinds = Object.keys(config.kinds)
  const kind = typeof data.kind === 'string' ? data.kind : undefined
  const kindConfig = kind ? config.kinds[kind] : undefined

  if (!kind || !kindConfig) {
    issues.push(
      issue('RK011', kind ? `Unknown kind "${kind}"` : 'Missing "kind"', {
        file,
        line: kind ? lineOf('kind') : 2,
        fix: `Set "kind" to one of: ${kinds.join(', ')}`,
      }),
    )
  }

  if (parsePr(data.pr) === null) {
    issues.push(issue('RK021', `"pr" must be a positive integer, got ${JSON.stringify(data.pr)}`, {
      file,
      line: lineOf('pr'),
      fix: 'Set "pr" to the pull request number, e.g. "pr: 128", or remove it',
    }))
  }

  for (const [name, spec] of Object.entries(config.fields)) {
    const value = data[name]
    const required = spec.required || (kind !== undefined && spec.requiredFor.includes(kind))
    if (value === undefined || value === null || value === '') {
      if (required) {
        const example = spec.enum ? spec.enum.join(' | ') : '<value>'
        issues.push(issue('RK015', `Missing field "${name}"${kind ? ` required for kind "${kind}"` : ''}`, {
          file,
          line: fragment.frontmatterEnd,
          fix: `Add "${name}: ${example}" to the frontmatter`,
        }))
      }
      continue
    }
    if (spec.enum && !spec.enum.includes(String(value))) {
      issues.push(issue('RK014', `"${name}" must be one of ${spec.enum.join(', ')}, got "${String(value)}"`, {
        file,
        line: lineOf(name),
        fix: `Set "${name}" to one of: ${spec.enum.join(', ')}`,
      }))
    }
  }

  for (const key of Object.keys(data)) {
    if (BUILTIN_FIELDS.has(key) || key in config.fields) continue
    issues.push(warning('RK016', `Field "${key}" is not declared in the config`, {
      file,
      line: lineOf(key),
      fix: `Remove "${key}" or declare it under "fields" in release-kit.yaml`,
    }))
  }

  if (fragment.summary === '') {
    issues.push(issue('RK018', 'Fragment body is empty', {
      file,
      line: fragment.bodyLine,
      fix: 'Describe the change from the user\'s point of view below the frontmatter',
    }))
  }

  if (kindConfig && requiresUpgrade(kindConfig) && !fragment.upgrade) {
    issues.push(issue('RK017', `Kind "${kind}" requires an upgrade section`, {
      file,
      line: fragment.bodyLine,
      fix: 'Add a "## Upgrade" (or "## 升级") section explaining how users migrate',
    }))
  }

  issues.push(...checkBody(fragment, config))
  return issues
}

function checkBody(fragment: Fragment, config: Config): Issue[] {
  const issues: Issue[] = []
  const { maxLength, discourage } = config.checks.body
  if (maxLength !== undefined && fragment.summary.length > maxLength) {
    issues.push(issue('RK019', `Body is ${fragment.summary.length} characters; the limit is ${maxLength}`, {
      file: fragment.file,
      line: fragment.bodyLine,
      fix: `Shorten the description to at most ${maxLength} characters; move migration details to the upgrade section`,
    }))
  }
  const patterns = discourage.map((source) => ({ source, regex: new RegExp(source) }))
  fragment.summary.split('\n').forEach((text, i) => {
    const hit = patterns.find((p) => p.regex.test(text))
    if (!hit) return
    issues.push(warning('RK020', `Body line matches discouraged pattern ${hit.source}`, {
      file: fragment.file,
      line: fragment.bodyLine + i,
      fix: 'Describe what users notice instead of file paths or function names',
    }))
  })
  return issues
}
