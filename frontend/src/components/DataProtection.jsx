import { useState, useSyncExternalStore, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button, TextField } from './ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import { cloudStatus, subscribeCloud, signInCloud, signUpCloud, resetCloudPassword, verifyRecoveryCloud, updateCloudPassword, signOutCloud, syncCloudNow, attachLocalRecords, cloudError } from '../lib/cloud-sync.js'
import { safetyStatus, subscribeSafety, backupDue, recoveryCopies, requestPersistentStorage, saveRecoveryCopy } from '../lib/data-safety.js'
import './data-protection.css'

export const useCloudStatus = () => useSyncExternalStore(subscribeCloud, cloudStatus)
export const useSafetyStatus = () => useSyncExternalStore(subscribeSafety, safetyStatus)
const date = at => at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '还没有'
export const cloudLabel = cloud => ({
  loading: '正在检查云端连接', unconfigured: '云端同步尚未连接', 'signed-out': '登录后自动同步',
  'needs-consent': '确认后合并本机记录', 'account-mismatch': '当前记录属于另一个账号',
  pending: '本机已保存，等待同步', syncing: '正在同步云端', synced: '已同步到云端',
  offline: '离线记录中，等待联网', error: '云端同步需要重试', recovery: '请设置新密码',
}[cloud.phase] || '记录保存在本机')

export function DataProtectionHome() {
  const S = useStore(s => s.S)
  const cloud = useCloudStatus()
  const safety = useSafetyStatus()
  const nav = useNavigate()
  const due = backupDue(S, Date.now(), safety)
  const attention = cloud.phase === 'error' || cloud.phase === 'account-mismatch' || cloud.phase === 'needs-consent'
  if (!due && !safety.restored && !attention) return null
  return <div className="card data-protection-card">
    <div className="data-protection-title">{safety.restored ? '已从本机副本恢复记录' : attention ? '账号同步需要处理' : '给训练记录留一份备份'}</div>
    <p>{attention ? cloud.message || cloudLabel(cloud) : '清除网站数据会删除本机记录。请把备份保存到「文件」或 iCloud Drive；登录后也可自动同步。'}</p>
    <div className="data-protection-actions">
      <Button variant="tinted" onClick={() => nav('/settings/data')}>备份与恢复</Button>
      <Button variant="ghost" onClick={() => nav('/settings/account')}>账号与同步</Button>
    </div>
  </div>
}

export function LocalProtectionSection() {
  const S = useStore(s => s.S)
  const safety = useSafetyStatus()
  const cloud = useCloudStatus()
  const toast = useUI(s => s.toast)
  const [copies, setCopies] = useState(null)
  const [working, setWorking] = useState(false)
  const restore = copy => confirmSheet({
    title: '恢复这份本机副本？',
    message: `恢复 ${date(copy.at)} 的记录。当前记录会先保存为恢复副本。${cloud.user ? '账号同步已开启，恢复后的记录也会同步到该账号。' : ''}`,
    confirmText: '恢复记录', onConfirm: async () => {
      await saveRecoveryCopy(useStore.getState().S)
      useStore.getState().importBackup(copy.state)
      toast('本机副本已恢复'); setCopies(null)
    },
  })
  return <>
    <Section title="数据保护" footer="本机恢复副本也属于网站数据，清理网站数据会一起删除。导出到文件或云端同步，才能防范这种情况。">
      <Row icon="lock" iconTint="var(--acc)" title={safety.available ? '自动本机恢复副本已开启' : '本机恢复副本暂不可用'} subtitle={safety.error || `最近保存：${date(safety.savedAt)} · 最多保留 14 份记录副本；照片视频仍在本机媒体库。`} />
      <Row icon="share" iconTint="var(--blue)" title="上次导出备份" subtitle={`${date(safety.exportedAt)}。请确认已保存到网站之外。`} />
      <Row icon="cloud" iconTint="var(--indigo)" title={cloudLabel(cloud)} subtitle={cloud.user ? `最近同步：${date(cloud.lastSynced)}` : '本机副本不会自动上传。'} />
      <Row icon="history" iconTint="var(--orange)" title="查看本机恢复副本" accessory="chevron" onClick={async () => setCopies(await recoveryCopies())} />
      <Row icon="shield" iconTint="var(--green)" title={safety.persistent ? '浏览器已允许持久存储' : '请求浏览器保留网站数据'} subtitle="可降低自动清理概率，但不能阻止手动清理或保证记录永不丢失。" accessory={safety.persistent ? 'check' : 'chevron'} onClick={async () => {
        if (working) return
        setWorking(true)
        try { toast(await requestPersistentStorage() ? '浏览器已允许持久存储' : '浏览器未批准，请继续使用文件备份。') }
        catch { toast('请求未成功，请继续使用文件备份。') }
        finally { setWorking(false) }
      }} />
    </Section>
    {copies && <Section title="本机恢复副本">
      {!copies.length && <Row icon="info" title="还没有恢复副本" subtitle="开始记录后会自动保存。" />}
      {copies.map(copy => <Row key={copy.id} icon="history" title={date(copy.at)} subtitle={`${copy.state.workouts.length} 次训练 · ${copy.state.routines.length} 个训练日`} accessory="chevron" onClick={() => restore(copy)} />)}
      <Row icon="xmark" title="收起" onClick={() => setCopies(null)} />
    </Section>}
  </>
}

