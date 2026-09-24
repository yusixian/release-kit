import { isMap, isScalar, LineCounter, parseDocument } from 'yaml'
import { issue, type Issue } from '../issues.ts'

export interface Fragment {
  id: string
  file: string
  data: Record<string, unknown>
  /** 1-based line of each frontmatter key in the file. */
  lines: Record<string, number>
  frontmatterEnd: number
  body: string
  bodyLine: number
  summary: string
  upgrade: string | null
}

const UPGRADE_HEADING = /^##[ \t]+(upgrade|升级)[ \t]*$/im

export function splitUpgrade(body: string): { summary: string; upgrade: string | null } {
  const match = UPGRADE_HEADING.exec(body)
  if (!match) return { summary: body.trim(), upgrade: null }
  return {
    summary: body.slice(0, match.index).trim(),
    upgrade: body.slice(match.index + match[0].length).trim(),
  }
}

export function parseFragment(text: string, file: string, id: string): { fragment?: Fragment; issues: Issue[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const invalid = (message: string, line: number | null = 1) => ({
    issues: [
      issue('RK010', message, {
        file,
        line,
        fix: 'Start the file with a "---" frontmatter block containing "kind: <kind>", closed by "---"',
      }),
    ],
  })
  if (lines[0]?.trim() !== '---') return invalid('Fragment must start with a "---" frontmatter block')
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end === -1) return invalid('Frontmatter block is not closed with "---"')

  const counter = new LineCounter()
  const doc = parseDocument(lines.slice(1, end).join('\n'), { lineCounter: counter, prettyErrors: false })
  const error = doc.errors[0]
  if (error) return invalid(`Frontmatter is not valid YAML: ${error.message.split('\n')[0]}`, (error.linePos?.[0].line ?? 0) + 1)
  const contents = doc.contents
  if (contents !== null && !isMap(contents)) return invalid('Frontmatter must be a YAML mapping', 2)

  const keyLines: Record<string, number> = {}
  for (const pair of contents?.items ?? []) {
    if (isScalar(pair.key) && pair.key.range) keyLines[String(pair.key.value)] = counter.linePos(pair.key.range[0]).line + 1
  }
  const body = lines.slice(end + 1).join('\n')
  const leading = body.length - body.trimStart().length
  const bodyLine = end + 2 + (body.slice(0, leading).match(/\n/g)?.length ?? 0)
  return {
    fragment: {
      id,
      file,
      data: (doc.toJS() as Record<string, unknown> | null) ?? {},
      lines: keyLines,
      frontmatterEnd: end + 1,
      body: body.trim(),
      bodyLine,
      ...splitUpgrade(body),
    },
    issues: [],
  }
}
