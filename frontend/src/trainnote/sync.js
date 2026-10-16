import {cloudDocument,mergeCloudProfile,sameDocument,writeCloudProfile} from '../lib/cloud-profile.js'
// One isolated preview profile. The endpoint authenticates the owner's device/session.
// No old-site token, database or record is read. Normal success stays out of the UI.
export function startJournalSync(store){
  let busy=false,again=false,applying=false,started=false,timer=null,stopped=false
  const apply=remote=>{
    const current=store.getState().S,merged=mergeCloudProfile(current,remote)
    if(sameDocument(current,merged))return
    applying=true
    try{store.setState({S:merged});localStorage.setItem('gym_state_v1',JSON.stringify(merged))}finally{applying=false}
  }
  const request=async(method,data)=>{
    const response=await fetch('/api/profile',{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})})
    if(response.status===401){if(document.visibilityState==='visible')location.assign('/auth/login');throw Error('需要重新验证设备')}
    if(response.status!==409&&!response.ok)throw Error('记录暂未送达，本机副本已保留')
    const json=await response.json()
    return {...json,conflict:response.status===409}
  }
  const schedule=(delay=1600)=>{clearTimeout(timer);timer=setTimeout(run,delay)}
  const run=async()=>{
    if(stopped||!store.getState().ready||navigator.onLine===false)return
    if(busy){again=true;return}
    busy=true;again=false
    try{
      const remote=await request('GET')
      if(remote.state)apply(remote.state)
      const local=store.getState().S
      if(!remote.state||!sameDocument(local,remote.state)){
        const result=await writeCloudProfile({state:local,revision:remote.revision,write:(baseRevision,state)=>request('PUT',{baseRevision,state}),readLocal:()=>store.getState().S,active:()=>!stopped})
        apply(result.state)
      }
      localStorage.setItem('journal_saved_at',String(Date.now()))
      document.documentElement.removeAttribute('data-save-pending')
    }catch{
      // Local persistence and recovery copies remain authoritative until acknowledged.
      document.documentElement.dataset.savePending='true'
      if(!stopped)schedule(15000)
    }finally{busy=false;if(again&&!stopped)schedule()}
  }
  const unsub=store.subscribe((next,previous)=>{
    if(!started&&next.ready){started=true;schedule(100)}
    if(!applying&&next.ready&&next.S!==previous.S&&!sameDocument(next.S,previous.S))schedule()
  })
  const focus=()=>schedule(150)
  window.addEventListener('online',focus);window.addEventListener('focus',focus)
  const poll=setInterval(()=>{if(document.visibilityState==='visible')schedule(0)},60000)
  if(store.getState().ready){started=true;schedule(100)}
  return()=>{stopped=true;clearTimeout(timer);clearInterval(poll);unsub();window.removeEventListener('online',focus);window.removeEventListener('focus',focus)}
}