export function CloudAccountSection() {
  const cloud = useCloudStatus()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState(null)
  const [proof, setProof] = useState('')
  const busy = useRef(false)
  const noticeRef = useRef(null)
  useEffect(() => { if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [notice])
  const nav = useNavigate()
  const run = async operation => {
    if (busy.current) return
    busy.current = true
    document.activeElement?.blur()
    setWorking(true); setNotice({ kind: 'pending', text: '正在处理，请稍候…' })
    try { const message = await operation(); setNotice({ kind: 'success', text: message || '操作已完成。' }) }
    catch (error) { setNotice({ kind: 'error', text: cloudError(error) }) }
    finally { busy.current = false; setWorking(false) }
  }
  const loggedIn = !!cloud.user
  const unavailable = ['loading', 'unconfigured'].includes(cloud.phase)
  return <>
    {notice && <div ref={noticeRef} className={'card data-auth-feedback ' + notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{notice.text}</div>}
    <Section title="账号与云端同步" footer="登录后，已完成的训练、计划、体重和个人照片视频会保存到你的账号。进行中的训练只保留在当前设备。离线修改会在联网后重试。">
      <Row icon="cloud" iconTint="var(--indigo)" title={cloudLabel(cloud)} subtitle={cloud.message || (loggedIn ? `${cloud.user.email} · 最近同步 ${date(cloud.lastSynced)}` : unavailable ? '云端服务尚未接通。现在仍可离线记录、导出备份和恢复本机副本。' : '使用同一账号，可在不同设备和托管地址恢复、同步记录。')} />
      {cloud.phase === 'needs-consent' && <Row icon="merge" title="合并本机记录到这个账号" subtitle="会保留两边的训练记录。请确认这些记录属于你。" accessory="chevron" onClick={() => confirmSheet({ title: '合并本机记录？', message: '这台设备的记录会加入当前登录的账号，云端已有的记录会一起保留。', confirmText: '合并并同步', onConfirm: () => run(attachLocalRecords) })} />}
      {cloud.phase === 'account-mismatch' && <Row icon="lock" title="暂不自动合并不同账号" subtitle="请先导出当前记录，再退出并使用原账号登录。" />}
      {loggedIn && !cloud.recovery && !['needs-consent', 'account-mismatch'].includes(cloud.phase) && <Row icon="refresh" title="立即同步" accessory="chevron" onClick={() => run(syncCloudNow)} />}
      {loggedIn && <Row icon="signOut" title="退出账号" subtitle="本机记录继续保留，退出后停止自动上传。" onClick={() => confirmSheet({ title: '退出账号？', message: cloud.pending ? '仍有记录没有同步成功。退出后保留在本机，请先同步或导出备份。' : '退出后本机记录继续保留。', confirmText: '退出账号', onConfirm: () => run(signOutCloud) })} />}
    </Section>
    {!unavailable && (!loggedIn || cloud.recovery) && <div className="card data-protection-card">
      <h3>{cloud.recovery ? '设置新密码' : mode === 'reset' ? '通过邮箱找回密码' : mode === 'register' ? '创建健身账号' : '登录健身账号'}</h3>
      {mode === 'register' && !cloud.recovery && <p>注册后直接登录，无需验证邮箱。请填写真实邮箱，忘记密码时通过邮件验证找回。</p>}
      <form noValidate onSubmit={e => { e.preventDefault(); run(async () => {
        if (!cloud.recovery && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw Error('请填写有效的邮箱地址。')
        if (mode === 'reset' && !cloud.recovery) { await resetCloudPassword(email); return '如果该邮箱已注册，会收到找回密码邮件。查看收件箱和垃圾邮件，复制邮件中的验证链接到下面。' }
        if (!password) throw Error('请填写密码。')
        if ((mode === 'register' || cloud.recovery) && password.length < 8) throw Error('密码至少需要 8 个字符。')
        if (cloud.recovery) { await updateCloudPassword(password); setPassword(''); return '密码已更新。' }
        if (mode === 'register') {
          await signUpCloud(email, password)
          setPassword('')
          return '注册成功，已自动登录。请查看同步状态；本机已有记录时，请先确认合并。'
        }
        await signInCloud(email, password); setPassword(''); return '登录成功。请查看上方的同步状态；已有本机记录时，确认合并后开始同步。'
      }) }}>
        {!cloud.recovery && <label className="data-protection-field">邮箱<TextField type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="你的邮箱" /></label>}
        {(mode !== 'reset' || cloud.recovery) && <label className="data-protection-field">密码<TextField type="password" autoComplete={mode === 'register' || cloud.recovery ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'register' || cloud.recovery ? '至少 8 个字符' : '你的登录密码'} /></label>}
        <Button variant="primary" type="submit" disabled={working}>{working ? '请稍候…' : cloud.recovery ? '保存新密码' : mode === 'reset' ? '发送找回密码邮件' : mode === 'register' ? '注册账号' : '登录'}</Button>
        {!cloud.recovery && <div className="data-protection-actions">
          <Button type="button" variant="ghost" disabled={working} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setNotice(null); setPassword('') }}>{mode === 'login' ? '创建账号' : '返回登录'}</Button>
          {mode !== 'reset' && <Button type="button" variant="ghost" disabled={working} onClick={() => { setMode('reset'); setNotice(null); setPassword('') }}>忘记密码</Button>}
        </div>}
      </form>
      {mode === 'reset' && !cloud.recovery && <form noValidate onSubmit={e => { e.preventDefault(); run(async () => { await verifyRecoveryCloud(proof, email); setProof(''); return '邮箱验证成功，请设置新密码。' }) }}>
        <label className="data-protection-field">邮件里的验证链接或验证码<TextField value={proof} onChange={e => setProof(e.target.value)} autoComplete="off" placeholder="复制邮件中的找回密码链接，粘贴到这里" /></label>
        <Button type="submit" variant="tinted" disabled={working}>验证邮箱并设置新密码</Button>
      </form>}
    </div>}
    <Section title="继续使用本机记录">
      <Row icon="share" title="备份与恢复" subtitle="导出到「文件」或 iCloud Drive，换设备后导入。" accessory="chevron" onClick={() => nav('/settings/data')} />
      <Row icon="phoneScreen" title="添加到 iPhone 主屏幕" subtitle="Safari 分享 → 添加到主屏幕。建议固定使用同一入口。" />
    </Section>
  </>
}
