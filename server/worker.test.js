import test from 'node:test'
import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import worker,{profileApi} from './worker.js'
const base={unit:'kg',workouts:[],routines:[],bodyweight:[],customEx:[],active:{privateDraft:true}}
function environment(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));return {JOURNAL_DB:{prepare(sql){const wrap=(args=[])=>({bind:(...a)=>wrap(a),first:async()=>db.prepare(sql).get(...args)||null,run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});return wrap()}}}}
const request=(state=base,rev=0)=>new Request('https://gym.bdprk.com/api/profile',{method:'PUT',headers:{'content-type':'application/json',origin:'https://gym.bdprk.com'},body:JSON.stringify({baseRevision:rev,state})})
test('新版存储独立，空白开始；活动训练不上传，冲突不能覆盖记录',async()=>{
  const env=environment()
  assert.deepEqual(await (await profileApi(new Request('https://gym.bdprk.com/api/profile'),env)).json(),{revision:0,state:null})
  const first=await profileApi(request({...base,routines:[{id:'new-preview'}]}),env)
  assert.equal(first.status,200);const saved=await first.json();assert.equal(saved.revision,1);assert.ok(!('active' in saved.state))
  const conflict=await profileApi(request({...base,routines:[{id:'stale-device'}]}),env)
  assert.equal(conflict.status,409);assert.equal((await conflict.json()).state.routines[0].id,'new-preview')
  assert.equal((await profileApi(request({...base,routines:[{id:'merged'}]},1),env)).status,200)
})
test('匿名、伪造证书头、其他域名与跨站请求无法读取或写入',async()=>{
  const env=environment();env.OWNER_CERT_SHA256='a'.repeat(64)
  const anonymous=await worker.fetch(new Request('https://gym.bdprk.com/api/profile'),env);assert.equal(anonymous.status,401)
  const spoof=await worker.fetch(new Request('https://gym.bdprk.com/api/profile',{headers:{'cf-client-cert-sha256':'a'.repeat(64)}}),env);assert.equal(spoof.status,401)
  assert.equal((await worker.fetch(new Request('https://other.example/api/profile'),env)).status,404)
  const req=request();Object.defineProperty(req,'cf',{value:{tlsClientAuth:{certVerified:'SUCCESS',certRevoked:'0',certFingerprintSHA256:'a'.repeat(64)}}});assert.equal((await worker.fetch(req,env)).status,200)
  const cross=new Request('https://gym.bdprk.com/api/profile',{method:'PUT',headers:{origin:'https://other.example','content-type':'application/json'},body:JSON.stringify({baseRevision:1,state:base})});Object.defineProperty(cross,'cf',{value:req.cf});assert.equal((await worker.fetch(cross,env)).status,401)
})
test('拒绝不完整记录和异常版本，失败不创建记录',async()=>{
  const env=environment()
  assert.equal((await profileApi(request({unit:'kg'}),env)).status,400)
  assert.equal((await profileApi(request(base,-1),env)).status,400)
  assert.equal((await profileApi(request(base,0.5),env)).status,400)
  assert.equal((await profileApi(request({...base,comment:'a'.repeat(4*1024*1024)}),env)).status,400)
  assert.equal((await (await profileApi(new Request('https://gym.bdprk.com/api/profile'),env)).json()).revision,0)
})
