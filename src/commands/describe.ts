import { VERSION } from '../meta.ts'
import { globalOptions, type CommandSpec, type OptionSpec } from '../cli/spec.ts'
import { SCHEMA_VERSION } from '../cli/output.ts'
import { tryLoadConfig } from '../config/load.ts'
import { configJsonSchema, requiresUpgrade, type Config } from '../config/schema.ts'
import { fragmentJsonSchema } from '../fragments/schema.ts'
import { catalog } from '../issues.ts'
import { commands } from './index.ts'

const options = (specs: Record<string, OptionSpec>) =>
  Object.entries(specs).map(([name, s]) => ({
    name: `--${name}`,
    type: s.type,
    description: s.description,
    required: s.required ?? false,
    multiple: s.multiple ?? false,
    ...(s.valueName && { valueName: s.valueName }),
    ...(s.enum && { enum: s.enum }),
    ...(s.default !== undefined && { default: s.default }),
  }))

const project = (config: Config) => ({
  changes: config.changes,
  tag: config.versioning.tag,
  channels: ['stable', ...Object.keys(config.versioning.channels)],
  kinds: Object.fromEntries(
    Object.entries(config.kinds).map(([name, k]) => [name, { bump: k.bump, notes: k.notes, requiresUpgrade: requiresUpgrade(k) }]),
  ),
})

export const describeCommand: CommandSpec = {
  name: 'describe',
  summary: 'Print commands, options, exit codes, issue codes, and the config and fragment JSON Schemas',
  writes: 'no',
  options: {},
  examples: ['release-kit describe --json'],
  run(ctx) {
    const config = tryLoadConfig(ctx.root)
    const data = {
      name: 'release-kit',
      version: VERSION,
      outputSchemaVersion: SCHEMA_VERSION,
      commands: commands.map((c) => ({
        name: c.name,
        summary: c.summary,
        writesFiles: c.writes,
        options: options(c.options),
        examples: c.examples,
      })),
      globalOptions: options(globalOptions),
      exitCodes: { '0': 'ok', '1': 'validation failed', '2': 'usage error', '3': 'environment error' },
      issueCodes: Object.entries(catalog).map(([code, title]) => ({ code, title })),
      issueShape: ['code', 'severity', 'file', 'line', 'message', 'fix'],
      schemas: {
        config: configJsonSchema(),
        fragment: fragmentJsonSchema(config),
      },
      fragmentSchemaSource: config ? 'project-config' : 'generic',
      project: config ? project(config) : null,
    }
    const text = [
      `release-kit ${VERSION}`,
      ...data.commands.map((c) => `  ${c.name.padEnd(9)} ${c.summary}`),
      '',
      'Run with --json for the full machine-readable description.',
    ].join('\n')
    return { data, text }
  },
}
