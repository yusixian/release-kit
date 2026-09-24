#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { run } from './cli/main.ts'

const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readStdin: () => readFileSync(0, 'utf8'),
  stdinIsTTY: Boolean(process.stdin.isTTY),
  env: process.env,
})
process.exitCode = code
