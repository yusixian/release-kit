import { describe, expect, it } from 'vitest'
import { cli, createRepo, fragment, git, writeFiles } from './helpers.ts'

function featureBranch(files: Record<string, string>): string {
  const dir = createRepo({ files: { 'src/index.ts': 'export {}\n' } })
  git(dir, 'checkout', '-q', '-b', 'feature')
  writeFiles(dir, files)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'change')
  return dir
}

describe('check', () => {
  it('passes with valid fragments', async () => {
    const dir = featureBranch({
      'src/index.ts': 'export const a = 1\n',
      '.release/changes/topic-yaml.md': fragment('feat', 'Topics can be created from YAML.', { docs: 'updated' }),
    })
    const result = await cli(dir, ['check', '--base', 'main', '--pr-title', 'feat: topics from YAML', '--json'])
    expect(result.code).toBe(0)
    expect(result.json).toMatchSnapshot()
  })

  it('flags a PR title that does not match the fragment kind', async () => {
    const dir = featureBranch({
      '.release/changes/save-feedback.md': fragment('fix', 'Saving feedback works offline.'),
    })
    const result = await cli(dir, ['check', '--base', 'main', '--pr-title', 'feat: offline feedback', '--json'])
    expect(result.code).toBe(1)
    expect(result.json).toMatchSnapshot()
  })

  it('flags a title that understates the highest kind', async () => {
    const dir = featureBranch({
      '.release/changes/a.md': fragment('fix', 'A fix.'),
      '.release/changes/b.md': fragment('feat', 'A feature.', { docs: 'updated' }),
    })
    const result = await cli(dir, ['check', '--base', 'main', '--pr-title', 'fix: stuff', '--json'])
    expect(result.json.issues).toMatchObject([{ code: 'RK012', file: '.release/changes/b.md', line: 2 }])
  })

  it('accepts feat! for breaking fragments', async () => {
    const dir = featureBranch({
      '.release/changes/a.md': fragment('breaking', 'Keys moved.\n\n## Upgrade\n\nMove them.', { docs: 'updated' }),
    })
    expect((await cli(dir, ['check', '--base', 'main', '--pr-title', 'feat!: move keys'])).code).toBe(0)
    expect((await cli(dir, ['check', '--base', 'main', '--pr-title', 'feat: move keys'])).code).toBe(1)
  })

  it('rejects non-conventional titles', async () => {
    const dir = featureBranch({ '.release/changes/a.md': fragment('fix', 'A fix.') })
    const result = await cli(dir, ['check', '--pr-title', 'Fix things', '--json'])
    expect(result.json.issues).toMatchObject([{ code: 'RK013', severity: 'error' }])
  })

  it('requires a fragment when source paths change', async () => {
    const dir = featureBranch({ 'src/index.ts': 'export const b = 2\n' })
    const result = await cli(dir, ['check', '--base', 'main', '--json'])
    expect(result.code).toBe(1)
    expect(result.json).toMatchSnapshot()
  })

  it('counts uncommitted fragments as part of the PR', async () => {
    const dir = featureBranch({ 'src/index.ts': 'export const b = 2\n' })
    writeFiles(dir, { '.release/changes/c.md': fragment('internal', 'Refactor.') })
    expect((await cli(dir, ['check', '--base', 'main'])).code).toBe(0)
  })

  it('exempts configured PR title types', async () => {
    const dir = featureBranch({ 'src/index.ts': 'export const b = 2\n' })
    expect((await cli(dir, ['check', '--base', 'main', '--pr-title', 'chore: bump deps'])).code).toBe(0)
  })

  it('warns about implementation details without failing', async () => {
    const dir = featureBranch({ '.release/changes/a.md': fragment('fix', 'Fixed a crash in src/app.tsx.') })
    const result = await cli(dir, ['check', '--json'])
    expect(result.code).toBe(0)
    expect(result.json.issues).toMatchObject([{ code: 'RK020', severity: 'warning', line: 5 }])
  })

  it('fails on missing upgrade section for breaking changes', async () => {
    const dir = featureBranch({ '.release/changes/a.md': fragment('breaking', 'Keys moved.', { docs: 'updated' }) })
    const result = await cli(dir, ['check', '--json'])
    expect(result.json.issues).toMatchObject([{ code: 'RK017', line: 6 }])
  })

  it('reports an unknown base ref as an environment error', async () => {
    const result = await cli(createRepo(), ['check', '--base', 'origin/main', '--json'])
    expect(result.code).toBe(3)
    expect(result.json).toMatchSnapshot()
  })

  it('prints human-readable issues to stderr', async () => {
    const dir = featureBranch({ '.release/changes/a.md': fragment('feature', 'A.') })
    const result = await cli(dir, ['check'])
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('failed: 1 fragment(s), 1 error(s), 0 warning(s)\n')
    expect(result.stderr).toMatchSnapshot()
  })
})
