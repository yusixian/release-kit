import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const out = execFileSync(process.execPath, ['dist/cli.mjs', 'describe', '--json', '--cwd', tmpdir()], { encoding: 'utf8' })
const { schemas } = JSON.parse(out)
mkdirSync('schema', { recursive: true })
writeFileSync('schema/config.json', `${JSON.stringify(schemas.config, null, 2)}\n`)
console.log('wrote schema/config.json')
