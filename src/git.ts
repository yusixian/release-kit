import { execFileSync } from 'node:child_process'
import { fail } from './issues.ts'

function run(root: string, args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw fail.environment('RK040', 'git executable not found', { fix: 'Install git and make sure it is on PATH' })
    throw error
  }
}

function tryRun(root: string, args: string[]): string | null {
  try {
    return run(root, args)
  } catch (error) {
    if ((error as { status?: number }).status !== undefined) return null
    throw error
  }
}

export function isRepo(root: string): boolean {
  return tryRun(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true'
}

export function requireRepo(root: string): void {
  if (!isRepo(root))
    throw fail.environment('RK040', `${root} is not inside a git repository`, {
      fix: 'Run release-kit from a git checkout, or pass --cwd <repo>',
    })
}

export function listTags(root: string): string[] {
  return run(root, ['tag', '--list'])
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
}

const splitZ = (out: string) => out.split('\0').filter(Boolean)

/** Files changed between the merge base with `base` and the working tree, including untracked files. */
export function changedFiles(root: string, base: string): string[] {
  requireRepo(root)
  if (tryRun(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === null)
    throw fail.environment('RK041', `Git ref "${base}" not found`, {
      fix: `git fetch origin ${base.replace(/^origin\//, '')}`,
    })
  const mergeBase = tryRun(root, ['merge-base', base, 'HEAD'])?.trim()
  if (!mergeBase)
    throw fail.environment('RK041', `No common ancestor between "${base}" and HEAD`, {
      fix: 'Fetch full history (e.g. actions/checkout with fetch-depth: 0)',
    })
  const tracked = splitZ(run(root, ['diff', '--name-only', '--relative', '-z', mergeBase]))
  const untracked = splitZ(run(root, ['ls-files', '--others', '--exclude-standard', '-z']))
  return [...new Set([...tracked, ...untracked])].sort()
}
