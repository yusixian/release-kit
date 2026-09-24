import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import type { Config } from '../config/schema.ts'
import { fail } from '../issues.ts'

type VersionFile = Config['versioning']['files'][number]

interface ParsedJson {
  data: Record<string, unknown>
  indent: string
  newline: boolean
}

function readJson(root: string, file: VersionFile): ParsedJson {
  const path = join(root, file.path)
  if (!existsSync(path))
    throw fail.environment('RK050', `Version file ${file.path} not found`, {
      file: file.path,
      fix: `Create ${file.path} or update "versioning.files" in release-kit.yaml`,
    })
  const text = readFileSync(path, 'utf8')
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    const indent = text.trim().includes('\n') ? (/^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ') : ''
    return { data, indent, newline: text.endsWith('\n') }
  } catch {
    throw fail.environment('RK050', `${file.path} is not valid JSON`, { file: file.path, fix: `Fix the JSON syntax in ${file.path}` })
  }
}

const segments = (key: string) => key.split('.')

export function readVersion(root: string, file: VersionFile): string {
  let node: unknown = readJson(root, file).data
  for (const seg of segments(file.key)) node = (node as Record<string, unknown> | undefined)?.[seg]
  if (typeof node !== 'string' || !semver.valid(node))
    throw fail.environment('RK050', `"${file.key}" in ${file.path} is not a semver version`, {
      file: file.path,
      fix: `Set "${file.key}" in ${file.path} to a version such as "0.1.0"`,
    })
  return node
}

/** New file content with the version key replaced, keeping key order and indentation. */
export function withVersion(root: string, file: VersionFile, version: string): string {
  const { data, indent, newline } = readJson(root, file)
  const keys = segments(file.key)
  let node = data
  for (const seg of keys.slice(0, -1)) node = node[seg] as Record<string, unknown>
  node[keys.at(-1)!] = version
  return JSON.stringify(data, null, indent) + (newline ? '\n' : '')
}
