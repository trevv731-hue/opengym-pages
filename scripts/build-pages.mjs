import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const frontend = join(root, 'frontend')
const result = spawnSync(process.execPath, [join(frontend, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, VITE_LOCAL_PAGES: '1', APP_BUILD: 'pages.1' },
})
if (result.status !== 0) process.exit(result.status || 1)
const docs = join(root, 'docs')
mkdirSync(docs, { recursive: true })
cpSync(join(frontend, 'dist'), docs, { recursive: true })
cpSync(join(root, 'LICENSE'), join(docs, 'LICENSE'))
cpSync(join(root, 'NOTICE.md'), join(docs, 'NOTICE.md'))
writeFileSync(join(docs, '.nojekyll'), '')
if (!existsSync(join(docs, 'exercise-media/still/0001.webp'))) {
  throw new Error('Exercise media must be staged in docs/exercise-media before publication.')
}
console.log('GitHub Pages artifact ready:', resolve(docs))
