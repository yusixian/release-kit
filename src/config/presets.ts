import { stringify } from 'yaml'
import { SCHEMA_URL, type ConfigInput } from './schema.ts'

export const presetNames = ['library', 'web', 'electron'] as const
export type PresetName = (typeof presetNames)[number]

const base = {
  version: 1,
  changes: '.release/changes',
  notes: { dir: 'docs/releases', file: 'v{version}.md', template: 'default-en' },
  kinds: {
    breaking: { bump: 'major', require: ['upgrade'] },
    feat: { bump: 'minor' },
    fix: { bump: 'patch' },
    perf: { bump: 'patch' },
    internal: { bump: 'none', notes: false },
  },
  fields: {
    docs: { enum: ['updated', 'not-needed'], requiredFor: ['feat', 'breaking'] },
  },
} satisfies ConfigInput

const body = { maxLength: 400, discourage: ['\\bsrc/', '\\.[jt]sx?\\b'] }
const exemptTitleTypes = ['docs', 'chore', 'test', 'ci', 'build', 'style']

const presets: Record<PresetName, ConfigInput> = {
  library: {
    ...base,
    versioning: {
      files: [{ path: 'package.json', key: 'version' }],
      tag: 'v{version}',
      pre1: { breaking: 'minor' },
      channels: { alpha: { strategy: 'tag-only' }, beta: { strategy: 'tag-only' }, rc: { strategy: 'tag-only' } },
    },
    checks: {
      requireChange: { paths: ['src/**'], exemptTitleTypes },
      prTitle: 'conventional',
      body,
    },
  },
  web: {
    ...base,
    versioning: {
      files: [{ path: 'package.json', key: 'version' }],
      tag: 'v{version}',
      pre1: { breaking: 'minor' },
      channels: { alpha: { strategy: 'tag-only' } },
    },
    checks: {
      requireChange: { paths: ['src/**', 'app/**', 'apps/**', 'packages/**', 'public/**'], exemptTitleTypes },
      prTitle: 'conventional',
      body,
    },
  },
  electron: {
    ...base,
    versioning: {
      files: [{ path: 'package.json', key: 'version' }],
      tag: 'v{version}',
      pre1: { breaking: 'minor' },
      channels: { alpha: { strategy: 'tag-only' }, beta: { strategy: 'tag-only' } },
    },
    checks: {
      requireChange: { paths: ['src/**', 'electron/**', 'app/**', 'resources/**'], exemptTitleTypes },
      prTitle: 'conventional',
      body,
    },
  },
}

export function presetYaml(name: PresetName): string {
  const { version, changes, notes, versioning, kinds, fields, checks } = presets[name]
  const ordered = { version, changes, notes, versioning, kinds, fields, checks }
  return `# yaml-language-server: $schema=${SCHEMA_URL}\n${stringify(ordered, { lineWidth: 0 })}`
}
