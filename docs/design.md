# release-kit 设计草案

状态：讨论中，未实现

日期：2026-09-24

## 1. 定位

面向 AI agent 的版本号与发版说明工具。agent 在 PR 里写变更片段，CI 校验，控制面（如 Telegram bot）读取发布计划，人确认后发布。

- **确定性核心**：版本号只由片段计算，同样的输入得到同样的结果。
- **AI 只润色**：AI 可以合并同类项、改写措辞，但不能丢项或编造；工具负责校验这一点。
- **通用**：不绑定 GitHub、Telegram 或具体仓库结构，这些由配置和可选子命令提供。

## 2. 设计原则

| 原则 | 具体要求 |
|---|---|
| 机器可读 | 每个命令都支持 `--json`；输出带 `schemaVersion`，字段只增不改 |
| 非交互 | 从不等待输入；缺参数直接报错，并给出可执行的修复命令 |
| 自描述 | `release-kit describe --json` 输出命令、参数、片段与配置的 JSON Schema；agent 不读文档也能用 |
| 可操作的错误 | 每个问题包含 `code`、`file`、`line`、`message`、`fix`（可直接运行的命令或修改建议） |
| 幂等 | 同一 id 重复 `add` 不产生重复片段；`apply` 可以安全重跑 |
| 退出码稳定 | `0` 成功；`1` 校验未通过；`2` 用法错误；`3` 环境错误（如缺少 git tag） |
| 核心离线 | 读写本地文件与 git；联网操作（GitHub）放在可选子命令里 |

## 3. 概念

- **change**：一个面向用户的改动，对应 `.release/changes/<id>.md` 一个文件。
- **kind**：改动类型，在配置中定义，每个 kind 映射到一个版本级别。
- **channel**：`stable`，或 `alpha` / `beta` / `rc` 等预发布通道。
- **release**：一次发布 = 版本号写入 + 发版说明文件 + tag。

## 4. 片段格式

```md
---
kind: feat
docs: updated
pr: 128 # 可选；CI 可自动补
---

话题群中的项目话题现在可以通过 YAML 自动创建。
```

- 正文面向用户，写「用户能感知到什么变化」，不写文件路径和函数名（`check` 会提示）。
- `kind: breaking` 必须带升级说明：

```md
---
kind: breaking
docs: updated
---

`harness.yaml` 中的 `topics` 改为按项目声明。

## 升级

把原来的 `topics.<name>` 移到 `projects.<name>.topic`。
```

- 自定义字段在配置中声明，并带校验规则（枚举、必填条件）。

## 5. 配置

`release-kit.yaml`，带 `$schema`，编辑器和 agent 都能校验：

```yaml
# yaml-language-server: $schema=https://unpkg.com/@coszone/release-kit/schema/config.json
version: 1
changes: .release/changes
notes:
  dir: docs/releases
  file: "v{version}.md"
  template: default-zh # default-en | default-zh | 自定义模板路径
versioning:
  files:
    - { path: package.json, key: version }
  tag: "v{version}"
  pre1: # 0.x 阶段的规则
    breaking: minor
  channels:
    alpha: { strategy: tag-only } # 只打 tag，不提交版本号
kinds:
  fix: { bump: patch, title: 修复 }
  perf: { bump: patch, title: 性能 }
  feat: { bump: minor, title: 新功能 }
  breaking: { bump: major, title: 不兼容变更, require: [upgrade] }
  internal: { bump: none, notes: false }
fields:
  docs: { enum: [updated, not-needed], requiredFor: [feat, breaking] }
checks:
  requireChange:
    paths: ["src/**", "apps/**", "packages/**"]
    exemptTitleTypes: [docs, chore, test, ci]
  prTitle: conventional # 标题类型须与片段 kind 对应
  body:
    maxLength: 400
    discourage: ["\\bsrc/", "\\.tsx?\\b"]
```

预设：`release-kit init --preset web|electron|library` 生成对应的默认配置。

## 6. 命令

| 命令 | 作用 | 修改文件 |
|---|---|---|
| `init [--preset …] [--agents]` | 生成配置、片段目录；`--agents` 另外生成 AGENTS.md 片段与 Agent Skill | 是 |
| `add --kind <k> --body <text> \| --body-file -` | 新建片段，自动生成 id | 是 |
| `check [--base <ref>] [--pr-title <t>]` | 校验片段格式、kind 与 PR 标题是否一致、必需片段是否存在、正文规则 | 否 |
| `plan [--channel <c>]` | 计算下一个版本号，并说明原因（由哪个片段决定、是否触发 0.x 规则） | 否 |
| `preview --channel alpha` | 根据已有 tag 算出下一个 `X.Y.Z-alpha.N`，输出版本号与说明 | 否（可选写入构建目录） |
| `notes --draft` | 输出供 AI 润色的结构化材料 | 否 |
| `notes --write --from <file>` | 校验润色稿后写入说明文件 | 是 |
| `apply [--version <v>] [--dry-run]` | 写入版本号与说明文件，删除已消费的片段 | 是 |
| `describe` | 输出命令、配置与片段的 JSON Schema | 否 |
| `explain <code>` | 解释某个错误码及修复方法 | 否 |

### `plan --json` 示例

