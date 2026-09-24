import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import semver from 'semver'
import { bool, str, type CommandResult, type CommandSpec } from '../cli/spec.ts'
import type { Config } from '../config/schema.ts'
import type { Fragment } from '../fragments/parse.ts'
import { fail, issue, type Issue } from '../issues.ts'
import { notesMatch, renderNotes, today } from '../notes/build.ts'
import { withGitPrs } from '../pr.ts'
import { readVersion, withVersion } from '../version/files.ts'
import { computePlan, resolveBaseline, STABLE, summarize } from '../version/plan.ts'
import { formatTemplate } from '../version/tags.ts'
import { loadProject } from './shared.ts'

type Action = 'updated' | 'created' | 'unchanged' | 'deleted'
type FileAction = { path: string; action: Action }

const planned: Record<Action, string> = { updated: 'would update', created: 'would create', unchanged: 'unchanged', deleted: 'would delete' }

function explicitVersion(value: string | undefined, current: string): string | undefined {
  if (value === undefined) return undefined
  const version = semver.valid(value)
  if (!version)
    throw fail.usage('RK903', `"${value}" is not a valid semver version`, 'release-kit apply --version 1.0.0')
  if (semver.prerelease(version))
    throw fail.usage('RK903', 'apply releases stable versions only', 'release-kit preview --channel <channel>')
  if (semver.lt(version, current))
    throw fail.usage('RK903', `--version ${version} is lower than the current version ${current}`, `release-kit apply --version <version above ${current}>`)
  return version
}

const notesPathFor = (config: Config, version: string) => `${config.notes.dir}/${formatTemplate(config.notes.file, version)}`

const nextStepsFor = (config: Config, notesPath: string, tag: string) => [
  `git add ${[...config.versioning.files.map((f) => f.path), notesPath, config.changes].join(' ')}`,
  `git commit -m "chore(release): ${tag}"`,
  `git tag ${tag}`,
]

function deleteFragments(root: string, fragments: Fragment[], dryRun: boolean): FileAction[] {
  if (!dryRun) for (const f of fragments) rmSync(join(root, f.file), { force: true })
  return fragments.map((f) => ({ path: f.file, action: 'deleted' }))
}

const listing = (files: FileAction[], dryRun: boolean) => files.map((f) => `  ${dryRun ? planned[f.action] : f.action} ${f.path}`)

/**
 * A run interrupted after writing version files and notes leaves the fragments behind; if the
 * current version's notes are exactly these fragments, only the deletion is left to do.
 */
function finishInterrupted(root: string, config: Config, fragments: Fragment[], current: string, dryRun: boolean, issues: Issue[]): CommandResult | null {
  const notesPath = notesPathFor(config, current)
  const tag = formatTemplate(config.versioning.tag, current)
  const notesFile = join(root, notesPath)
  if (!existsSync(notesFile)) return null
  if (!config.versioning.files.every((file) => readVersion(root, file) === current)) return null
  if (!notesMatch(readFileSync(notesFile, 'utf8'), root, config, fragments, { version: current, tag })) return null

  const files: FileAction[] = [
    ...config.versioning.files.map((f) => ({ path: f.path, action: 'unchanged' as Action })),
    { path: notesPath, action: 'unchanged' },
    ...deleteFragments(root, fragments, dryRun),
  ]
  const nextSteps = nextStepsFor(config, notesPath, tag)
  return {
    data: { dryRun, applied: !dryRun, resumed: true, current, version: current, tag, notesPath, changes: summarize(fragments, config), files, nextSteps },
    text: [
      `${dryRun ? 'Would finish' : 'Finished'} interrupted release ${current}`,
      ...listing(files, dryRun),
      ...(dryRun ? [] : ['', 'Next steps:', ...nextSteps.map((s) => `  ${s}`)]),
    ].join('\n'),
    issues,
  }
}

