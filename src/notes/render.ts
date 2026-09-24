type Scope = Record<string, unknown>

interface Text {
  type: 'text'
  value: string
}
interface Variable {
  type: 'var'
  name: string
}
interface Section {
  type: 'section'
  name: string
  inverted: boolean
  children: Node[]
}
type Node = Text | Variable | Section

const TAG = /\{\{\s*([#^/]?)\s*([\w.]+)\s*\}\}/g
const STANDALONE = /^[ \t]*(\{\{\s*[#^/]\s*[\w.]+\s*\}\})[ \t]*\r?\n/gm

function parse(template: string): Node[] {
  const root: Node[] = []
  const stack: { name: string; children: Node[] }[] = [{ name: '', children: root }]
  let last = 0
  const source = template.replace(STANDALONE, '$1')
  for (const match of source.matchAll(TAG)) {
    const top = stack.at(-1)!
    if (match.index > last) top.children.push({ type: 'text', value: source.slice(last, match.index) })
    last = match.index + match[0].length
    const [, sigil, name] = match as unknown as [string, string, string]
    if (sigil === '/') {
      if (stack.length === 1 || top.name !== name) throw new Error(`Unexpected {{/${name}}} in template`)
      stack.pop()
    } else if (sigil === '#' || sigil === '^') {
      const section: Section = { type: 'section', name, inverted: sigil === '^', children: [] }
      top.children.push(section)
      stack.push({ name, children: section.children })
    } else {
      top.children.push({ type: 'var', name })
    }
  }
  if (stack.length > 1) throw new Error(`Unclosed {{#${stack.at(-1)!.name}}} in template`)
  if (last < source.length) root.push({ type: 'text', value: source.slice(last) })
  return root
}

function lookup(scopes: Scope[], name: string): unknown {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (name in scopes[i]!) return scopes[i]![name]
  }
  return undefined
}

const truthy = (value: unknown) => (Array.isArray(value) ? value.length > 0 : Boolean(value))

function renderNodes(nodes: Node[], scopes: Scope[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value
      const value = lookup(scopes, node.name)
      if (node.type === 'var') return value === undefined || value === null ? '' : String(value)
      if (node.inverted) return truthy(value) ? '' : renderNodes(node.children, scopes)
      if (!truthy(value)) return ''
      if (Array.isArray(value)) return value.map((item) => renderNodes(node.children, [...scopes, item as Scope])).join('')
      return renderNodes(node.children, typeof value === 'object' ? [...scopes, value as Scope] : scopes)
    })
    .join('')
}

/** Minimal Mustache subset: {{var}}, {{#section}}, {{^inverted}}; no HTML escaping. */
export function renderTemplate(template: string, data: Scope): string {
  const output = renderNodes(parse(template), [data])
  return `${output.replace(/\n{3,}/g, '\n\n').trim()}\n`
}
