import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/meta.ts'
import { cli, createRepo, exists, fragment, git, read, writeFiles } from './helpers.ts'

const changes = {
  '.release/changes/topic-yaml.md': fragment(
    'breaking',
    '`topics` in `harness.yaml` are now declared per project.\n\n## Upgrade\n\nMove `topics.<name>` to `projects.<name>.topic`.',
    { docs: 'updated', pr: 128 },
  ),
  '.release/changes/save-feedback.md': fragment('fix', 'Saving feedback no longer fails offline.', { docs: 'not-needed', pr: 131 }),
  '.release/changes/refactor.md': fragment('internal', 'Internal refactor.'),
}

describe('plan', () => {
  it('applies the 0.x rule to breaking changes', async () => {
    const dir = createRepo({ version: '0.14.2', tags: ['v0.14.2'], files: changes })
    const result = await cli(dir, ['plan', '--json'])
    expect(result.code).toBe(0)
    expect(result.json).toMatchSnapshot()
    expect(result.json).toMatchObject({ next: '0.15.0', bump: 'minor', pre1Adjusted: true })
  })

  it('bumps major from 1.x', async () => {
    const dir = createRepo({ version: '1.4.0', tags: ['v1.4.0'], files: changes })
    expect((await cli(dir, ['plan', '--json'])).json).toMatchObject({ next: '2.0.0', bump: 'major', pre1Adjusted: false })
  })

  it('reports no release without fragments', async () => {
    const dir = createRepo({ tags: ['v0.14.2'] })
    expect((await cli(dir, ['plan', '--json'])).json).toMatchObject({ next: null, bump: 'none', reason: [], tag: null })
  })

  it('fails on invalid fragments with exit code 1', async () => {
    const dir = createRepo({ files: { '.release/changes/bad.md': fragment('feature', 'Oops.') } })
    const result = await cli(dir, ['plan', '--json'])
    expect(result.code).toBe(1)
    expect(result.json.issues).toMatchObject([{ code: 'RK011' }])
  })

  it('rejects unknown channels with exit code 2', async () => {
    const result = await cli(createRepo({ files: changes }), ['plan', '--channel', 'nightly', '--json'])
    expect(result.code).toBe(2)
    expect(result.json.issues).toMatchObject([{ code: 'RK901' }])
  })

  it('warns when the version file is behind the latest tag', async () => {
    const dir = createRepo({ version: '0.14.2', tags: ['v0.14.2', 'v0.15.0'], files: changes })
    expect((await cli(dir, ['plan', '--json'])).json.issues).toMatchObject([{ code: 'RK043', severity: 'warning' }])
  })
})

describe('preview', () => {
  it('numbers prereleases from existing tags', async () => {
    const dir = createRepo({ tags: ['v0.14.2', 'v0.15.0-alpha.0', 'v0.15.0-alpha.1', 'v0.15.0-beta.0'], files: changes })
    const result = await cli(dir, ['preview', '--channel', 'alpha', '--json'])
    expect(result.code).toBe(0)
    expect(result.json).toMatchSnapshot()
    expect(read(dir, 'package.json')).toContain('"0.14.2"')
  })

  it('starts at .0 for a new base version', async () => {
    const dir = createRepo({ tags: ['v0.14.2', 'v0.14.3-alpha.4'], files: changes })
    expect((await cli(dir, ['preview', '--channel', 'beta', '--json'])).json).toMatchObject({ next: '0.15.0-beta.0', tag: 'v0.15.0-beta.0' })
  })

  it('fails with exit code 3 when no tags are present', async () => {
    const dir = createRepo({ files: changes })
    const result = await cli(dir, ['preview', '--channel', 'alpha', '--json'])
    expect(result.code).toBe(3)
    expect(result.json).toMatchSnapshot()
  })

  it('requires git for prerelease channels', async () => {
    const dir = createRepo({ files: changes, git: false })
    expect((await cli(dir, ['preview', '--channel', 'alpha', '--json'])).json.issues).toMatchObject([{ code: 'RK040' }])
  })

  it('writes the version only when asked', async () => {
    const dir = createRepo({ tags: ['v0.14.2'], files: changes })
    const result = await cli(dir, ['preview', '--channel', 'alpha', '--write-version', '--json'])
    expect(result.json).toMatchObject({ next: '0.15.0-alpha.0', written: ['package.json'] })
    expect(JSON.parse(read(dir, 'package.json')).version).toBe('0.15.0-alpha.0')
    expect(exists(dir, 'docs/releases')).toBe(false)
    expect(exists(dir, '.release/changes/topic-yaml.md')).toBe(true)
  })

  it('requires --channel', async () => {
    expect((await cli(createRepo(), ['preview'])).code).toBe(2)
  })
})

