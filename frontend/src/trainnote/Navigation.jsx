import {useLocation,useNavigate} from 'react-router-dom'
import {useStore} from '../store/useStore.js'
import Icon from '../components/Icon.jsx'
const items=[['home','dumbbell','训练'],['library','magnifier','动作'],['history','calendar','历史'],['me','personCircle','我的']]
export default function Navigation(){
  const nav=useNavigate(),loc=useLocation(),active=useStore(s=>s.S.active)
  const current=loc.pathname.split('/')[1]
  const selected=current==='plan'||current==='workout'?'home':current==='stats'?'history':current==='settings'||current==='measurements'||current==='progress-photos'?'me':current
  const handleKey=e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;const buttons=[...e.currentTarget.querySelectorAll('button[data-nav]')];const at=buttons.indexOf(document.activeElement);const index=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;e.preventDefault();buttons[index].focus()}
  return <nav className="tn-navigation" aria-label="主导航" onKeyDown={handleKey}><a className="tn-brand" href="#/home"><span><Icon name="dumbbell"/></span><b>训练手记<small>TRAINING JOURNAL</small></b></a><div className="tn-nav-items">{items.map(([path,icon,label])=><button key={path} data-nav className={selected===path?'selected':''} aria-current={selected===path?'page':undefined} onClick={()=>nav('/'+path)}><span><Icon name={icon}/></span><b>{label}</b></button>)}</div>{active&&current!=='workout'&&<button className="tn-resume" onClick={()=>nav('/workout')}><Icon name="play"/>继续训练</button>}<div className="tn-nav-footer"><span className="tn-nav-version">私人训练日记</span></div></nav>
}
