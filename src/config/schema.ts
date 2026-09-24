import * as z from 'zod'

export const CONFIG_FILE = 'release-kit.yaml'
export const SCHEMA_URL = 'https://unpkg.com/@coszone/release-kit/schema/config.json'

export const bumpLevels = ['none', 'patch', 'minor', 'major'] as const
export type Bump = (typeof bumpLevels)[number]

const name = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes')

const kindSchema = z.strictObject({
  bump: z.enum(bumpLevels).describe('Version level this kind triggers'),
  title: z.string().optional().describe('Section heading in release notes; defaults to the template language'),
  notes: z.boolean().default(true).describe('Include this kind in release notes'),
  require: z
    .array(z.enum(['upgrade']))
    .optional()
    .describe('Required body sections; defaults to [upgrade] for major bumps'),
})

const fieldSchema = z.strictObject({
  enum: z.array(z.string()).min(1).optional().describe('Allowed values'),
  required: z.boolean().default(false).describe('Required for every kind'),
  requiredFor: z.array(z.string()).default([]).describe('Kinds that require this field'),
  description: z.string().optional(),
})

const versionFileSchema = z.strictObject({
  path: z
    .string()
    .regex(/\.json$/, 'Only JSON version files are supported')
    .describe('JSON file relative to the repository root'),
  key: z.string().default('version').describe('Dot path of the version key'),
})

const channelSchema = z.strictObject({
  strategy: z
    .enum(['tag-only'])
    .default('tag-only')
    .describe('tag-only: prerelease versions exist only as git tags, never committed'),
})

const defaultKinds: Record<string, z.input<typeof kindSchema>> = {
  breaking: { bump: 'major', require: ['upgrade'] },
  feat: { bump: 'minor' },
  fix: { bump: 'patch' },
  perf: { bump: 'patch' },
  internal: { bump: 'none', notes: false },
}

export const configSchema = z
  .strictObject({
    version: z.literal(1).describe('Config format version'),
    changes: z.string().default('.release/changes').describe('Directory holding change fragments'),
    notes: z
      .strictObject({
        dir: z.string().default('docs/releases'),
        file: z.string().default('v{version}.md').describe('File name template; {version} is replaced'),
        template: z
          .string()
          .default('default-en')
          .describe('default-en, default-zh, or a template path relative to the repository root'),
        prFromGit: z
          .boolean()
          .default(true)
          .describe('On apply, fill a missing pr from the commit that added the fragment, e.g. "feat: x (#12)"'),
      })
      .prefault({}),
    versioning: z
      .strictObject({
        files: z.array(versionFileSchema).default([{ path: 'package.json', key: 'version' }]),
        tag: z.string().default('v{version}').describe('Git tag template; {version} is replaced'),
        pre1: z
          .strictObject({
            breaking: z
              .enum(['minor', 'patch'])
              .default('minor')
              .describe('Effective level of major-level changes while the version is 0.x'),
          })
          .prefault({}),
        channels: z.record(name, channelSchema).default({}).describe('Prerelease channels, e.g. alpha, beta, rc'),
      })
      .prefault({}),
    kinds: z.record(name, kindSchema).prefault(defaultKinds),
    fields: z.record(name, fieldSchema).default({}).describe('Custom frontmatter fields'),
    checks: z
      .strictObject({
        requireChange: z
          .strictObject({
            paths: z.array(z.string()).default([]).describe('Globs that require a fragment when changed'),
            exemptTitleTypes: z.array(z.string()).default(['docs', 'chore', 'test', 'ci']),
          })
          .optional(),
        prTitle: z
          .enum(['conventional', 'off'])
          .default('conventional')
          .describe('conventional: PR title type must match the fragment kinds'),
        body: z
          .strictObject({
            maxLength: z.number().int().positive().optional(),
            discourage: z.array(z.string()).default([]).describe('Regular expressions that trigger a warning'),
          })
          .prefault({}),
      })
      .prefault({}),
  })
  .superRefine((config, ctx) => {
    const kindNames = Object.keys(config.kinds)
    if (kindNames.length === 0) ctx.addIssue({ code: 'custom', path: ['kinds'], message: 'Define at least one kind' })
    for (const [field, spec] of Object.entries(config.fields)) {
      if (field === 'kind' || field === 'pr')
        ctx.addIssue({ code: 'custom', path: ['fields', field], message: `"${field}" is a built-in field` })
      spec.requiredFor.forEach((kind, i) => {
        if (!kindNames.includes(kind))
          ctx.addIssue({ code: 'custom', path: ['fields', field, 'requiredFor', i], message: `Unknown kind "${kind}"` })
      })
    }
    if (!config.versioning.tag.includes('{version}'))
      ctx.addIssue({ code: 'custom', path: ['versioning', 'tag'], message: 'Must contain {version}' })
    if (!config.notes.file.includes('{version}'))
      ctx.addIssue({ code: 'custom', path: ['notes', 'file'], message: 'Must contain {version}' })
    if ('stable' in config.versioning.channels)
      ctx.addIssue({ code: 'custom', path: ['versioning', 'channels', 'stable'], message: '"stable" is reserved' })
    config.checks.body.discourage.forEach((pattern, i) => {
      try {
        new RegExp(pattern)
      } catch {
        ctx.addIssue({ code: 'custom', path: ['checks', 'body', 'discourage', i], message: 'Invalid regular expression' })
      }
    })
  })

export type Config = z.output<typeof configSchema>
export type ConfigInput = z.input<typeof configSchema>
export type KindConfig = Config['kinds'][string]

export function configJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(configSchema, { io: 'input' }),
    $id: SCHEMA_URL,
    title: 'release-kit configuration',
  }
}

export const requiresUpgrade = (kind: KindConfig) => (kind.require ?? (kind.bump === 'major' ? ['upgrade'] : [])).includes('upgrade')

export const bumpRank = (bump: Bump) => bumpLevels.indexOf(bump)
