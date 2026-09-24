import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LineCounter, parseDocument, type Document } from 'yaml'
import { fail, issue, type Issue } from '../issues.ts'
import { CONFIG_FILE, configSchema, type Config } from './schema.ts'

export interface LoadedConfig {
  config: Config
  file: string
}

/** Line of the deepest existing node on `path`, so missing keys point at their parent. */
export function lineOf(doc: Document, counter: LineCounter, path: readonly PropertyKey[], offset = 0): number | null {
  for (let depth = path.length; depth >= 0; depth--) {
    const node = depth === 0 ? doc.contents : doc.getIn(path.slice(0, depth), true)
    const range = (node as { range?: [number, number] } | undefined)?.range
    if (range) return counter.linePos(range[0]).line + offset
  }
  return null
}

export function parseConfig(text: string, file = CONFIG_FILE): { config?: Config; issues: Issue[] } {
  const counter = new LineCounter()
  const doc = parseDocument(text, { lineCounter: counter, prettyErrors: false })
  if (doc.errors.length > 0) {
    return {
      issues: doc.errors.map((e) =>
        issue('RK003', e.message.split('\n')[0] ?? e.message, {
          file,
          line: e.linePos?.[0].line ?? null,
          fix: 'Fix the YAML syntax at the reported line',
        }),
      ),
    }
  }
  const result = configSchema.safeParse(doc.toJS() ?? {})
  if (result.success) return { config: result.data, issues: [] }
  return {
    issues: result.error.issues.map((i) => {
      const at = i.path.length > 0 ? i.path.join('.') : '(root)'
      return issue('RK002', `${at}: ${i.message}`, {
        file,
        line: lineOf(doc, counter, i.path),
        fix: `Edit "${at}" in ${file}; run "release-kit describe --json" for the config schema`,
      })
    }),
  }
}

export function loadConfig(root: string): LoadedConfig {
  const path = join(root, CONFIG_FILE)
  if (!existsSync(path)) {
    throw fail.environment('RK001', `${CONFIG_FILE} not found in ${root}`, {
      fix: 'release-kit init --preset library',
    })
  }
  const { config, issues } = parseConfig(readFileSync(path, 'utf8'))
  if (!config) throw fail.validation(issues)
  return { config, file: CONFIG_FILE }
}

export function tryLoadConfig(root: string): Config | null {
  try {
    return loadConfig(root).config
  } catch {
    return null
  }
}
