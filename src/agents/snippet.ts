import type { Config } from '../config/schema.ts'
import { builtinTemplates } from '../notes/templates.ts'

export const MARKER_START = '<!-- release-kit:start -->'
export const MARKER_END = '<!-- release-kit:end -->'

export function agentsSnippet(config: Config): string {
  const titles = builtinTemplates['default-en']!.titles
  const kindRows = Object.entries(config.kinds).map(
    ([name, k]) => `| \`${name}\` | ${k.bump} | ${k.title ?? titles[name] ?? (k.notes ? name : 'Not shown in release notes')} |`,
  )
  const rule = config.checks.requireChange
  const required = rule && rule.paths.length > 0
    ? `- A fragment is required when a PR touches ${rule.paths.map((p) => `\`${p}\``).join(', ')}, unless the PR title type is ${rule.exemptTitleTypes.map((t) => `\`${t}\``).join(', ')}.`
    : '- Add a fragment for every change users can notice.'
  const fields = Object.entries(config.fields).map(([name, f]) => {
    const values = f.enum ? ` (${f.enum.join(' | ')})` : ''
    const when = f.required ? 'always required' : f.requiredFor.length > 0 ? `required for ${f.requiredFor.join(', ')}` : 'optional'
    return `- Field \`${name}\`${values}: ${when}. Pass it with \`--field ${name}=<value>\`.`
  })
  const titleRule =
    config.checks.prTitle === 'conventional'
      ? ['- The PR title uses Conventional Commits and its type matches the highest fragment kind (`feat!:` for breaking).']
      : []
  const examples = Object.keys(config.kinds)
    .filter((kind) => kind === 'fix' || kind === 'feat')
    .map((kind) => {
      const flags = Object.entries(config.fields)
        .filter(([, f]) => f.required || f.requiredFor.includes(kind))
        .map(([name, f]) => ` --field ${name}=${f.enum?.[0] ?? '<value>'}`)
        .join('')
      return `release-kit add --kind ${kind}${flags} --body "<what users notice>"`
    })
  return [
    MARKER_START,
    '## Release notes (release-kit)',
    '',
    `Every user-visible change needs a change fragment in \`${config.changes}/\`.`,
    '',
    required,
    '- Write the body for users: what they notice, not file paths or function names.',
    '- Kinds that bump major need a `## Upgrade` (or `## 升级`) section with migration steps.',
    ...titleRule,
    ...fields,
    '',
    '| kind | bump | use for |',
    '|---|---|---|',
    ...kindRows,
    '',
    '```sh',
    ...examples,
    'release-kit check --base origin/main --pr-title "fix: keep feedback offline"',
    '```',
    '',
    'Run `release-kit check` before committing and fix every issue using its `fix` hint. Use `--json` for machine-readable output and `release-kit describe --json` for the full command and schema reference. If `release-kit` is not installed, use `npx @coszone/release-kit`.',
    MARKER_END,
  ].join('\n')
}

/** Replaces the marked block in place, or appends it when the markers are absent. */
export function upsertBlock(existing: string | null, block: string): { content: string; action: 'created' | 'updated' | 'appended' | 'unchanged' } {
  if (existing === null) return { content: `${block}\n`, action: 'created' }
  const start = existing.indexOf(MARKER_START)
  const end = existing.indexOf(MARKER_END)
  if (start !== -1 && end > start) {
    const content = existing.slice(0, start) + block + existing.slice(end + MARKER_END.length)
    return { content, action: content === existing ? 'unchanged' : 'updated' }
  }
  const separator = existing.length === 0 || existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
  return { content: `${existing}${separator}${block}\n`, action: 'appended' }
}
