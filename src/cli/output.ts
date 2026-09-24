import type { Issue } from '../issues.ts'
import type { Io } from './spec.ts'

export const SCHEMA_VERSION = 1

export function formatIssue(i: Issue): string {
  const where = i.file ? ` ${i.file}${i.line ? `:${i.line}` : ''}` : ''
  return `${i.severity} ${i.code}${where} ${i.message}${i.fix ? `\n  fix: ${i.fix}` : ''}`
}

export interface Report {
  command: string | null
  ok: boolean
  data?: Record<string, unknown>
  text?: string
  issues: Issue[]
}

export function emit(io: Io, json: boolean, report: Report): void {
  if (json) {
    const payload = { schemaVersion: SCHEMA_VERSION, ok: report.ok, command: report.command, ...report.data, issues: report.issues }
    io.stdout(`${JSON.stringify(payload, null, 2)}\n`)
    return
  }
  if (report.text) io.stdout(report.text.endsWith('\n') ? report.text : `${report.text}\n`)
  if (report.issues.length > 0) io.stderr(`${report.issues.map(formatIssue).join('\n')}\n`)
}
