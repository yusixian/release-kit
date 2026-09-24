import { str, type CommandSpec } from '../cli/spec.ts'
import { checkPrTitle, checkRequiredChange, parsePrTitle } from '../checks/pr.ts'
import { loadConfig } from '../config/load.ts'
import { loadFragments } from '../fragments/load.ts'
import { parsePr } from '../fragments/validate.ts'
import { changedFiles } from '../git.ts'
import { prFromEnv } from '../pr.ts'

export const checkCommand: CommandSpec = {
  name: 'check',
  summary: 'Validate fragments, PR title consistency, required fragments for changed paths, and body rules',
  writes: 'no',
  options: {
    base: { type: 'string', valueName: 'ref', description: 'Compare against this git ref to find the PR\'s changed files and fragments' },
    'pr-title': { type: 'string', valueName: 'title', description: 'PR title to check against fragment kinds (Conventional Commits)' },
  },
  examples: ['release-kit check', 'release-kit check --base origin/main --pr-title "feat: add topic YAML" --json'],
  run(ctx, values) {
    const { config } = loadConfig(ctx.root)
    const { fragments, issues } = loadFragments(ctx.root, config)
    const base = str(values, 'base')
    const title = str(values, 'pr-title')
    const changed = base ? changedFiles(ctx.root, base) : null
    const prFragments = changed ? fragments.filter((f) => changed.includes(f.file)) : fragments

    const unparsed = issues.filter((i) => i.code === 'RK010' && (!changed || changed.includes(i.file!)))
    const prIssues = title !== undefined && config.checks.prTitle === 'conventional' ? checkPrTitle(title, prFragments, config) : []
    if (changed && !prIssues.some((i) => i.code === 'RK030'))
      prIssues.push(...checkRequiredChange(changed, prFragments, config, title ? parsePrTitle(title) : null))
    issues.push(...(unparsed.length > 0 ? prIssues.filter((i) => i.code !== 'RK030') : prIssues))

    const pr = prFromEnv(ctx.io.env)
    const prFill = pr ? prFragments.filter((f) => parsePr(f.data.pr) === undefined).map((f) => f.id) : []

    const errors = issues.filter((i) => i.severity === 'error').length
    const summary = `${errors === 0 ? 'ok' : 'failed'}: ${fragments.length} fragment(s), ${errors} error(s), ${issues.length - errors} warning(s)`
    return {
      data: {
        checked: {
          fragments: fragments.map((f) => f.id),
          prFragments: prFragments.map((f) => f.id),
          base: base ?? null,
          prTitle: title ?? null,
          changedFiles: changed?.length ?? null,
          pr,
          prFill,
        },
      },
      text: summary,
      issues,
    }
  },
}
