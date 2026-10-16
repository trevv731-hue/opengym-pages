import {ownerAuthorized,ownerAuthRoute,ownerDenied,safeBrowserMutation} from './owner-auth.js'
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}})
const valid=state=>state&&typeof state==='object'&&!Array.isArray(state)&&['workouts','routines','bodyweight','customEx'].every(k=>Array.isArray(state[k]))&&['kg','lbs'].includes(state.unit)
async function boundedJson(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('Invalid content type')
  const reader=request.body?.getReader();if(!reader)throw Error('Missing body')
  const chunks=[];let size=0
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw Error('Too large')}chunks.push(value)}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length}
  return JSON.parse(new TextDecoder().decode(buffer))
}
export async function profileApi(request,env){
  if(request.method==='GET'){
    const row=await env.JOURNAL_DB.prepare('SELECT revision,state_json,updated FROM journal_profile WHERE id=1').first()
    return json(row?{revision:row.revision,state:JSON.parse(row.state_json),updated:row.updated}:{revision:0,state:null})
  }
  if(request.method!=='PUT')return json({error:'Method not allowed'},405)
  let body
  try{body=await boundedJson(request)}catch{return json({error:'记录格式不正确或内容过大'},400)}
  if(!Number.isSafeInteger(body.baseRevision)||body.baseRevision<0||!valid(body.state))return json({error:'记录格式不完整'},400)
  const state={...body.state};delete state.active;delete state._wid
  const serialized=JSON.stringify(state),now=new Date().toISOString()
  const result=body.baseRevision===0
    ?await env.JOURNAL_DB.prepare('INSERT INTO journal_profile(id,revision,state_json,updated) VALUES(1,1,?,?) ON CONFLICT(id) DO NOTHING').bind(serialized,now).run()
    :await env.JOURNAL_DB.prepare('UPDATE journal_profile SET revision=revision+1,state_json=?,updated=? WHERE id=1 AND revision=?').bind(serialized,now,body.baseRevision).run()
  if(!result.meta.changes){const row=await env.JOURNAL_DB.prepare('SELECT revision,state_json FROM journal_profile WHERE id=1').first();return json({revision:row?.revision||0,state:row?JSON.parse(row.state_json):null},409)}
  return json({revision:body.baseRevision+1,state})
}
export default {
  async fetch(request,env){
    const url=new URL(request.url)
    const local=env.LOCAL_PREVIEW==='1'&&['localhost','127.0.0.1'].includes(url.hostname)
    if(!local&&url.hostname!=='gym.bdprk.com')return new Response('Not found',{status:404})
    if(url.pathname.startsWith('/auth/'))return ownerAuthRoute(request,env)
    if(!local&&!await ownerAuthorized(request,env))return ownerDenied(request)
    if(url.pathname.startsWith('/api/')){
      if(!local&&!safeBrowserMutation(request))return json({error:'Forbidden'},403)
      if(url.pathname!=='/api/profile')return json({error:'Not found'},404)
      try{return await profileApi(request,env)}catch{return json({error:'暂时无法保存，当前设备记录仍然保留'},503)}
    }
    // Public exercise media only. Never forward cookies or request headers to the source.
    if(/^\/exercise-media\/(still\/\d{4,5}\.webp|clip\/\d{4,5}\.mp4)$/.test(url.pathname)){
      const upstream=await fetch('https://trevv731-hue.github.io/opengym-pages'+url.pathname,{cf:{cacheTtl:86400,cacheEverything:true}})
      return new Response(upstream.body,{status:upstream.status,headers:{'content-type':url.pathname.endsWith('.mp4')?'video/mp4':'image/webp','cache-control':'private, max-age=86400','x-content-type-options':'nosniff'}})
    }
    const response=await env.ASSETS.fetch(request)
    const headers=new Headers(response.headers)
    headers.set('referrer-policy','same-origin');headers.set('x-content-type-options','nosniff');headers.set('x-frame-options','DENY')
    headers.set('cache-control',url.pathname==='/sw.js'||url.pathname==='/'?'no-cache':'private, max-age=3600')
    return new Response(response.body,{status:response.status,headers})
  }
}
