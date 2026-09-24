export type Severity = 'error' | 'warning'

export interface Issue {
  code: string
  severity: Severity
  file: string | null
  line: number | null
  message: string
  fix: string | null
}

export const ExitCode = {
  ok: 0,
  validation: 1,
  usage: 2,
  environment: 3,
} as const

export type FailureExitCode = 1 | 2 | 3

export const catalog = {
  RK001: 'Config file not found',
  RK002: 'Config does not match the schema',
  RK003: 'Config is not valid YAML',
  RK004: 'Notes template not found or invalid',
  RK010: 'Fragment frontmatter is missing or invalid',
  RK011: 'Fragment kind is missing or unknown',
  RK012: 'PR title type does not match the fragment kinds',
  RK013: 'PR title is not a Conventional Commits title',
  RK014: 'Fragment field has a value outside its enum',
  RK015: 'Fragment is missing a required field',
  RK016: 'Fragment has a field that is not declared in the config',
  RK017: 'Fragment is missing its upgrade section',
  RK018: 'Fragment body is empty',
  RK019: 'Fragment body exceeds the maximum length',
  RK020: 'Fragment body mentions implementation details',
  RK021: 'Fragment pr is not a positive integer',
  RK030: 'Change fragment required but missing',
  RK031: 'PR title implies no release but fragments bump the version',
  RK040: 'Git is unavailable or this is not a git repository',
  RK041: 'Git ref not found',
  RK042: 'No release tags found',
  RK043: 'Version file is behind the latest release tag',
  RK050: 'Version file is missing or unreadable',
  RK051: 'Notes file already exists with different content',
  RK900: 'Unknown command or option',
  RK901: 'Unknown channel',
  RK902: 'Invalid or missing argument',
  RK903: 'Invalid version',
  RK999: 'Internal error',
} as const

export type IssueCode = keyof typeof catalog

export interface IssueInit {
  file?: string | null
  line?: number | null
  fix?: string | null
  severity?: Severity
}

export function issue(code: IssueCode, message: string, init: IssueInit = {}): Issue {
  return {
    code,
    severity: init.severity ?? 'error',
    file: init.file ?? null,
    line: init.line ?? null,
    message,
    fix: init.fix ?? null,
  }
}

export function warning(code: IssueCode, message: string, init: IssueInit = {}): Issue {
  return issue(code, message, { ...init, severity: 'warning' })
}

export class CliError extends Error {
  constructor(
    readonly exitCode: FailureExitCode,
    readonly issues: Issue[],
  ) {
    super(issues[0]?.message ?? 'release-kit failed')
  }
}

export const fail = {
  validation: (issues: Issue[]) => new CliError(ExitCode.validation, issues),
  usage: (code: IssueCode, message: string, fix?: string) =>
    new CliError(ExitCode.usage, [issue(code, message, { fix })]),
  environment: (code: IssueCode, message: string, init: IssueInit = {}) =>
    new CliError(ExitCode.environment, [issue(code, message, init)]),
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'error')
