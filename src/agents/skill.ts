export const SKILL_PATH = 'skills/release-kit/SKILL.md'

export const skillMarkdown = `---
name: release-kit
description: Write and validate release change fragments with release-kit, and plan, preview or apply releases. Use when a change affects users and needs a release note, when "release-kit check" fails locally or in CI, or when asked for the next version or release notes.
---

# release-kit

release-kit computes versions and release notes from change fragments in \`.release/changes/<id>.md\`. Each fragment has YAML frontmatter (\`kind\`, optional \`pr\`, custom fields) and a short body written for users.

## Workflow

1. Read the project's rules: \`release-kit describe --json\` lists commands, options, the config schema and the fragment schema (kinds and fields for this repository).
2. After a user-visible change, add a fragment:
   \`release-kit add --kind <kind> --body "<what users notice>" [--field name=value] --json\`
   For long bodies pipe Markdown: \`release-kit add --kind feat --body-file - --json < body.md\`.
3. Validate before committing: \`release-kit check --base origin/main --pr-title "<PR title>" --json\`.
4. Fix every issue using its \`fix\` field, then run \`check\` again until \`ok\` is \`true\`.

## Writing fragments

- Describe the effect for users; avoid file paths, function names and implementation details.
- Pick the kind from \`describe --json\` (\`schemas.fragment.properties.kind.enum\`); the PR title type must match the highest kind.
- Breaking kinds need a \`## Upgrade\` (or \`## 升级\`) section with concrete migration steps.
- Do not invent PR numbers; leave \`pr\` out when unknown.

## Releasing

- \`release-kit plan --json\` shows the next version and which fragments decided it; 0.x projects map breaking changes to minor (\`pre1Adjusted\`).
- \`release-kit preview --channel alpha --json\` gives the next prerelease version from git tags without writing files.
- \`release-kit apply --dry-run --json\` shows the version files, notes file and deleted fragments; \`apply\` writes them. Leaving 0.x requires \`apply --version 1.0.0\`.
- Commit, tag and publish only when the user asks; \`apply\` prints the commands in \`nextSteps\`.

## Exit codes

\`0\` ok, \`1\` validation failed (read \`issues\`), \`2\` usage error (fix the command), \`3\` environment error (for example run \`git fetch --tags\`). Commands never prompt.
`
