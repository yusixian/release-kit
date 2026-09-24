import type { Config } from '../config/schema.ts'

/** JSON Schema for fragment frontmatter; narrowed to the project's kinds and fields when a config is available. */
export function fragmentJsonSchema(config: Config | null): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    kind: config
      ? { type: 'string', enum: Object.keys(config.kinds), description: 'Change kind; maps to a version level' }
      : { type: 'string', description: 'Change kind declared under "kinds" in release-kit.yaml' },
    pr: { type: 'integer', minimum: 1, description: 'Pull request number' },
  }
  const allOf: unknown[] = []
  const required = ['kind']
  for (const [name, spec] of Object.entries(config?.fields ?? {})) {
    properties[name] = { type: 'string', ...(spec.enum && { enum: spec.enum }), ...(spec.description && { description: spec.description }) }
    if (spec.required) required.push(name)
    else if (spec.requiredFor.length > 0)
      // oxlint-disable-next-line unicorn/no-thenable -- JSON Schema if/then keyword
      allOf.push({ if: { properties: { kind: { enum: spec.requiredFor } } }, then: { required: [name] } })
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'release-kit change fragment frontmatter',
    description:
      'YAML frontmatter of .release/changes/<id>.md. The Markdown body below it describes the user-visible change; kinds that require an upgrade need a "## Upgrade" or "## 升级" section.',
    type: 'object',
    properties,
    required,
    ...(allOf.length > 0 && { allOf }),
    ...(config && { additionalProperties: false }),
  }
}
