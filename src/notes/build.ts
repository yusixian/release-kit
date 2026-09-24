import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bumpRank, CONFIG_FILE, type Config } from '../config/schema.ts'
import type { Fragment } from '../fragments/parse.ts'
import { parsePr } from '../fragments/validate.ts'
import { fail } from '../issues.ts'
import { renderTemplate } from './render.ts'
import { builtinTemplates } from './templates.ts'

export interface NotesContext {
  version: string
  previous: string
  tag: string
  date: string
}

function loadTemplate(root: string, config: Config): { body: string; titles: Record<string, string> } {
  const name = config.notes.template
  const builtin = builtinTemplates[name]
  if (builtin) return builtin
  const path = join(root, name)
  if (!existsSync(path))
    throw fail.environment('RK004', `Notes template "${name}" not found`, {
      file: CONFIG_FILE,
      fix: `Set "notes.template" to default-en, default-zh, or an existing file path`,
    })
  return { body: readFileSync(path, 'utf8'), titles: {} }
}

const indent = (text: string) => text.replace(/\n(?=.)/g, '\n  ')

export function notesData(config: Config, fragments: Fragment[], titles: Record<string, string>, context: NotesContext) {
  const kinds = Object.entries(config.kinds)
    .filter(([, spec]) => spec.notes)
    .sort(([, a], [, b]) => bumpRank(b.bump) - bumpRank(a.bump))
  const sections = kinds.flatMap(([kind, spec]) => {
    const items = fragments
      .filter((f) => f.data.kind === kind)
      .map((f) => ({ id: f.id, text: indent(f.summary), pr: parsePr(f.data.pr) ?? null }))
    return items.length > 0 ? [{ kind, title: spec.title ?? titles[kind] ?? kind, items }] : []
  })
  const noted = new Set(kinds.map(([kind]) => kind))
  const upgrades = fragments
    .filter((f) => f.upgrade && noted.has(String(f.data.kind)))
    .map((f) => ({ id: f.id, title: f.summary.split('\n')[0]!, text: f.upgrade! }))
  return { ...context, sections, upgrades, hasUpgrades: upgrades.length > 0 }
}

export function renderNotes(root: string, config: Config, fragments: Fragment[], context: NotesContext): string {
  const template = loadTemplate(root, config)
  try {
    return renderTemplate(template.body, notesData(config, fragments, template.titles, context))
  } catch (error) {
    throw fail.environment('RK004', `Notes template "${config.notes.template}" is invalid: ${(error as Error).message}`, {
      file: config.notes.template,
      fix: 'Balance every {{#name}} with a matching {{/name}}',
    })
  }
}

const DATE = '\uE000date\uE000'
const PREVIOUS = '\uE000previous\uE000'
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether `existing` is these notes as rendered on any date, so a re-run on another day still recognizes them. */
export function notesMatch(existing: string, root: string, config: Config, fragments: Fragment[], context: Pick<NotesContext, 'version' | 'tag'>): boolean {
  const rendered = renderNotes(root, config, fragments, { ...context, date: DATE, previous: PREVIOUS })
  const pattern = rendered
    .split(/(\uE000date\uE000|\uE000previous\uE000)/)
    .map((part) => (part === DATE ? '\\d{4}-\\d{2}-\\d{2}' : part === PREVIOUS ? '\\S+' : escapeRegex(part)))
    .join('')
  return new RegExp(`^${pattern}$`).test(existing)
}

export const today = () => new Date().toISOString().slice(0, 10)
