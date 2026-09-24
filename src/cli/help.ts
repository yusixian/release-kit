import { globalOptions, type CommandSpec, type OptionSpec } from './spec.ts'

const flag = (name: string, spec: OptionSpec) =>
  `${spec.short ? `-${spec.short}, ` : ''}--${name}${spec.type === 'string' ? ` <${spec.valueName ?? 'value'}>` : ''}`

function optionLines(options: Record<string, OptionSpec>): string[] {
  const entries = Object.entries(options)
  const width = Math.max(...entries.map(([n, s]) => flag(n, s).length))
  return entries.map(([name, spec]) => {
    const notes = [
      spec.required && 'required',
      spec.multiple && 'repeatable',
      spec.enum && `one of: ${spec.enum.join(', ')}`,
      spec.default !== undefined && `default: ${String(spec.default)}`,
    ].filter(Boolean)
    return `  ${flag(name, spec).padEnd(width)}  ${spec.description}${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`
  })
}

export function rootHelp(commands: CommandSpec[], version: string): string {
  const width = Math.max(...commands.map((c) => c.name.length))
  return [
    `release-kit ${version} - versioning and release notes from change fragments`,
    '',
    'Usage: release-kit <command> [options]',
    '',
    'Commands:',
    ...commands.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
    '',
    'Global options:',
    ...optionLines(globalOptions),
    '',
    'Exit codes: 0 ok, 1 validation failed, 2 usage error, 3 environment error.',
    'Machine-readable reference: release-kit describe --json',
  ].join('\n')
}

export function commandHelp(command: CommandSpec): string {
  return [
    `Usage: release-kit ${command.name} [options]`,
    '',
    command.summary,
    '',
    'Options:',
    ...optionLines({ ...command.options, ...globalOptions }),
    '',
    'Examples:',
    ...command.examples.map((e) => `  ${e}`),
  ].join('\n')
}