export const applyCommand: CommandSpec = {
  name: 'apply',
  summary: 'Write the next stable version and release notes, then delete consumed fragments (safe to re-run)',
  writes: 'yes',
  options: {
    version: { type: 'string', valueName: 'semver', description: 'Release this exact version instead of the computed one (the only way to reach 1.0.0 from 0.x)' },
    'dry-run': { type: 'boolean', description: 'Show what would change without writing anything' },
  },
  examples: ['release-kit apply --dry-run --json', 'release-kit apply', 'release-kit apply --version 1.0.0'],
  run(ctx, values) {
    const project = loadProject(ctx.root)
    const { config } = project
    const fragments = config.notes.prFromGit ? withGitPrs(ctx.root, project.fragments) : project.fragments
    const baseline = resolveBaseline(ctx.root, config)
    const version = explicitVersion(str(values, 'version'), baseline.current)
    const dryRun = bool(values, 'dry-run')
    const allIssues = [...project.issues, ...baseline.issues]

    if (fragments.length > 0 && (!version || version === baseline.current)) {
      const finished = finishInterrupted(ctx.root, config, fragments, baseline.current, dryRun, allIssues)
      if (finished) return finished
    }
    if (version === baseline.current || (!version && fragments.length === 0)) {
      if (version && fragments.length > 0)
        throw fail.usage('RK903', `Already at ${version}; pending fragments need a newer version`, 'release-kit apply')
      return {
        data: { dryRun, applied: false, reason: 'nothing-to-release', current: baseline.current, files: [] },
        text: `Nothing to release (current ${baseline.current}).`,
        issues: allIssues,
      }
    }

    const plan = computePlan(fragments, config, { channel: STABLE, baseline, explicitVersion: version })
    if (!plan.next) {
      return {
        data: { dryRun, applied: false, reason: 'no-version-bump', current: baseline.current, files: [] },
        text: `Pending fragments do not bump the version (current ${baseline.current}). Pass --version to release anyway.`,
        issues: allIssues,
      }
    }

    const notesPath = plan.notesPath!
    const tag = plan.tag!
    const notes = renderNotes(ctx.root, config, fragments, { version: plan.next, previous: plan.current, tag, date: today() })
    const notesFile = join(ctx.root, notesPath)
    const existing = existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : null
    const keepExisting = existing !== null && notesMatch(existing, ctx.root, config, fragments, { version: plan.next, tag })
    if (existing !== null && !keepExisting) {
      throw fail.validation([
        issue('RK051', `${notesPath} already exists with different content`, {
          file: notesPath,
          fix: `Move or delete ${notesPath}, or release a different version with --version`,
        }),
      ])
    }

    const versionWrites = config.versioning.files.map((file) => ({ path: file.path, content: withVersion(ctx.root, file, plan.next!) }))
    const files: FileAction[] = [
      ...versionWrites.map((w) => ({
        path: w.path,
        action: (readFileSync(join(ctx.root, w.path), 'utf8') === w.content ? 'unchanged' : 'updated') as Action,
      })),
      { path: notesPath, action: existing === null ? 'created' : 'unchanged' },
    ]
    if (!dryRun) {
      // Notes first: an interrupted run then re-plans the same version instead of bumping twice.
      if (!keepExisting) {
        mkdirSync(dirname(notesFile), { recursive: true })
        writeFileSync(notesFile, notes)
      }
      for (const w of versionWrites) writeFileSync(join(ctx.root, w.path), w.content)
    }
    files.push(...deleteFragments(ctx.root, fragments, dryRun))

    const nextSteps = nextStepsFor(config, notesPath, tag)
    const text = [
      `${dryRun ? 'Would release' : 'Released'} ${plan.current} -> ${plan.next} (${plan.bump}${plan.pre1Adjusted ? ', 0.x rule applied' : ''}${plan.source === 'explicit' ? ', explicit version' : ''})`,
      ...listing(files, dryRun),
      ...(dryRun ? ['', notes] : ['', 'Next steps:', ...nextSteps.map((s) => `  ${s}`)]),
    ]
    return {
      data: {
        dryRun,
        applied: !dryRun,
        resumed: false,
        ...plan,
        version: plan.next,
        notes: { path: notesPath, content: keepExisting ? existing : notes },
        files,
        nextSteps,
      },
      text: text.join('\n').trimEnd(),
      issues: allIssues,
    }
  },
}
