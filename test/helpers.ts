import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach } from 'vitest'
import { run } from '../src/cli/main.ts'
import { presetYaml, type PresetName } from '../src/config/presets.ts'

const created: string[] = []

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

export function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'release-kit-test-')))
  created.push(dir)
  return dir
}

export function git(dir: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } },
  )
}

export function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
}

export const read = (dir: string, path: string) => readFileSync(join(dir, path), 'utf8')
export const exists = (dir: string, path: string) => existsSync(join(dir, path))

export interface RepoOptions {
  version?: string
  preset?: PresetName
  config?: string
  files?: Record<string, string>
  tags?: string[]
  git?: boolean
}

/** Temporary project with a committed config and package.json; tags point at the initial commit. */
export function createRepo(options: RepoOptions = {}): string {
  const dir = tempDir()
  writeFiles(dir, {
    'package.json': `${JSON.stringify({ name: 'fixture', version: options.version ?? '0.14.2' }, null, 2)}\n`,
    'release-kit.yaml': options.config ?? presetYaml(options.preset ?? 'library'),
    ...options.files,
  })
  if (options.git === false) return dir
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  for (const tag of options.tags ?? []) git(dir, 'tag', tag)
  return dir
}

export function fragment(kind: string, body: string, fields: Record<string, string | number> = {}): string {
  const lines = Object.entries({ kind, ...fields }).map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`
}

export interface CliResult {
  code: number
  stdout: string
  stderr: string
  json: Record<string, unknown>
}

export async function cli(dir: string, args: string[], stdin?: string, env: Record<string, string> = {}): Promise<CliResult> {
  let stdout = ''
  let stderr = ''
  const code = await run(args, {
    cwd: dir,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    readStdin: () => stdin ?? '',
    stdinIsTTY: stdin === undefined,
    env,
  })
  const normalize = (s: string) => s.replaceAll(dir, '<root>')
  stdout = normalize(stdout)
  stderr = normalize(stderr)
  const json = args.includes('--json') ? (JSON.parse(stdout) as Record<string, unknown>) : {}
  return { code, stdout, stderr, json }
}
