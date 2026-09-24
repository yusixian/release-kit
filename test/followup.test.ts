import { vi, describe, expect, it } from 'vitest'
import { cli, createRepo, exists, fragment, git, read, writeFiles } from './helpers.ts'

const changes = {
  '.release/changes/topic-yaml.md': fragment('breaking', 'Keys moved.\n\n## Upgrade\n\nMove them.', { docs: 'updated', pr: 128 }),
  '.release/changes/save-feedback.md': fragment('fix', 'Saving feedback no longer fails offline.'),
}

describe('apply after an interruption', () => {
  it('finishes without bumping again when versions and notes were already written', async () => {
    const dir = createRepo({ tags: ['v0.14.2'], files: changes })
    await cli(dir, ['apply'])
    const notes = read(dir, 'docs/releases/v0.15.0.md')
    writeFiles(dir, changes)
    vi.setSystemTime(new Date('2026-09-25T08:00:00Z'))

    const dry = await cli(dir, ['apply', '--dry-run', '--json'])
    expect(dry.json).toMatchObject({ resumed: true, applied: false, version: '0.15.0' })
    expect(exists(dir, '.release/changes/topic-yaml.md')).toBe(true)

    const result = await cli(dir, ['apply', '--json'])
    expect(result.code).toBe(0)
    expect(result.json).toMatchSnapshot()
    expect(JSON.parse(read(dir, 'package.json')).version).toBe('0.15.0')
    expect(read(dir, 'docs/releases/v0.15.0.md')).toBe(notes)
    expect(exists(dir, '.release/changes/topic-yaml.md')).toBe(false)
    expect((await cli(dir, ['apply', '--json'])).json).toMatchObject({ reason: 'nothing-to-release' })
  })

  it('keeps notes written on an earlier day when the version files were not updated yet', async () => {
    const dir = createRepo({ tags: ['v0.14.2'], files: changes })
    await cli(dir, ['apply'])
    const notes = read(dir, 'docs/releases/v0.15.0.md')
    writeFiles(dir, { ...changes, 'package.json': `${JSON.stringify({ name: 'fixture', version: '0.14.2' }, null, 2)}\n` })
    vi.setSystemTime(new Date('2026-09-26T08:00:00Z'))

    const result = await cli(dir, ['apply', '--json'])
    expect(result.json).toMatchObject({ resumed: false, version: '0.15.0' })
    expect(result.json.files).toContainEqual({ path: 'docs/releases/v0.15.0.md', action: 'unchanged' })
    expect(read(dir, 'docs/releases/v0.15.0.md')).toBe(notes)
    expect(JSON.parse(read(dir, 'package.json')).version).toBe('0.15.0')
  })

  it('does not resume when the notes describe other changes', async () => {
    const dir = createRepo({ version: '0.15.0', files: { ...changes, 'docs/releases/v0.15.0.md': '# 0.15.0\n\nOther.\n' } })
    expect((await cli(dir, ['apply', '--json'])).json).toMatchObject({ resumed: false, version: '0.16.0' })
  })
})

describe('pr numbers', () => {
  it('add reads the PR from GITHUB_REF or RELEASE_KIT_PR', async () => {
    const dir = createRepo()
    const fromRef = await cli(dir, ['add', '--kind', 'fix', '--id', 'a', '--body', 'A.', '--json'], undefined, { GITHUB_REF: 'refs/pull/42/merge' })
    expect(fromRef.json).toMatchObject({ frontmatter: { pr: 42 }, prSource: 'env' })
    const explicit = await cli(dir, ['add', '--kind', 'fix', '--id', 'b', '--body', 'B.', '--json'], undefined, {
      GITHUB_REF: 'refs/pull/42/merge',
      RELEASE_KIT_PR: '7',
    })
    expect(explicit.json).toMatchObject({ frontmatter: { pr: 7 } })
    const option = await cli(dir, ['add', '--kind', 'fix', '--id', 'c', '--pr', '9', '--body', 'C.', '--json'], undefined, { RELEASE_KIT_PR: '7' })
    expect(option.json).toMatchObject({ frontmatter: { pr: 9 }, prSource: 'option' })
    const none = await cli(dir, ['add', '--kind', 'fix', '--id', 'd', '--body', 'D.', '--json'], undefined, { GITHUB_REF: 'refs/heads/main' })
    expect(none.json).toMatchObject({ frontmatter: { kind: 'fix' }, prSource: null })
    expect(read(dir, '.release/changes/d.md')).not.toContain('pr:')
  })

  it('check reports which PR fragments the CI PR number would fill', async () => {
    const dir = createRepo({ files: changes })
    const result = await cli(dir, ['check', '--json'], undefined, { GITHUB_REF: 'refs/pull/5/merge' })
    expect(result.json.checked).toMatchObject({ pr: 5, prFill: ['save-feedback'] })
  })

  it('apply fills missing PRs from the squash commit that added the fragment', async () => {
    const dir = createRepo({ tags: ['v0.14.2'] })
    writeFiles(dir, changes)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'fix: keep feedback offline (#131)')
    const result = await cli(dir, ['apply', '--dry-run', '--json'])
    expect(result.json.changes).toContainEqual(expect.objectContaining({ id: 'save-feedback', pr: 131 }))
    expect(result.json.changes).toContainEqual(expect.objectContaining({ id: 'topic-yaml', pr: 128 }))
    expect((result.json.notes as { content: string }).content).toContain('Saving feedback no longer fails offline. (#131)')
  })

  it('leaves PRs empty when prFromGit is off', async () => {
    const dir = createRepo({ tags: ['v0.14.2'] })
    writeFiles(dir, { ...changes, 'release-kit.yaml': read(dir, 'release-kit.yaml').replace('template: default-en', 'template: default-en\n  prFromGit: false') })
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'fix: keep feedback offline (#131)')
    const result = await cli(dir, ['apply', '--dry-run', '--json'])
    expect(result.json.changes).toContainEqual(expect.objectContaining({ id: 'save-feedback', pr: null }))
  })
})

describe('check with an unparsable fragment', () => {
  it('reports RK010 without a duplicate RK030', async () => {
    const dir = createRepo({ files: { 'src/index.ts': 'export {}\n' } })
    git(dir, 'checkout', '-q', '-b', 'feature')
    writeFiles(dir, { 'src/index.ts': 'export const a = 1\n', '.release/changes/broken.md': 'kind: fix\n\nNo frontmatter.\n' })
    const result = await cli(dir, ['check', '--base', 'main', '--pr-title', 'fix: broken', '--json'])
    expect(result.code).toBe(1)
    expect((result.json.issues as { code: string }[]).map((i) => i.code)).toEqual(['RK010'])
  })
})
