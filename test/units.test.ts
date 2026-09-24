import { describe, expect, it } from 'vitest'
import { parseConfig } from '../src/config/load.ts'
import { presetNames, presetYaml } from '../src/config/presets.ts'
import { parsePrTitle } from '../src/checks/pr.ts'
import { parseFragment } from '../src/fragments/parse.ts'
import { validateFragment } from '../src/fragments/validate.ts'
import { renderTemplate } from '../src/notes/render.ts'
import { nextPrerelease, versionsFromTags } from '../src/version/tags.ts'

const config = parseConfig(presetYaml('library')).config!

describe('config', () => {
  it.each(presetNames)('preset %s is valid', (name) => {
    expect(parseConfig(presetYaml(name)).issues).toEqual([])
  })

  it('reports schema errors with lines', () => {
    const { issues } = parseConfig('version: 1\nkinds:\n  feat:\n    bump: huge\nversioning:\n  tag: release\n')
    expect(issues).toMatchSnapshot()
  })

  it('reports YAML syntax errors', () => {
    const { issues } = parseConfig('version: 1\nkinds: [\n')
    expect(issues[0]).toMatchObject({ code: 'RK003', file: 'release-kit.yaml' })
  })

  it('applies defaults for a minimal config', () => {
    const minimal = parseConfig('version: 1\n').config!
    expect(Object.keys(minimal.kinds)).toEqual(['breaking', 'feat', 'fix', 'perf', 'internal'])
    expect(minimal.versioning.files).toEqual([{ path: 'package.json', key: 'version' }])
    expect(minimal.notes.template).toBe('default-en')
  })
})

describe('fragments', () => {
  const validate = (text: string) => {
    const { fragment, issues } = parseFragment(text, '.release/changes/x.md', 'x')
    return [...issues, ...(fragment ? validateFragment(fragment, config) : [])]
  }

  it('accepts a valid fragment', () => {
    expect(validate('---\nkind: feat\ndocs: updated\npr: 12\n---\n\nTopics can be created from YAML.\n')).toEqual([])
  })

  it('flags frontmatter, field, body and upgrade problems', () => {
    const text = [
      '---',
      'kind: breaking',
      'docs: maybe',
      'pr: abc',
      'owner: me',
      '---',
      '',
      'Renamed the option in src/config.ts.',
      '',
    ].join('\n')
    expect(validate(text)).toMatchSnapshot()
  })

  it('requires frontmatter and a known kind', () => {
    expect(validate('Just text\n')[0]).toMatchObject({ code: 'RK010', line: 1 })
    expect(validate('---\nkind: feature\n---\n\nBody\n')).toMatchObject([{ code: 'RK011', line: 2 }])
  })

  it('accepts either upgrade heading', () => {
    for (const heading of ['## Upgrade', '## 升级']) {
      const text = `---\nkind: breaking\ndocs: updated\n---\n\nChanged the format.\n\n${heading}\n\nRename the key.\n`
      expect(validate(text)).toEqual([])
    }
  })

  it('enforces maxLength on the summary only', () => {
    const long = 'a'.repeat(401)
    expect(validate(`---\nkind: fix\n---\n\n${long}\n`)).toMatchObject([{ code: 'RK019' }])
  })
})

describe('pr titles', () => {
  it('parses conventional titles', () => {
    expect(parsePrTitle('feat(ui): add topics')).toEqual({ type: 'feat', breaking: false })
    expect(parsePrTitle('fix!: drop node 18')).toEqual({ type: 'fix', breaking: true })
    expect(parsePrTitle('Add topics')).toBeNull()
  })
})

describe('tags', () => {
  it('parses versions from a tag template', () => {
    expect(versionsFromTags(['v1.0.0', 'app-v2.0.0', 'v1.1.0-alpha.3', 'vnext'], 'v{version}')).toEqual(['1.0.0', '1.1.0-alpha.3'])
    expect(versionsFromTags(['app-v2.0.0', 'v1.0.0'], 'app-v{version}')).toEqual(['2.0.0'])
  })

  it('continues prerelease numbering per base and channel', () => {
    const versions = ['1.1.0-alpha.0', '1.1.0-alpha.4', '1.1.0-beta.1', '1.2.0-alpha.9']
    expect(nextPrerelease('1.1.0', 'alpha', versions)).toBe('1.1.0-alpha.5')
    expect(nextPrerelease('1.1.0', 'beta', versions)).toBe('1.1.0-beta.2')
    expect(nextPrerelease('1.1.0', 'rc', versions)).toBe('1.1.0-rc.0')
  })
})

describe('template renderer', () => {
  it('renders variables, sections and inverted sections', () => {
    const template = '# {{title}}\n\n{{#items}}\n- {{text}}{{#pr}} (#{{pr}}){{/pr}}\n{{/items}}\n{{^items}}\nNothing.\n{{/items}}\n'
    expect(renderTemplate(template, { title: 'T', items: [{ text: 'a', pr: 1 }, { text: 'b', pr: null }] })).toBe(
      '# T\n\n- a (#1)\n- b\n',
    )
    expect(renderTemplate(template, { title: 'T', items: [] })).toBe('# T\n\nNothing.\n')
  })

  it('rejects unbalanced sections', () => {
    expect(() => renderTemplate('{{#a}}x', {})).toThrow(/Unclosed/)
  })
})
