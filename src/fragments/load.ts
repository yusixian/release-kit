import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config/schema.ts'
import type { Issue } from '../issues.ts'
import { parseFragment, type Fragment } from './parse.ts'
import { validateFragment } from './validate.ts'

export interface LoadedFragments {
  fragments: Fragment[]
  issues: Issue[]
}

export const fragmentPath = (config: Config, id: string) => `${config.changes.replace(/\/+$/, '')}/${id}.md`

export function listFragmentIds(root: string, config: Config): string[] {
  const dir = join(root, config.changes)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('.') && e.name.toLowerCase() !== 'readme.md')
    .map((e) => e.name.slice(0, -3))
    .sort()
}

export function loadFragments(root: string, config: Config): LoadedFragments {
  const fragments: Fragment[] = []
  const issues: Issue[] = []
  for (const id of listFragmentIds(root, config)) {
    const file = fragmentPath(config, id)
    const parsed = parseFragment(readFileSync(join(root, file), 'utf8'), file, id)
    issues.push(...parsed.issues)
    if (!parsed.fragment) continue
    fragments.push(parsed.fragment)
    issues.push(...validateFragment(parsed.fragment, config))
  }
  return { fragments, issues }
}