```json
{
  "schemaVersion": 1,
  "channel": "stable",
  "current": "0.14.2",
  "next": "0.15.0",
  "bump": "minor",
  "pre1Adjusted": true,
  "reason": [{ "change": "topic-yaml", "kind": "breaking", "effective": "minor" }],
  "changes": [
    { "id": "topic-yaml", "kind": "breaking", "pr": 128, "docs": "updated" },
    { "id": "save-feedback", "kind": "fix", "pr": 131, "docs": "not-needed" }
  ],
  "notesPath": "docs/releases/v0.15.0.md",
  "tag": "v0.15.0"
}
```

### `check --json` 示例

```json
{
  "schemaVersion": 1,
  "ok": false,
  "issues": [
    {
      "code": "RK012",
      "severity": "error",
      "file": ".release/changes/save-feedback.md",
      "line": 2,
      "message": "PR 标题类型是 feat，但片段 kind 是 fix",
      "fix": "把 kind 改为 feat，或把 PR 标题改为 fix: …"
    }
  ]
}
```

## 7. AI 润色协议

1. `notes --draft --json` 输出片段列表、按 kind 分组的草稿、模板，以及规则：不得新增片段以外的事实，breaking 必须保留升级说明。
2. AI 返回结构化结果：每一条说明注明来源片段 id，可以一条对应多个 id（合并同类项）。

```json
{
  "sections": [
    {
      "kind": "feat",
      "items": [{ "ids": ["topic-yaml"], "text": "项目话题可以由 YAML 自动创建。" }]
    }
  ]
}
```

3. `notes --write --from polished.json` 校验：每个片段 id 至少出现一次；没有未知 id；breaking 带升级段落。通过后按模板渲染成 Markdown。
4. 不经过 AI 时，直接用模板渲染片段原文。

## 8. Agent 集成

- `init --agents` 往 AGENTS.md 写一段规则：何时必须写片段、kind 选择表、示例命令、提交前运行 `release-kit check`。
- 同时生成 `skills/release-kit/SKILL.md`，可以安装到 `~/.agents/skills`，供 Claude Code、Codex 等通用。
- 所有错误都给出下一步命令，agent 可以照着修复。
- `describe --json` 让 agent 在不同版本的工具上都拿到准确的参数。

## 9. 与现有工具的区别

| | Changesets | changie | release-please | knope | release-kit |
|---|---|---|---|---|---|
| 片段文件 | 有，frontmatter 只允许「包名: 级别」 | 有，kind + 自定义字段 | 无（读 commit） | 有 | 有，kind + 自定义字段 |
| 每个版本一个说明文件 | 否（累积 CHANGELOG） | 是 | 否 | 否 | 是 |
| JSON 输出 | 编程 API | 无 | 无 | 无 | 所有命令 |
| 0.x 规则 | 无 | 无 | 有开关 | 未确认 | 有 |
| 预发布序号自增 | pre mode | 需手动传 | 仅 release PR 循环 | 未确认 | 基于 tag 自增 |
| AI 润色校验 | 无 | 无 | 无 | 无 | 有 |
| 分发 | npm | Go 二进制，也有 npm 包 | Action / npm | Rust 二进制 | npm |

changie 最接近；借鉴它的 kind 映射版本级别、版本文件名模板、版本号替换规则。

## 10. 技术选型

- TypeScript、Node ≥ 20、ESM；用 `tsdown` 构建，单一 bin。
- 依赖尽量少：`yaml`、`zod`（同时生成 JSON Schema）、`semver`、`picomatch`；模板用内置的极简渲染器。
- 测试：vitest + fixture 仓库（临时 git 仓库，覆盖 tag、0.x、预发布场景）。
- 包名 `@coszone/release-kit`，bin 名 `release-kit`；临时调用用 `npx @coszone/release-kit`。
- 发布：GitHub Actions 通过 npm Trusted Publishing（OIDC）发布并附带 provenance，不保存长期 token（配置前核对 npm 当前文档）；配置在浏览器中完成，需 owner 登录。
- 可选配套 GitHub Action（`check`、`plan`）。

## 11. 版本规划

| 版本 | 范围 |
|---|---|
| v0.1 | `init`、`add`、`check`、`plan`、`preview`、`apply`、`describe`；YAML 配置；中英文默认模板 |
| v0.2 | AI 润色协议（`notes --draft/--write`）、`explain`、PR 评论摘要、GitHub Action |
| v0.3 | monorepo 多项目独立版本（按需） |

首批使用方：cos-tool-bot、koyori、cosine-gallery。

## 12. 暂定事项

已定：包名 `@coszone/release-kit`。

以下为默认建议，owner 未提异议，暂按此执行：

1. 模板：默认英文，内置 `default-zh`；可配置同一版本同时输出多语言（如 `v1.2.0.md` 与 `v1.2.0.zh-CN.md`）。
2. 片段目录：`.release/changes/`；自定义模板等放在 `.release/` 下。
3. PR 号：CI 中从环境变量读取；缺失时 `apply` 通过 git 找到新增片段的 commit，可选调用 GitHub API 反查；离线时留空。
4. 预发布序号：默认只看 git tag，缺 tag 时提示 `git fetch --tags`；可选同时参考 GitHub Release。
5. 许可证：MIT。