describe('apply', () => {
  it('dry-run writes nothing', async () => {
    const dir = createRepo({ tags: ['v0.14.2'], files: changes })
    const before = git(dir, 'status', '--porcelain')
    const result = await cli(dir, ['apply', '--dry-run', '--json'])
    expect(result.code).toBe(0)
    expect(result.json).toMatchSnapshot()
    expect(git(dir, 'status', '--porcelain')).toBe(before)
  })

  it('writes version and notes, deletes fragments, and is safe to re-run', async () => {
    const dir = createRepo({ tags: ['v0.14.2'], files: changes })
    const result = await cli(dir, ['apply'])
    expect(result.code).toBe(0)
    expect(result.stdout).toMatchSnapshot()
    expect(read(dir, 'package.json')).toBe('{\n  "name": "fixture",\n  "version": "0.15.0"\n}\n')
    expect(read(dir, 'docs/releases/v0.15.0.md')).toMatchSnapshot('v0.15.0.md')
    expect(exists(dir, '.release/changes/topic-yaml.md')).toBe(false)

    const again = await cli(dir, ['apply', '--json'])
    expect(again.code).toBe(0)
    expect(again.json).toMatchObject({ applied: false, reason: 'nothing-to-release', current: '0.15.0' })
    expect(read(dir, 'package.json')).toContain('"0.15.0"')
  })

  it('renders the default-zh template', async () => {
    const dir = createRepo({ tags: ['v0.14.2'], files: changes })
    writeFiles(dir, { 'release-kit.yaml': read(dir, 'release-kit.yaml').replace('template: default-en', 'template: default-zh') })
    await cli(dir, ['apply'])
    expect(read(dir, 'docs/releases/v0.15.0.md')).toMatchSnapshot('v0.15.0.zh.md')
  })

  it('reaches 1.0.0 only with an explicit version', async () => {
    const dir = createRepo({ version: '0.14.2', files: changes })
    const result = await cli(dir, ['apply', '--version', '1.0.0', '--json'])
    expect(result.json).toMatchObject({ version: '1.0.0', source: 'explicit', tag: 'v1.0.0', notesPath: 'docs/releases/v1.0.0.md' })
    const again = await cli(dir, ['apply', '--version', '1.0.0', '--json'])
    expect(again.json).toMatchObject({ applied: false, reason: 'nothing-to-release' })
  })

  it('rejects invalid explicit versions with exit code 2', async () => {
    const dir = createRepo({ version: '0.14.2', files: changes })
    for (const version of ['next', '0.1.0', '1.0.0-rc.0']) {
      const result = await cli(dir, ['apply', '--version', version, '--json'])
      expect(result.code).toBe(2)
      expect(result.json.issues).toMatchObject([{ code: 'RK903' }])
    }
  })

  it('refuses to overwrite a different notes file', async () => {
    const dir = createRepo({ files: { ...changes, 'docs/releases/v0.15.0.md': 'hand-written\n' } })
    const result = await cli(dir, ['apply', '--json'])
    expect(result.code).toBe(1)
    expect(result.json.issues).toMatchObject([{ code: 'RK051', file: 'docs/releases/v0.15.0.md' }])
    expect(read(dir, 'package.json')).toContain('"0.14.2"')
  })

  it('reports a missing version file as an environment error', async () => {
    const dir = createRepo({ files: changes })
    git(dir, 'rm', '-q', 'package.json')
    const result = await cli(dir, ['apply', '--json'])
    expect(result.code).toBe(3)
    expect(result.json.issues).toMatchObject([{ code: 'RK050', file: 'package.json' }])
  })
})

describe('describe', () => {
  it('describes commands and schemas', async () => {
    const result = await cli(createRepo(), ['describe', '--json'])
    expect(result.code).toBe(0)
    expect(result.json.version).toBe(VERSION)
    expect({ ...result.json, version: '<version>' }).toMatchSnapshot()
  })

  it('falls back to a generic fragment schema without config', async () => {
    const result = await cli(createRepo({ git: false, config: 'version: [' }), ['describe', '--json'])
    expect(result.json.fragmentSchemaSource).toBe('generic')
  })
})

describe('cli', () => {
  it('uses stable exit codes for usage errors', async () => {
    const dir = createRepo()
    expect((await cli(dir, [])).code).toBe(2)
    expect((await cli(dir, ['--help'])).code).toBe(0)
    expect((await cli(dir, ['launch', '--json'])).json).toMatchSnapshot()
  })
})
