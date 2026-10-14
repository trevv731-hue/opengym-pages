// A second browser-local copy helps recover a damaged primary record. It is not
// an external backup: clearing all website data removes both local stores.
const DB = 'opengym-recovery-v1'
const STORE = 'copies'
const LATEST = 'latest'
const KEEP = 14
const INTERVAL = 15 * 60 * 1000
const EXPORT_KEY = 'gym_external_export_at'
const OWNER_KEY = 'gym_cloud_owner'
const listeners = new Set()
let view = { available: false, savedAt: 0, exportedAt: 0, restored: false, error: '', persistent: false }
let dbPromise
let queue = Promise.resolve()
let previousSnapshot = 0
let latestState
let timer
const emit = patch => { view = { ...view, ...patch }; listeners.forEach(f => f()) }
export const safetyStatus = () => view
export const subscribeSafety = fn => { listeners.add(fn); return () => listeners.delete(fn) }
export const validLocalState = s => !!s && typeof s === 'object' && !Array.isArray(s)
  && ['workouts', 'routines', 'bodyweight', 'customEx'].every(k => Array.isArray(s[k]))
export const hasPersonalData = s => ['workouts', 'routines', 'bodyweight', 'customEx', 'measurements', 'gymCards'].some(k => s?.[k]?.length)

function open() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(Error('浏览器不支持本地恢复副本')); return }
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(Error('本地恢复副本暂时不可用'))
  }).catch(e => { dbPromise = null; throw e })
  return dbPromise
}
const readAll = async () => {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export function saveRecoveryCopy(state, now = Date.now()) {
  // Clone at scheduling time, not after a later edit has changed the object.
  const copy = JSON.parse(JSON.stringify(state))
  const owner = localStorage.getItem(OWNER_KEY) || ''
  queue = queue.catch(() => {}).then(async () => {
    if (!validLocalState(copy)) return
    const db = await open()
    const all = await readAll()
    const snapshot = now - previousSnapshot >= INTERVAL
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      store.put({ id: LATEST, at: now, owner, state: copy })
      if (snapshot) {
        store.put({ id: 'copy-' + now, at: now, owner, state: copy })
        const old = all.filter(c => c.id !== LATEST).sort((a, b) => b.at - a.at)
        old.slice(KEEP - 1).forEach(c => store.delete(c.id))
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || Error('恢复副本写入失败'))
    })
    if (snapshot) previousSnapshot = now
    emit({ available: true, savedAt: now, error: '' })
  }).catch(() => { emit({ available: false, error: '恢复副本保存失败，请尽快导出备份。' }) })
  return queue
}
export async function recoveryCopies() {
  try {
    const owner = localStorage.getItem(OWNER_KEY) || ''
    return (await readAll()).filter(c => c.id !== LATEST && c.owner === owner && validLocalState(c.state)).sort((a, b) => b.at - a.at)
  }
  catch { return [] }
}
export async function recoverPrimaryRecord(store) {
  try {
    emit({ exportedAt: Number(localStorage.getItem(EXPORT_KEY)) || 0 })
    const all = await readAll()
    const latest = all.find(c => c.id === LATEST)
    previousSnapshot = Math.max(0, ...all.filter(c => c.id !== LATEST).map(c => c.at))
    let primary
    try { primary = JSON.parse(localStorage.getItem('gym_state_v1') || 'null') } catch { /* damaged record */ }
    if (!validLocalState(primary) && validLocalState(latest?.state)) {
      if (latest.owner) localStorage.setItem(OWNER_KEY, latest.owner)
      store.getState().replaceState(latest.state, false)
      emit({ restored: true })
    }
    emit({ available: true, savedAt: latest?.at || 0 })
    if (navigator.storage?.persisted) emit({ persistent: await navigator.storage.persisted() })
  } catch { emit({ available: false, error: '此浏览器暂时无法保存恢复副本，请使用导出备份。' }) }
}
export function startLocalSafety(store) {
  const schedule = S => {
    latestState = S
    clearTimeout(timer)
    timer = setTimeout(() => { timer = null; saveRecoveryCopy(latestState) }, 600)
  }
  const stop = store.subscribe((next, prev) => { if (next.S !== prev.S) schedule(next.S) })
  schedule(store.getState().S)
  const flush = () => { if (latestState) { clearTimeout(timer); saveRecoveryCopy(latestState) } }
  const hide = () => { if (document.visibilityState === 'hidden') flush() }
  document.addEventListener('visibilitychange', hide)
  window.addEventListener('pagehide', flush)
  return () => { stop(); clearTimeout(timer); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', flush) }
}
export function markExternalExport(now = Date.now()) {
  try { localStorage.setItem(EXPORT_KEY, String(now)) } catch { /* status only */ }
  emit({ exportedAt: now })
}
export const backupDue = (state, now = Date.now(), status = view) => hasPersonalData(state)
  && (!status.exportedAt || now - status.exportedAt > 7 * 86400000)
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false
  const granted = await navigator.storage.persist()
  emit({ persistent: granted })
  return granted
}
export async function saveBackupFile(blob, filename, complete = true) {
  const file = new File([blob], filename, { type: blob.type })
  // Sharing is a user gesture; on iPhone this exposes Save to Files/iCloud Drive.
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'openGym 健身备份' })
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  if (complete) markExternalExport()
}
