import { useState, useSyncExternalStore, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { Section, Row, Button, TextField } from './ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import {
  cloudStatus,
  subscribeCloud,
  syncCloudNow,
  setDeviceName,
  cloudError,
  pairCloudDevice,
  hasCloudPairing,
} from '../lib/cloud-sync.js'
import {
  safetyStatus,
  subscribeSafety,
  backupDue,
  recoveryCopies,
  requestPersistentStorage,
  saveRecoveryCopy,
} from '../lib/data-safety.js'
import './data-protection.css'

export const useCloudStatus = () => useSyncExternalStore(subscribeCloud, cloudStatus)
export const useSafetyStatus = () => useSyncExternalStore(subscribeSafety, safetyStatus)

const date = at =>
  at
    ? new Date(at).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '尚未同步'

export const cloudLabel = cloud =>
  ({
    loading: '正在连接小云端',
    pending: '本机已保存，等待同步',
    syncing: '正在同步到小云端…',
    synced: '已同步到小云端',
    offline: '离线记录中，联网后自动同步',
    error: '云端同步需要重试',
  }[cloud.phase] || '小云端已就绪')

export function DataProtectionHome() {
  const S = useStore(s => s.S)
  const cloud = useCloudStatus()
  const safety = useSafetyStatus()
  const nav = useNavigate()
  const due = backupDue(S, Date.now(), safety)
  const attention = cloud.phase === 'error'

  if (!due && !safety.restored && !attention) return null

  return (
    <div className="card data-protection-card">
      <div className="data-protection-title">
        {safety.restored
          ? '已从本机副本恢复记录'
          : attention
          ? '小云端同步需要处理'
          : '给训练记录留一份备份'}
      </div>
      <p>
        {attention
          ? cloud.message || cloudLabel(cloud)
          : '训练数据已开启小云端自动同步。清除网站数据前，建议在设置中导出文件备份。'}
      </p>
      <div className="data-protection-actions">
        <Button variant="tinted" onClick={() => nav('/settings/data')}>
          备份与恢复
        </Button>
        <Button variant="ghost" onClick={() => nav('/settings/account')}>
          设备与云端
        </Button>
      </div>
    </div>
  )
}

export function LocalProtectionSection() {
  const S = useStore(s => s.S)
  const safety = useSafetyStatus()
  const cloud = useCloudStatus()
  const toast = useUI(s => s.toast)
  const [copies, setCopies] = useState(null)
  const [working, setWorking] = useState(false)

  const restore = copy =>
    confirmSheet({
      title: '恢复这份本机副本？',
      message: `恢复 ${date(copy.at)} 的记录。当前记录会先保存为恢复副本。恢复后将自动同步到小云端。`,
      confirmText: '恢复记录',
      onConfirm: async () => {
        await saveRecoveryCopy(useStore.getState().S)
        useStore.getState().importBackup(copy.state)
        toast('本机副本已恢复')
        setCopies(null)
        syncCloudNow().catch(() => {})
      },
    })

  return (
    <>
      <Section
        title="数据保护"
        footer="本机恢复副本保存在浏览器本地，清除网站数据会一并删除。小云端自动同步或手动导出备份可以确保记录长久安全。"
      >
        <Row
          icon="lock"
          iconTint="var(--acc)"
          title={safety.available ? '自动本机恢复副本已开启' : '本机恢复副本暂不可用'}
          subtitle={
            safety.error ||
            `最近保存：${date(safety.savedAt)} · 最多保留 14 份记录副本；照片视频仍在本机媒体库。`
          }
        />
        <Row
          icon="share"
          iconTint="var(--blue)"
          title="上次导出备份"
          subtitle={`${date(safety.exportedAt)}。请确认已保存到网站之外。`}
        />
        <Row
          icon="cloud"
          iconTint="var(--indigo)"
          title={cloudLabel(cloud)}
          subtitle={
            cloud.lastSynced
              ? `最近同步：${date(cloud.lastSynced)}`
              : '联网时自动将训练与体重同步至小云端。'
          }
        />
        <Row
          icon="history"
          iconTint="var(--orange)"
          title="查看本机恢复副本"
          accessory="chevron"
          onClick={async () => setCopies(await recoveryCopies())}
        />
        <Row
          icon="shield"
          iconTint="var(--green)"
          title={safety.persistent ? '浏览器已允许持久存储' : '请求浏览器保留网站数据'}
          subtitle="可降低自动清理概率，但不能阻止手动清理或保证记录永不丢失。"
          accessory={safety.persistent ? 'check' : 'chevron'}
          onClick={async () => {
            if (working) return
            setWorking(true)
            try {
              toast(
                (await requestPersistentStorage())
                  ? '浏览器已允许持久存储'
                  : '浏览器未批准，请继续使用文件备份。'
              )
            } catch {
              toast('请求未成功，请继续使用文件备份。')
            } finally {
              setWorking(false)
            }
          }}
        />
      </Section>
      {copies && (
        <Section title="本机恢复副本">
          {!copies.length && <Row icon="info" title="还没有恢复副本" subtitle="开始记录后会自动保存。" />}
          {copies.map(copy => (
            <Row
              key={copy.id}
              icon="history"
              title={date(copy.at)}
              subtitle={`${copy.state.workouts.length} 次训练 · ${copy.state.routines.length} 个训练日`}
              accessory="chevron"
              onClick={() => restore(copy)}
            />
          ))}
          <Row icon="xmark" title="收起" onClick={() => setCopies(null)} />
        </Section>
      )}
    </>
  )
}

