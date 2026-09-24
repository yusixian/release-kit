import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { bool, str, type CommandSpec } from '../cli/spec.ts'
import { agentsSnippet, upsertBlock } from '../agents/snippet.ts'
import { SKILL_PATH, skillMarkdown } from '../agents/skill.ts'
import { loadConfig } from '../config/load.ts'
import { presetNames, presetYaml, type PresetName } from '../config/presets.ts'
import { CONFIG_FILE } from '../config/schema.ts'

type Action = 'created' | 'updated' | 'appended' | 'unchanged' | 'skipped'

export const initCommand: CommandSpec = {
  name: 'init',
  summary: 'Create release-kit.yaml and the fragment directory; --agents also writes an AGENTS.md block and an Agent Skill',
  writes: 'yes',
  options: {
    preset: { type: 'string', valueName: 'name', enum: presetNames, default: 'library', description: 'Starting configuration' },
    agents: { type: 'boolean', description: 'Also write the AGENTS.md block and skills/release-kit/SKILL.md' },
  },
  examples: ['release-kit init --preset web --agents --json'],
  run(ctx, values) {
    const files: { path: string; action: Action }[] = []
    const write = (path: string, content: string, action: Action) => {
      const full = join(ctx.root, path)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, content)
      files.push({ path, action })
    }
    const create = (path: string, content: string) => {
      const full = join(ctx.root, path)
      if (!existsSync(full)) return write(path, content, 'created')
      files.push({ path, action: readFileSync(full, 'utf8') === content ? 'unchanged' : 'skipped' })
    }

    const preset = str(values, 'preset') as PresetName
    create(CONFIG_FILE, presetYaml(preset))
    const { config } = loadConfig(ctx.root)
    create(`${config.changes}/.gitkeep`, '')

    if (bool(values, 'agents')) {
      const agentsFile = join(ctx.root, 'AGENTS.md')
      const existing = existsSync(agentsFile) ? readFileSync(agentsFile, 'utf8') : null
      const { content, action } = upsertBlock(existing, agentsSnippet(config))
      if (action === 'unchanged') files.push({ path: 'AGENTS.md', action })
      else write('AGENTS.md', content, action)
      create(SKILL_PATH, skillMarkdown)
    }

    const skipped = files.filter((f) => f.action === 'skipped')
    return {
      data: { preset, files },
      text: [
        ...files.map((f) => `${f.action} ${f.path}`),
        ...(skipped.length > 0 ? ['', 'Skipped files already exist with different content; edit them by hand.'] : []),
      ].join('\n'),
    }
  },
}
