import { resolve } from 'node:path'
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util'
import { commands } from '../commands/index.ts'
import { CliError, ExitCode, fail, hasErrors, issue } from '../issues.ts'
import { VERSION } from '../meta.ts'
import { commandHelp, rootHelp } from './help.ts'
import { emit } from './output.ts'
import { globalOptions, type CommandSpec, type Io, type Values } from './spec.ts'

function parse(command: CommandSpec, argv: string[]): Values {
  const specs = { ...command.options, ...globalOptions }
  const config: ParseArgsOptionsConfig = Object.fromEntries(
    Object.entries(specs).map(([name, s]) => [name, { type: s.type, ...(s.multiple && { multiple: true }), ...(s.short && { short: s.short }) }]),
  )
  let values: Values
  try {
    values = parseArgs({ args: argv, options: config, strict: true, allowPositionals: false }).values as Values
  } catch (error) {
    throw fail.usage('RK900', (error as Error).message, `release-kit ${command.name} --help`)
  }
  if (values.help) return values
  for (const [name, spec] of Object.entries(specs)) {
    const value = values[name]
    if (value === undefined && spec.default !== undefined) values[name] = spec.default
    if (spec.required && value === undefined)
      throw fail.usage('RK902', `Missing required option --${name}`, `release-kit ${command.name} --${name} <${spec.valueName ?? 'value'}>`)
    if (spec.enum && typeof value === 'string' && !spec.enum.includes(value))
      throw fail.usage('RK902', `--${name} must be one of: ${spec.enum.join(', ')}`, `release-kit ${command.name} --${name} ${spec.enum[0]}`)
  }
  return values
}

export async function run(argv: string[], io: Io): Promise<number> {
  const json = argv.includes('--json')
  const [name, ...rest] = argv
  if (name === undefined || name === '--help' || name === '-h') {
    io.stdout(`${rootHelp(commands, VERSION)}\n`)
    return name === undefined ? ExitCode.usage : ExitCode.ok
  }
  if (name === '--version' || name === '-v') {
    io.stdout(`${VERSION}\n`)
    return ExitCode.ok
  }
  const command = commands.find((c) => c.name === name)
  try {
    if (!command)
      throw fail.usage('RK900', `Unknown command "${name}"`, `Use one of: ${commands.map((c) => c.name).join(', ')}`)
    const values = parse(command, rest)
    if (values.help) {
      io.stdout(`${commandHelp(command)}\n`)
      return ExitCode.ok
    }
    const root = resolve(io.cwd, (values.cwd as string | undefined) ?? '.')
    const result = await command.run({ root, json, io }, values)
    const issues = result.issues ?? []
    const exitCode = result.exitCode ?? (hasErrors(issues) ? ExitCode.validation : ExitCode.ok)
    emit(io, json, { command: name, ok: exitCode === 0, data: result.data, text: result.text, issues })
    return exitCode
  } catch (error) {
    if (error instanceof CliError) {
      emit(io, json, { command: command ? name : null, ok: false, issues: error.issues })
      return error.exitCode
    }
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    emit(io, json, {
      command: command ? name : null,
      ok: false,
      issues: [issue('RK999', `Internal error: ${message}`, { fix: 'Report this at the release-kit issue tracker' })],
    })
    return ExitCode.environment
  }
}
