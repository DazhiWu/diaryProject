import { spawnSync } from 'node:child_process'

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const forwardedArgs = process.argv.slice(2)
if (forwardedArgs[0] === '--') forwardedArgs.shift()

const result = spawnSync(
  pnpmCommand,
  ['exec', 'wrangler', 'deploy', ...forwardedArgs],
  {
    env: {
      ...process.env,
      OPEN_NEXT_DEPLOY: 'true',
    },
    stdio: 'inherit',
  },
)

if (result.error) {
  console.error('Failed to start Wrangler deploy:', result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
