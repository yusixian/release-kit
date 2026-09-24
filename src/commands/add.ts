import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { stringify } from 'yaml'
import { list, str, type CommandSpec, type Context, type Values } from '../cli/spec.ts'
import { loadConfig } from '../config/load.ts'
import type { Config } from '../config/schema.ts'
import { fragmentPath } from '../fragments/load.ts'
import { parseFragment } from '../fragments/parse.ts'
import { validateFragment } from '../fragments/validate.ts'
import { fail, hasErrors } from '../issues.ts'
import { prFromEnv } from '../pr.ts'

const ID = /^[a-z0-9][a-z0-9._-]*$/

function readBody(ctx: Context, values: Values): string {
  const body = str(values, 'body')
  const bodyFile = str(values, 'body-file')
  if ((body === undefined) === (bodyFile === undefined))
    throw fail.usage('RK902', 'Pass exactly one of --body or --body-file', 'release-kit add --kind fix --body "What users notice"')
  if (body !== undefined) return body
  if (bodyFile === '-') {
    if (ctx.io.stdinIsTTY)
      throw fail.usage('RK902', '--body-file - needs piped input; stdin is a terminal', 'echo "What users notice" | release-kit add --kind fix --body-file -')
    return ctx.io.readStdin()
  }
  const path = resolve(ctx.root, bodyFile!)
  if (!existsSync(path)) throw fail.usage('RK902', `Body file ${bodyFile} not found`, 'release-kit add --kind fix --body-file <path>')
  return readFileSync(path, 'utf8')
}

function parseFields(config: Config, pairs: string[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    const key = pair.slice(0, eq)
    if (eq <= 0 || !(key in config.fields)) {
      const declared = Object.keys(config.fields)
      throw fail.usage(
        'RK902',
        `Invalid --field "${pair}"`,
        declared.length > 0 ? `Use --field <name>=<value> with one of: ${declared.join(', ')}` : 'No custom fields are declared in release-kit.yaml',
      )
    }
    fields[key] = pair.slice(eq + 1)
  }
  return fields
}

function fieldFix(config: Config, message: string): string {
  const name = /"([^"]+)"/.exec(message)?.[1] ?? '<name>'
  const values = config.fields[name]?.enum?.join('|') ?? 'value'
  return `Pass --field ${name}=<${values}>`
}

function autoId(kind: string, body: string, content: string): string {
  const firstLine = body.split('\n').find((l) => l.trim() !== '') ?? ''
  const slug = firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-')
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 6)
  return `${slug.length >= 3 ? slug : kind}-${hash}`
}

export const addCommand: CommandSpec = {
  name: 'add',
  summary: 'Create a change fragment; the same id and content never produce a duplicate',
  writes: 'yes',
  options: {
    kind: { type: 'string', valueName: 'kind', required: true, description: 'Change kind declared in release-kit.yaml' },
    body: { type: 'string', valueName: 'text', description: 'User-facing description (Markdown)' },
    'body-file': { type: 'string', valueName: 'path', description: 'Read the body from a file, or "-" for stdin' },
    id: { type: 'string', valueName: 'id', description: 'Fragment id (file name); defaults to a slug plus a content hash' },
    pr: { type: 'string', valueName: 'number', description: 'Pull request number; defaults to RELEASE_KIT_PR or a pull_request GITHUB_REF' },
    field: { type: 'string', valueName: 'name=value', multiple: true, description: 'Custom frontmatter field' },
  },
  examples: [
    'release-kit add --kind fix --body "Saving feedback no longer fails offline."',
    'release-kit add --kind feat --field docs=updated --body-file - < change.md',
  ],
  run(ctx, values) {
    const { config } = loadConfig(ctx.root)
    const kind = str(values, 'kind')!
    if (!(kind in config.kinds))
      throw fail.usage('RK902', `Unknown kind "${kind}"`, `Use --kind with one of: ${Object.keys(config.kinds).join(', ')}`)
    const body = readBody(ctx, values).trim()
    const fields = parseFields(config, list(values, 'field'))
    const option = str(values, 'pr')
    const pr = option !== undefined ? (/^\d+$/.test(option) ? Number(option) : option) : prFromEnv(ctx.io.env)
    const frontmatter = { kind, ...fields, ...(pr !== null && { pr }) }
    const content = `---\n${stringify(frontmatter, { lineWidth: 0 })}---\n\n${body}\n`

    const explicit = str(values, 'id')
    if (explicit !== undefined && !ID.test(explicit))
      throw fail.usage('RK902', `Invalid id "${explicit}"`, 'Use lowercase letters, digits, ".", "_" and "-", starting with a letter or digit')
    const id = explicit ?? autoId(kind, body, content)
    const file = fragmentPath(config, id)
    const { fragment, issues } = parseFragment(content, file, id)
    const allIssues = [...issues, ...(fragment ? validateFragment(fragment, config) : [])].map((i) =>
      i.code === 'RK015' ? { ...i, fix: fieldFix(config, i.message) } : i,
    )
    if (hasErrors(allIssues)) throw fail.validation(allIssues)

    const path = join(ctx.root, file)
    const previous = existsSync(path) ? readFileSync(path, 'utf8') : null
    const action = previous === null ? 'created' : previous === content ? 'unchanged' : 'updated'
    if (action !== 'unchanged') {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
    return {
      data: { id, file, action, frontmatter, prSource: option !== undefined ? 'option' : pr !== null ? 'env' : null },
      text: `${action} ${file}`,
      issues: allIssues,
    }
  },
}
