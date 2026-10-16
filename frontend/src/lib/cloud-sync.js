import { cloudDocument, sameDocument } from './cloud-profile.js'

const DEVICE_ID_KEY = 'activet_device_id'
const DEVICE_NAME_KEY = 'activet_device_name'
const SYNC_MARK_KEY = 'activet_last_sync'
const DEFAULT_ENDPOINT = 'https://cloud.bdprk.com/api/cloud/activet'
const SYNC_TOKEN_KEY = 'activet_cloud_sync_token'
export function hasCloudPairing() {
  try { return !!localStorage.getItem(SYNC_TOKEN_KEY) } catch { return false }
}
function syncHeaders() {
  const token = localStorage.getItem(SYNC_TOKEN_KEY)
  if (!token) throw new Error('请先在设置的「云端配对」中填写同步密钥。本机记录仍然保留。')
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
}
export async function pairCloudDevice(value) {
  const token = String(value || '').trim()
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('请输入完整的 ActiveT 同步密钥。')
  const response = await fetch(`${DEFAULT_ENDPOINT}/sync?device=${encodeURIComponent(getDeviceId())}`, {
    headers: { Authorization: 'Bearer ' + token },
  })
  if (!response.ok) throw new Error(response.status === 401 ? '同步密钥不正确，请从私人云端重新复制。' : '暂时无法验证同步密钥，请稍后重试。')
  localStorage.setItem(SYNC_TOKEN_KEY, token)
  emit({ pending: true, phase: 'pending', message: '' })
  if (store) schedule(0)
}

function detectDeviceDefaultName() {
  if (typeof navigator === 'undefined') return '手机设备'
  const ua = navigator.userAgent || ''
  if (/iPad/i.test(ua)) return 'iPad 平板'
  if (/iPhone/i.test(ua)) return 'iPhone 手机'
  if (/Android/i.test(ua)) return 'Android 手机'
  if (/Macintosh/i.test(ua)) return 'Mac 电脑'
  if (/Windows/i.test(ua)) return 'Windows 电脑'
  return '我的设备'
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY)
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
      localStorage.setItem(DEVICE_ID_KEY, id)
    }
    return id
  } catch {
    return 'dev_temp_' + Date.now().toString(36)
  }
}

export function getDeviceName() {
  try {
    let name = localStorage.getItem(DEVICE_NAME_KEY)
    if (!name) {
      name = detectDeviceDefaultName()
      localStorage.setItem(DEVICE_NAME_KEY, name)
    }
    return name
  } catch {
    return '我的设备'
  }
}

const listeners = new Set()
let view = {
  phase: 'loading',
  deviceId: '',
  deviceName: '',
  lastSynced: 0,
  revision: 0,
  message: '',
  pending: false,
  user: null,
}

let store = null
let starting = null
let timer = null
let busy = null
let queued = false
let applying = false

const emit = patch => {
  view = { ...view, ...patch }
  listeners.forEach(fn => fn())
}

export const cloudStatus = () => view
export const subscribeCloud = fn => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function cloudError(error) {
  const text = error?.message || String(error || '')
  if (/fetch|network|offline|timeout|Failed to fetch/i.test(text)) {
    return '暂时无法连接小云端，本地记录仍在，联网后将自动同步。'
  }
  return text.slice(0, 180) || '云端同步异常，请稍后重试。'
}

function schedule(delay = 1500) {
  clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    syncCloudNow().catch(() => {})
  }, delay)
}

export async function setDeviceName(name) {
  const clean = String(name || '').trim().slice(0, 50) || getDeviceName()
  try {
    localStorage.setItem(DEVICE_NAME_KEY, clean)
  } catch {}
  emit({ deviceName: clean })
  try {
    await fetch(`${DEFAULT_ENDPOINT}/rename`, {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ deviceId: view.deviceId, name: clean, newName: clean }),
    }).then(async response => {
      if (!response.ok) throw new Error('设备备注尚未同步，请检查云端配对后重试。')
    })
  } catch (error) { throw error }
}

export async function startCloudSync(appStore) {
  if (starting) return starting
  store = appStore
  starting = (async () => {
    const deviceId = getDeviceId()
    const deviceName = getDeviceName()

    let lastSynced = 0
    let revision = 0
    try {
      const mark = JSON.parse(localStorage.getItem(SYNC_MARK_KEY) || '{}')
      if (mark.deviceId === deviceId) {
        lastSynced = Number(mark.at) || 0
        revision = Number(mark.revision) || 0
      }
    } catch {}

    const user = { id: deviceId, name: deviceName, email: `${deviceName}@cloud.bdprk.com` }
    emit({
      phase: lastSynced ? 'synced' : 'pending',
      deviceId,
      deviceName,
      lastSynced,
      revision,
      user,
      pending: !lastSynced,
    })

    // Subscribe to local store changes
    store.subscribe((next, prev) => {
      if (applying || next.S === prev.S || sameDocument(next.S, prev.S)) return
      emit({ pending: true, phase: navigator.onLine === false ? 'offline' : 'pending' })
      queued = true
      schedule()
    })

    window.addEventListener('online', () => schedule(0))
    window.addEventListener('offline', () => emit({ phase: 'offline', pending: true }))
    window.addEventListener('focus', () => schedule(0))
    setInterval(() => {
      if (document.visibilityState === 'visible') schedule(0)
    }, 60000)

    // Trigger initial sync to upload or verify
    schedule(800)
  })()
  return starting
}

export async function syncCloudNow() {
  if (busy) {
    queued = true
    return busy
  }
  if (navigator.onLine === false) {
    emit({ phase: 'offline', pending: true })
    return
  }

  const deviceId = view.deviceId || getDeviceId()
  const deviceName = view.deviceName || getDeviceName()

  emit({ phase: 'syncing', message: '' })
  queued = false

  busy = (async () => {
    try {
      const localState = cloudDocument(store.getState().S)
      const res = await fetch(`${DEFAULT_ENDPOINT}/sync`, {
        method: 'POST',
        headers: syncHeaders(),
        body: JSON.stringify({
          deviceId,
          deviceName,
          state: localState,
          revision: view.revision || 0,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const at = Date.now()
      const revision = data.revision || (view.revision + 1)

      try {
        localStorage.setItem(SYNC_MARK_KEY, JSON.stringify({ deviceId, at, revision }))
      } catch {}

      emit({
        phase: 'synced',
        pending: false,
        lastSynced: at,
        revision,
        message: '',
      })
      return true
    } catch (err) {
      emit({
        phase: navigator.onLine === false ? 'offline' : 'error',
        pending: true,
        message: cloudError(err),
      })
      throw err
    } finally {
      busy = null
      if (queued) {
        queued = false
        schedule()
      }
    }
  })()

  return busy
}

export async function fetchCloudDeviceState(targetDeviceId) {
  const id = (targetDeviceId || view.deviceId).trim()
  const res = await fetch(`${DEFAULT_ENDPOINT}/sync?device=${encodeURIComponent(id)}`, { headers: syncHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Compatibility exports
export async function signInCloud() { return true }
export async function signUpCloud() { return true }
export async function signOutCloud() { return true }
export async function resetCloudPassword() { return true }
export async function verifyRecoveryCloud() { return true }
export async function updateCloudPassword() { return true }
export async function attachLocalRecords() { return syncCloudNow() }
