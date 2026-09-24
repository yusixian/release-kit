import type { CommandSpec } from '../cli/spec.ts'
import { addCommand } from './add.ts'
import { applyCommand } from './apply.ts'
import { checkCommand } from './check.ts'
import { describeCommand } from './describe.ts'
import { initCommand } from './init.ts'
import { planCommand } from './plan.ts'
import { previewCommand } from './preview.ts'

export const commands: CommandSpec[] = [
  initCommand,
  addCommand,
  checkCommand,
  planCommand,
  previewCommand,
  applyCommand,
  describeCommand,
]
