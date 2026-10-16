import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url)),frontend=join(root,'frontend')
const r=spawnSync(process.execPath,[join(frontend,'node_modules/vite/bin/vite.js'),'build'],{cwd:frontend,stdio:'inherit',env:{...process.env,VITE_LOCAL_PAGES:'1',VITE_TRAINNOTE:'1',APP_BUILD:'journal.preview.1'}})
if(r.status)process.exit(r.status)
const manifestPath=join(frontend,'dist/manifest.json')
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));manifest.name='训练手记';manifest.short_name='训练手记';manifest.theme_color='#376950';manifest.background_color='#f6f7f5'
writeFileSync(manifestPath,JSON.stringify(manifest,null,2))
