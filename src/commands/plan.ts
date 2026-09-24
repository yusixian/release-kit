import type { CommandSpec } from '../cli/spec.ts'
import { str } from '../cli/spec.ts'
import { computePlan, resolveBaseline, type Plan } from '../version/plan.ts'
import { loadProject, requireTags, resolveChannel } from './shared.ts'

export function describePlan(plan: Plan): string {
  if (!plan.next) return `No releasable changes (current ${plan.current}).`
  const lines = [`${plan.current} -> ${plan.next} (${plan.channel}, ${plan.bump}${plan.pre1Adjusted ? ', 0.x rule applied' : ''})`]
  for (const r of plan.reason) {
    lines.push(`  decided by ${r.change} (${r.kind}: ${r.bump}${r.bump !== r.effective ? ` -> ${r.effective}` : ''})`)
  }
  lines.push(`  tag ${plan.tag}`)
  if (plan.notesPath) lines.push(`  notes ${plan.notesPath}`)
  lines.push(`  ${plan.changes.length} change(s): ${plan.changes.map((c) => c.id).join(', ')}`)
  return lines.join('\n')
}

export const planCommand: CommandSpec = {
  name: 'plan',
  summary: 'Compute the next version from change fragments and explain why',
  writes: 'no',
  options: {
    channel: { type: 'string', valueName: 'name', description: 'stable or a prerelease channel from versioning.channels', default: 'stable' },
  },
  examples: ['release-kit plan --json', 'release-kit plan --channel alpha --json'],
  run(ctx, values) {
    const { config, fragments, issues } = loadProject(ctx.root)
    const channel = resolveChannel(config, str(values, 'channel'), 'plan')
    const baseline = resolveBaseline(ctx.root, config)
    requireTags(ctx.root, config, baseline, channel)
    const plan = computePlan(fragments, config, { channel, baseline })
    return { data: { ...plan }, text: describePlan(plan), issues: [...issues, ...baseline.issues] }
  },
}
