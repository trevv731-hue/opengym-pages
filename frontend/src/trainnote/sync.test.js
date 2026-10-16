// @vitest-environment happy-dom
import {it,expect,vi,beforeEach,afterEach} from 'vitest'
import {startJournalSync} from './sync.js'
const initial=()=>({unit:'kg',workouts:[],routines:[],bodyweight:[],customEx:[],active:null,_ts:1})
const response=data=>({ok:true,status:200,json:async()=>data})
let stop
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();vi.stubGlobal('fetch',vi.fn());Object.defineProperty(navigator,'onLine',{configurable:true,value:true})})
afterEach(()=>{stop?.();vi.useRealTimers();vi.unstubAllGlobals()})
function store(){let current={S:initial(),ready:true};const listeners=new Set();return {getState:()=>current,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},setState:patch=>{const previous=current;current={...current,...patch};listeners.forEach(f=>f(current,previous))}}}
it('自动保存独立端点，排除活动草稿，后台成功不弹提示',async()=>{
  const st=store();st.getState().S.active={name:'local draft'}
  fetch.mockImplementation(async(url,opts)=>opts.method==='GET'?response({revision:0,state:null}):response({revision:1,state:JSON.parse(opts.body).state}))
  stop=startJournalSync(st);await vi.advanceTimersByTimeAsync(200)
  expect(fetch.mock.calls.every(([url])=>url==='/api/profile')).toBe(true)
  const put=fetch.mock.calls.find(([,opts])=>opts.method==='PUT')[1]
  expect(JSON.parse(put.body).state).not.toHaveProperty('active')
  expect(st.getState().S.active.name).toBe('local draft')
  expect(localStorage.getItem('journal_saved_at')).toBeTruthy()
})
it('网络失败保留本机记录，不显示已保存；恢复联网后继续提交',async()=>{
  const st=store();st.getState().S.routines=[{id:'local',name:'我的模板',ex:[],_ts:2}]
  fetch.mockRejectedValue(Error('offline'));stop=startJournalSync(st);await vi.advanceTimersByTimeAsync(200)
  expect(st.getState().S.routines[0].id).toBe('local');expect(localStorage.getItem('journal_saved_at')).toBeNull()
  fetch.mockImplementation(async(url,opts)=>opts.method==='GET'?response({revision:0,state:null}):response({revision:1,state:JSON.parse(opts.body).state}))
  window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(200)
  expect(localStorage.getItem('journal_saved_at')).toBeTruthy()
})
