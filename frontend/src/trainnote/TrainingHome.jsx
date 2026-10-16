import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import {effectiveRoutines} from '../lib/history.js'
import {todayISO,isoOf} from '../lib/format.js'
import {startFlow,starterPlanSheet,dayOverrideSheet,workoutDetailSheet} from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import {exerciseNameFor} from '../lib/i18n.js'
import {exOr} from '../lib/exercises.js'

export default function TrainingHome(){
  const S=useStore(s=>s.S), nav=useNavigate()
  const [tab,setTab]=useState('templates')
  const today=todayISO(),date=new Date()
  const planned=effectiveRoutines(S,today)
  const completed=new Set(S.workouts.map(w=>w.d))
  const week=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(date.getDate()-((date.getDay()+6)%7)+i);return {d,iso:isoOf(d)}})
  const weekCount=S.workouts.filter(w=>w.d>=week[0].iso&&w.d<=week[6].iso).length
  const duration=S.workouts.reduce((sum,w)=>sum+Math.max(0,(Number(w.end)||0)-(Number(w.start)||0)),0)
  const totalMinutes=Math.round(duration/60000)
  const start=(r)=>S.active?nav('/workout'):r?startFlow([r.id]):nav('/workout')
  return <div className="tn-home">
    <header className="tn-heading"><div><p className="tn-eyebrow">{date.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'})}</p><h1>训练</h1></div><button className="tn-icon" aria-label="管理训练计划" onClick={()=>nav('/plan')}><Icon name="calendar"/></button></header>
    <section className="tn-week" aria-label="本周训练日历"><div className="tn-section-line"><span>本周</span><span className="tn-muted">已训练 <b>{weekCount}</b> 次</span></div><div className="tn-week-days">{week.map(({d,iso})=><button key={iso} className={(iso===today?'is-today ':'')+(completed.has(iso)?'is-done':'')} onClick={()=>dayOverrideSheet(iso)} aria-label={iso+(completed.has(iso)?'，已训练':'，查看安排')}><span>{['日','一','二','三','四','五','六'][d.getDay()]}</span><strong>{d.getDate()}</strong><i aria-hidden="true"/></button>)}</div></section>
    <div className="tn-workspace">
      <div className="tn-main-column">
        <section className="tn-today"><div className="tn-section-line"><h2>{S.active?'正在进行':'今日训练'}</h2><span className="tn-badge">{S.active?'未结束':planned.length?'有计划':'自由安排'}</span></div><div className="tn-today-content"><span className="tn-session-icon"><Icon name={S.active?'play':'dumbbell'}/></span><div><h3>{S.active?.name||planned.map(r=>r.name).join(' + ')||'准备好，开始今天的训练'}</h3><p>{S.active?'上次的进度已保留，继续完成这一练。':planned.length?`${planned.reduce((n,r)=>n+(r.ex||[]).length,0)} 个动作 · 按自己的节奏完成`:'选择一个模板，或从自由训练开始。'}</p></div></div><button className="tn-primary" onClick={()=>S.active?nav('/workout'):planned.length?startFlow(planned.map(r=>r.id)):nav('/workout')}><Icon name="play"/>{S.active?'继续训练':planned.length?'开始今日训练':'开始自由训练'}<Icon name="arrowRight"/></button></section>
        <section className="tn-templates"><div className="tn-section-line"><div className="tn-tabs"><button className={tab==='templates'?'selected':''} onClick={()=>setTab('templates')}>我的模板 <span>{S.routines.length}</span></button><button className={tab==='recent'?'selected':''} onClick={()=>setTab('recent')}>最近训练</button></div><button className="tn-text" onClick={()=>nav('/plan')}>管理 <Icon name="chevronRight"/></button></div>
          {tab==='templates'?S.routines.length?<div className="tn-template-list">{S.routines.map((r,i)=><article className="tn-template" key={r.id}><button className="tn-template-body" onClick={()=>nav('/plan/r/'+r.id)}><span className={'tn-template-icon tone-'+i%3}>{String(i+1).padStart(2,'0')}</span><span className="tn-template-info"><strong>{r.name}</strong><span>{(r.ex||[]).length} 个动作{r.ex?.length?' · '+r.ex.slice(0,2).map(e=>exerciseNameFor(exOr(e.id))).join(' / '):' · 添加动作，安排你的训练'}</span></span></button><button className="tn-icon tn-template-play" aria-label={'开始'+r.name} onClick={()=>start(r)}><Icon name="play"/></button></article>)}</div>:<div className="tn-empty-template"><span className="tn-empty-symbol"><Icon name="clipboard"/></span><h3>把常练的动作存成模板</h3><p>下次来，直接开始。每一组都会为你记住。</p><button className="tn-outline" onClick={()=>nav('/plan')}>创建第一个模板 <Icon name="plus"/></button><button className="tn-text" onClick={starterPlanSheet}>从基础计划开始 <Icon name="chevronRight"/></button></div>:S.workouts.length?<div className="tn-template-list">{S.workouts.slice(-5).reverse().map(w=><button className="tn-recent-row" key={w.id} onClick={()=>workoutDetailSheet(w)}><span className="tn-template-icon"><Icon name="check"/></span><span className="tn-template-info"><strong>{w.name||'自由训练'}</strong><span>{w.d} · {w.entries?.length||0} 个动作</span></span><Icon name="chevronRight"/></button>)}</div>:<div className="tn-empty-template"><Icon name="history"/><h3>第一条记录，从今天开始</h3><p>完成训练后，你的每一次努力都会留在这里。</p></div>}
        </section>
        <button className="tn-add-template" onClick={()=>nav('/plan')}><Icon name="plus"/> 新建训练模板</button>
      </div>
      <aside className="tn-side-column"><section className="tn-overview"><div className="tn-section-line"><h2>训练足迹</h2><button className="tn-text" onClick={()=>nav('/stats')}>统计 <Icon name="chevronRight"/></button></div><div className="tn-stats"><div><strong>{S.workouts.length}<small>次</small></strong><span>累计训练</span></div><div><strong>{completed.size}<small>天</small></strong><span>训练天数</span></div><div><strong>{totalMinutes}<small>分钟</small></strong><span>累计时长</span></div></div><div className="tn-mini-activity" aria-label="最近28天训练情况">{Array.from({length:28},(_,i)=>{const d=new Date();d.setDate(d.getDate()-27+i);const iso=isoOf(d);return <span key={iso} className={completed.has(iso)?'done':''} title={iso+(completed.has(iso)?' 已训练':' 无训练')} aria-label={iso+(completed.has(iso)?' 已训练':' 无训练')}/>})}</div><p className="tn-muted tn-caption">最近四周 · 每一格，都是你的节奏</p></section><section className="tn-body-card"><div><span className="tn-eyebrow">身体记录</span><h2>看见自己的变化</h2><p>体重、围度与训练，一起记录。</p></div><button className="tn-outline" onClick={()=>nav('/measurements')}>记录身体数据 <Icon name="arrowRight"/></button></section><div className="tn-quiet-note"><Icon name="dumbbell"/><span>不必每次都突破，<br/>保持训练，也是一种进步。</span></div></aside>
    </div>
  </div>
}


