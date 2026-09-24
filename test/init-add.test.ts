import { describe, expect, it } from 'vitest'
import { cli, createRepo, exists, read, tempDir, writeFiles } from './helpers.ts'

describe('init', () => {
  it('creates config, fragment dir, AGENTS.md block and skill', async () => {
    const dir = tempDir()
    const result = await cli(dir, ['init', '--preset', 'web', '--agents', '--json'])
    expect(result.code).toBe(0)
    expect(result.json).toMatchSnapshot()
    expect(read(dir, 'release-kit.yaml')).toMatchSnapshot('release-kit.yaml')
    expect(read(dir, 'AGENTS.md')).toMatchSnapshot('AGENTS.md')
    expect(exists(dir, '.release/changes/.gitkeep')).toBe(true)
    expect(read(dir, 'skills/release-kit/SKILL.md')).toMatch(/^---\nname: release-kit\n/)
  })

  it('is idempotent and preserves existing AGENTS.md content', async () => {
    const dir = tempDir()
    writeFiles(dir, { 'AGENTS.md': '# Rules\n\nBe nice.\n' })
    await cli(dir, ['init', '--agents'])
    const first = read(dir, 'AGENTS.md')
    expect(first.startsWith('# Rules\n\nBe nice.\n\n<!-- release-kit:start -->')).toBe(true)

    const again = await cli(dir, ['init', '--agents', '--json'])
    expect(again.json.files).toEqual([
      { path: 'release-kit.yaml', action: 'unchanged' },
      { path: '.release/changes/.gitkeep', action: 'unchanged' },
      { path: 'AGENTS.md', action: 'unchanged' },
      { path: 'skills/release-kit/SKILL.md', action: 'unchanged' },
    ])
    expect(read(dir, 'AGENTS.md')).toBe(first)
  })

  it('replaces a stale marked block in place', async () => {
    const dir = tempDir()
    writeFiles(dir, { 'AGENTS.md': 'top\n<!-- release-kit:start -->\nold\n<!-- release-kit:end -->\nbottom\n' })
    const result = await cli(dir, ['init', '--agents', '--json'])
    expect(result.json.files).toContainEqual({ path: 'AGENTS.md', action: 'updated' })
    const content = read(dir, 'AGENTS.md')
    expect(content.startsWith('top\n<!-- release-kit:start -->\n## Release notes')).toBe(true)
    expect(content.endsWith('<!-- release-kit:end -->\nbottom\n')).toBe(true)
  })

  it('rejects an unknown preset with exit code 2', async () => {
    const result = await cli(tempDir(), ['init', '--preset', 'mobile', '--json'])
    expect(result.code).toBe(2)
    expect(result.json).toMatchSnapshot()
  })
})

describe('add', () => {
  it('creates a fragment with an automatic id and is idempotent', async () => {
    const dir = createRepo()
    const args = ['add', '--kind', 'feat', '--field', 'docs=updated', '--pr', '128', '--body', 'Topics can be created from YAML.', '--json']
    const first = await cli(dir, args)
    expect(first.code).toBe(0)
    expect(first.json).toMatchSnapshot()
    expect(read(dir, first.json.file as string)).toBe('---\nkind: feat\ndocs: updated\npr: 128\n---\n\nTopics can be created from YAML.\n')

    const second = await cli(dir, args)
    expect(second.json).toMatchObject({ id: first.json.id, action: 'unchanged' })
  })

  it('updates a fragment with an explicit id', async () => {
    const dir = createRepo()
    await cli(dir, ['add', '--kind', 'fix', '--id', 'save-feedback', '--body', 'First.'])
    const result = await cli(dir, ['add', '--kind', 'fix', '--id', 'save-feedback', '--body', 'Second.', '--json'])
    expect(result.json).toMatchObject({ action: 'updated', file: '.release/changes/save-feedback.md' })
    expect(read(dir, '.release/changes/save-feedback.md')).toContain('Second.')
  })

  it('reads the body from stdin', async () => {
    const dir = createRepo()
    const body = 'Config keys moved.\n\n## Upgrade\n\nRename `a` to `b`.\n'
    const result = await cli(dir, ['add', '--kind', 'breaking', '--field', 'docs=updated', '--id', 'moved', '--body-file', '-', '--json'], body)
    expect(result.code).toBe(0)
    expect(read(dir, '.release/changes/moved.md')).toContain('## Upgrade')
  })

  it('never waits on a terminal stdin', async () => {
    const result = await cli(createRepo(), ['add', '--kind', 'fix', '--body-file', '-', '--json'])
    expect(result.code).toBe(2)
    expect(result.json.issues).toMatchObject([{ code: 'RK902' }])
  })

  it('refuses invalid fragments without writing them', async () => {
    const dir = createRepo()
    const result = await cli(dir, ['add', '--kind', 'breaking', '--body', 'Changed things.', '--json'])
    expect(result.code).toBe(1)
    expect(result.json).toMatchSnapshot()
    expect(exists(dir, '.release/changes')).toBe(false)
  })

  it('reports usage errors with exit code 2', async () => {
    const dir = createRepo()
    expect((await cli(dir, ['add', '--body', 'x', '--json'])).json.issues).toMatchObject([{ code: 'RK902', message: 'Missing required option --kind' }])
    expect((await cli(dir, ['add', '--kind', 'feature', '--body', 'x'])).code).toBe(2)
    expect((await cli(dir, ['add', '--kind', 'fix', '--body', 'x', '--nope'])).code).toBe(2)
  })

  it('needs a config (exit code 3)', async () => {
    const result = await cli(tempDir(), ['add', '--kind', 'fix', '--body', 'x', '--json'])
    expect(result.code).toBe(3)
    expect(result.json).toMatchSnapshot()
  })
})