export function CloudAccountSection() {
  const cloud = useCloudStatus()
  const toast = useUI(s => s.toast)
  const nav = useNavigate()
  const [working, setWorking] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(cloud.deviceName || '')
  const [pairingInput, setPairingInput] = useState('')
  const [pairing, setPairing] = useState(!hasCloudPairing())
  const [notice, setNotice] = useState(null)
  const noticeRef = useRef(null)

  useEffect(() => {
    if (!editingName && cloud.deviceName) {
      setNameInput(cloud.deviceName)
    }
  }, [cloud.deviceName, editingName])

  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [notice])

  const runSync = async () => {
    if (working) return
    setWorking(true)
    setNotice({ kind: 'pending', text: '正在同步到小云端…' })
    try {
      await syncCloudNow()
      setNotice({ kind: 'success', text: '同步完成！训练与体重数据已上传至小云端。' })
      toast('同步完成')
    } catch (err) {
      setNotice({ kind: 'error', text: cloudError(err) })
      toast('同步遇到问题，请重试')
    } finally {
      setWorking(false)
    }
  }

  const saveName = async () => {
    const val = nameInput.trim()
    if (!val) {
      toast('请输入设备备注')
      return
    }
    setWorking(true)
    try {
      await setDeviceName(val)
      setEditingName(false)
      setNotice({ kind: 'success', text: `设备备注已更新为「${val}」，已同步至云端。` })
      toast('设备备注已保存')
    } catch (err) {
      setNotice({ kind: 'error', text: '保存失败: ' + err.message })
    } finally {
      setWorking(false)
    }
  }

  const copyDeviceId = () => {
    if (!cloud.deviceId) return
    try {
      navigator.clipboard?.writeText(cloud.deviceId)
      toast('已复制设备编号')
    } catch {
      toast(cloud.deviceId)
    }
  }

  const savePairing = async () => {
    setWorking(true)
    try {
      await pairCloudDevice(pairingInput)
      setPairingInput('')
      setPairing(false)
      setNotice({ kind: 'success', text: '云端配对成功，正在准备自动同步。' })
    } catch (error) {
      setNotice({ kind: 'error', text: cloudError(error) })
    } finally { setWorking(false) }
  }

  return (
    <>
      {notice && (
        <div
          ref={noticeRef}
          className={'card data-auth-feedback ' + notice.kind}
          role={notice.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {notice.text}
        </div>
      )}

      <Section
        title="小云端设备同步"
        footer="自己的设备配对一次后，训练、计划和体重会自动同步至私人云端。离线修改保留在本机，联网后继续上传。"
      >
        <Row
          icon="cloud"
          iconTint="var(--indigo)"
          title={cloudLabel(cloud)}
          subtitle={
            cloud.lastSynced
              ? `最近同步：${date(cloud.lastSynced)} · 版本 v${cloud.revision || 1}`
              : '准备中，正在连接…'
          }
        />
        <Row
          icon="reset"
          iconTint="var(--blue)"
          title="立即同步到小云端"
          subtitle="将当前所有训练、计划和体重数据推送到云端"
          accessory={working ? null : 'chevron'}
          onClick={runSync}
        />
      </Section>

      <Section title="云端配对" footer="在已授权电脑的私人云端中打开「ActiveT 设备配对」，复制同步密钥到此处。不要填写私人云端恢复密钥。">
        <Row icon="lock" title={hasCloudPairing() ? '已保存同步密钥' : '此设备尚未配对'} subtitle="点击填写或更换同步密钥" onClick={() => setPairing(v => !v)} />
        {pairing && <div style={{ padding: '8px 16px 14px' }}>
          <label className="data-protection-field">ActiveT 同步密钥
            <TextField type="password" value={pairingInput} onChange={e => setPairingInput(e.target.value)} autoComplete="off" maxLength={100} />
          </label>
          <Button variant="primary" disabled={working || !pairingInput.trim()} onClick={savePairing}>验证并配对</Button>
        </div>}
      </Section>

      <Section title="设备身份与备注" footer="在云端管理后台将按此名称区分你的各台手机/平板。">
        <Row
          icon="phoneScreen"
          iconTint="var(--acc)"
          title={cloud.deviceName || '当前设备'}
          subtitle="点击修改设备显示名称（例如「主力 iPhone」）"
          accessory="chevron"
          onClick={() => setEditingName(v => !v)}
        />
        {editingName && (
          <div style={{ padding: '8px 16px 14px' }}>
            <label className="data-protection-field" style={{ marginBottom: 10 }}>
              设备备注名称
              <TextField
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder="例如：Trevor iPhone 15"
                maxLength={40}
              />
            </label>
            <div className="data-protection-actions">
              <Button variant="primary" disabled={working} onClick={saveName}>
                保存备注
              </Button>
              <Button variant="ghost" disabled={working} onClick={() => setEditingName(false)}>
                取消
              </Button>
            </div>
          </div>
        )}

        <Row
          icon="lock"
          iconTint="var(--teal)"
          title="设备识别码 (Device ID)"
          subtitle={`${cloud.deviceId || '生成中…'} (点击复制)`}
          accessory="chevron"
          onClick={copyDeviceId}
        />
      </Section>

      <Section title="云端后台数据管理" footer="你可以在小云端控制台查看全部设备的训练汇总、最近体重，以及导出或维护云端快照。">
        <Row
          icon="globe"
          iconTint="var(--green)"
          title="打开小云端数据后台"
          subtitle="cloud.bdprk.com/cloud/activet"
          accessory="chevron"
          onClick={() => window.open('https://cloud.bdprk.com/cloud/activet', '_blank', 'noopener')}
        />
      </Section>

      <Section title="本地备份与主屏幕使用">
        <Row
          icon="share"
          iconTint="var(--blue)"
          title="备份与恢复"
          subtitle="导出到「文件」或 iCloud Drive，换设备后导入。"
          accessory="chevron"
          onClick={() => nav('/settings/data')}
        />
        <Row
          icon="phoneScreen"
          iconTint="var(--indigo)"
          title="添加到手机主屏幕"
          subtitle="Safari 分享 → 添加到主屏幕。离线记录不受影响。"
        />
      </Section>
    </>
  )
}
