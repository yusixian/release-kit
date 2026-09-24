import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bool, str, type CommandSpec } from '../cli/spec.ts'
import { renderNotes, today } from '../notes/build.ts'
import { computePlan, resolveBaseline } from '../version/plan.ts'
import { withVersion } from '../version/files.ts'
import { describePlan } from './plan.ts'
import { loadProject, requireTags, resolveChannel } from './shared.ts'

export const previewCommand: CommandSpec = {
  name: 'preview',
  summary: 'Print the next version for a channel (e.g. X.Y.Z-alpha.N from git tags) with rendered notes',
  writes: 'optional',
  options: {
    channel: { type: 'string', valueName: 'name', required: true, description: 'Channel to preview: stable or a configured prerelease channel' },
    'write-version': {
      type: 'boolean',
      description: 'Write the previewed version into versioning.files (for CI builds; not meant to be committed)',
    },
  },
  examples: ['release-kit preview --channel alpha --json', 'release-kit preview --channel alpha --write-version'],
  run(ctx, values) {
    const { config, fragments, issues } = loadProject(ctx.root)
    const channel = resolveChannel(config, str(values, 'channel'), 'preview')
    const baseline = resolveBaseline(ctx.root, config)
    requireTags(ctx.root, config, baseline, channel)
    const plan = computePlan(fragments, config, { channel, baseline })
    const notes = plan.next
      ? renderNotes(ctx.root, config, fragments, { version: plan.next, previous: plan.current, tag: plan.tag!, date: today() })
      : null
    const written: string[] = []
    if (plan.next && bool(values, 'write-version')) {
      for (const file of config.versioning.files) {
        writeFileSync(join(ctx.root, file.path), withVersion(ctx.root, file, plan.next))
        written.push(file.path)
      }
    }
    const text = [describePlan(plan), ...(written.length > 0 ? [`  wrote version to ${written.join(', ')}`] : []), '', notes ?? '']
    return {
      data: { ...plan, notes, written },
      text: text.join('\n').trimEnd(),
      issues: [...issues, ...baseline.issues],
    }
  },
}
