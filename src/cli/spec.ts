import type { Issue } from '../issues.ts'

export interface OptionSpec {
  type: 'string' | 'boolean'
  description: string
  valueName?: string
  multiple?: boolean
  short?: string
  required?: boolean
  enum?: readonly string[]
  default?: string | boolean
}

export type Values = Record<string, string | boolean | string[] | undefined>

export interface Io {
  cwd: string
  stdout: (text: string) => void
  stderr: (text: string) => void
  readStdin: () => string
  stdinIsTTY: boolean
  env: Record<string, string | undefined>
}

export interface Context {
  root: string
  json: boolean
  io: Io
}

export interface CommandResult {
  data: Record<string, unknown>
  text: string
  issues?: Issue[]
  exitCode?: 0 | 1
}

export interface CommandSpec {
  name: string
  summary: string
  writes: 'yes' | 'no' | 'optional'
  options: Record<string, OptionSpec>
  examples: string[]
  run: (ctx: Context, values: Values) => CommandResult | Promise<CommandResult>
}

export const globalOptions: Record<string, OptionSpec> = {
  json: { type: 'boolean', description: 'Print machine-readable JSON (schemaVersion 1) to stdout' },
  cwd: { type: 'string', valueName: 'dir', description: 'Repository root (defaults to the current directory)' },
  help: { type: 'boolean', short: 'h', description: 'Show help for the command' },
}

export const str = (values: Values, key: string) => values[key] as string | undefined
export const bool = (values: Values, key: string) => values[key] === true
export const list = (values: Values, key: string) => (values[key] as string[] | undefined) ?? []
