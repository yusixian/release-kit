export interface BuiltinTemplate {
  body: string
  titles: Record<string, string>
}

const en = `# {{version}}

Released {{date}}

{{#sections}}
## {{title}}

{{#items}}
- {{text}}{{#pr}} (#{{pr}}){{/pr}}
{{/items}}

{{/sections}}
{{#hasUpgrades}}
## Upgrade guide

{{#upgrades}}
### {{title}}

{{text}}

{{/upgrades}}
{{/hasUpgrades}}
`

const zh = `# {{version}}

发布日期：{{date}}

{{#sections}}
## {{title}}

{{#items}}
- {{text}}{{#pr}}（#{{pr}}）{{/pr}}
{{/items}}

{{/sections}}
{{#hasUpgrades}}
## 升级指南

{{#upgrades}}
### {{title}}

{{text}}

{{/upgrades}}
{{/hasUpgrades}}
`

export const builtinTemplates: Record<string, BuiltinTemplate> = {
  'default-en': {
    body: en,
    titles: { breaking: 'Breaking changes', feat: 'Features', fix: 'Bug fixes', perf: 'Performance' },
  },
  'default-zh': {
    body: zh,
    titles: { breaking: '不兼容变更', feat: '新功能', fix: '修复', perf: '性能' },
  },
}
