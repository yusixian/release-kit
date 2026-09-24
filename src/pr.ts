import { execFileSync } from 'node:child_process'
import type { Fragment } from './fragments/parse.ts'
import { parsePr } from './fragments/validate.ts'

/** PR number from CI: RELEASE_KIT_PR, or GITHUB_REF of a pull_request event (refs/pull/<n>/merge). */
export function prFromEnv(env: Record<string, string | undefined>): number | null {
  const explicit = parsePr(env.RELEASE_KIT_PR)
  if (explicit) return explicit
  const match = /^refs\/pull\/(\d+)\/(?:merge|head)$/.exec(env.GITHUB_REF ?? '')
  return match ? Number(match[1]) : null
}

const SUBJECT_PR = [/\(#(\d+)\)\s*$/, /^Merge pull request #(\d+)/]

/** PR number from the first-parent commit that added `file`, e.g. a squash subject ending in "(#12)". */
export function prFromGit(root: string, file: string): number | null {
  let subjects: string
  try {
    subjects = execFileSync('git', ['log', '--first-parent', '--diff-filter=A', '--format=%s', '--', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
  const subject = subjects.split('\n')[0] ?? ''
  for (const pattern of SUBJECT_PR) {
    const match = pattern.exec(subject)
    if (match) return Number(match[1])
  }
  return null
}

export function withGitPrs(root: string, fragments: Fragment[]): Fragment[] {
  return fragments.map((f) => {
    if (parsePr(f.data.pr) !== undefined) return f
    const pr = prFromGit(root, f.file)
    return pr ? { ...f, data: { ...f.data, pr } } : f
  })
}
