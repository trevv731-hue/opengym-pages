import { cloudDocument, mergeCloudProfile, sameDocument, writeCloudProfile } from './cloud-profile.js'
import { hasPersonalData, saveRecoveryCopy } from './data-safety.js'
import { referencedFiles, MEDIA_MIMES } from './media-refs.js'
import { mediaStore } from './media-store.js'
import { sha256Hex } from './sha256.js'
import { authMessage, registerRequest, recoveryProof } from './cloud-auth.js'

const OWNER = 'gym_cloud_owner'
const MARK = 'gym_cloud_last_sync'
const listeners = new Set()
let view = { phase: 'loading', user: null, lastSynced: 0, message: '', pending: false, recovery: false }
let client, store, config, starting, timer, poll, busy, queued = false, applying = false, epoch = 0
let consent = false
const confirmedMedia = new Set()
const emit = patch => { view = { ...view, ...patch }; listeners.forEach(fn => fn()) }
export const cloudStatus = () => view
export const subscribeCloud = fn => { listeners.add(fn); return () => listeners.delete(fn) }
const ownerKey = uid => config.url + ':' + uid
const owner = () => { try { return localStorage.getItem(OWNER) || '' } catch { return '' } }
const requireClient = () => { if (!client) throw Error('云端服务尚未连接，请先使用导出备份。'); return client }
const check = (generation, uid) => epoch === generation && view.user?.id === uid && !view.recovery
const currentRedirect = () => location.origin + location.pathname + '#/settings/account'

async function loadConfig() {
  const env = import.meta.env || {}
  let cfg = { url: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY }
  if (!cfg.url || !cfg.publishableKey) {
    const res = await fetch('cloud-config.json', { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.enabled) return null
    cfg = data
  }
  const url = new URL(cfg.url)
  if (url.protocol !== 'https:') throw Error('云端服务必须使用 HTTPS。')
  const key = cfg.publishableKey || ''
  if (!key.startsWith('sb_publishable_')) {
    let role
    try { role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role } catch { /* invalid key */ }
    if (role !== 'anon') throw Error('云端配置只能使用公开访问密钥。')
  }
  return { url: url.origin, publishableKey: key, registrationKey: cfg.registrationKey || (key.startsWith('ey') ? key : '') }
}
function acceptSession(session, event) {
  const user = session?.user || null
  if (view.user?.id !== user?.id) { epoch++; confirmedMedia.clear(); consent = false }
  if (user && (event === 'PASSWORD_RECOVERY' || view.recovery)) { epoch++; emit({ user, recovery: true, phase: 'recovery', message: '' }); return }
  emit({ user, recovery: false, message: '' })
  if (!user) { emit({ phase: 'signed-out', pending: false }); return }
  const who = owner()
  if (who && who !== ownerKey(user.id)) { emit({ phase: 'account-mismatch', pending: false }); return }
  if (!who && hasPersonalData(store.getState().S)) { emit({ phase: 'needs-consent', pending: false }); return }
  if (!who) localStorage.setItem(OWNER, ownerKey(user.id))
  consent = true
  let last = 0
  try { const mark = JSON.parse(localStorage.getItem(MARK) || '{}'); if (mark.owner === ownerKey(user.id)) last = Number(mark.at) || 0 } catch { /* no prior confirmation */ }
  emit({ phase: 'pending', pending: true, lastSynced: last })
  schedule(0)
}
function schedule(delay = 1500) {
  clearTimeout(timer)
  if (!client || !view.user || !consent || view.recovery) return
  timer = setTimeout(() => { timer = null; syncCloudNow().catch(() => {}) }, delay)
}
function applyState(next) {
  applying = true
  try {
    store.getState().applyCloudState(next)
  } finally { applying = false }
}
async function mediaExchange(state, uid, generation) {
  for (const ref of referencedFiles(state)) {
    if (!check(generation, uid)) throw Error('同步已取消。')
    const key = uid + '/' + ref.hash + '.' + (MEDIA_MIMES[ref.mime]?.ext || '')
    const local = await mediaStore.get(ref.hash)
    if (local && !confirmedMedia.has(key)) {
      if (local.blob.size > 50 * 1024 * 1024) throw Error('一份照片或视频超过 50MB，无法同步；请导出带媒体的备份。')
      const { error } = await client.storage.from('gym-media').upload(key, local.blob, { contentType: ref.mime, upsert: false })
      if (error && String(error.statusCode) !== '409' && !/already exists|duplicate/i.test(error.message || '')) throw error
      confirmedMedia.add(key)
    } else if (!local) {
      const { data, error } = await client.storage.from('gym-media').download(key)
      if (error) throw error
      if (!check(generation, uid)) throw Error('同步已取消。')
      if (data.size !== ref.size || await sha256Hex(data) !== ref.hash) throw Error('云端媒体校验失败，本地记录已保留。')
      await mediaStore.put(ref.hash, data, { mime: ref.mime, pending: false })
      confirmedMedia.add(key)
    }
  }
}
export async function startCloudSync(appStore) {
  if (starting) return starting
  store = appStore
  starting = (async () => {
    try {
      config = await loadConfig()
      if (!config) { emit({ phase: 'unconfigured' }); return }
      const returningRecovery = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery'
      const { createClient } = await import('@supabase/supabase-js')
      client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
      // The callback must not await another Supabase operation while Auth holds its lock.
      client.auth.onAuthStateChange((event, session) => { setTimeout(() => acceptSession(session, event), 0) })
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      acceptSession(data.session, returningRecovery ? 'PASSWORD_RECOVERY' : undefined)
      store.subscribe((next, prev) => {
        if (applying || next.S === prev.S || !client || !consent || !view.user || sameDocument(next.S, prev.S)) return
        emit({ pending: true, phase: navigator.onLine === false ? 'offline' : 'pending' })
        queued = true
        schedule()
      })
      window.addEventListener('online', () => schedule(0))
      window.addEventListener('offline', () => { if (view.user && consent) emit({ phase: 'offline', pending: true }) })
      window.addEventListener('focus', () => schedule(0))
      poll = setInterval(() => { if (document.visibilityState === 'visible') schedule(0) }, 60000)
    } catch (e) { emit({ phase: 'error', message: cloudError(e) }) }
  })()
  return starting
}
export function cloudError(error) {
  const known = authMessage(error)
  if (known) return known
  const text = error?.message || String(error)
  if (/email address.*not authorized|email.*not.*allowed|error sending.*email|error sending.*mail/i.test(text)) return '注册邮件暂时无法发送。个人使用请先用 Supabase 组织成员邮箱；其他邮箱需要配置发信服务。'
  if (/Invalid login credentials/i.test(text)) return '邮箱或密码不正确。'
  if (/Email not confirmed/i.test(text)) return '请先打开注册邮件完成邮箱验证。'
  if (/rate limit|too many/i.test(text)) return '请求太频繁，请稍后重试。'
  if (/fetch|network|offline|timeout|Failed to fetch/i.test(text)) return '暂时无法连接云端，本地记录仍在，联网后可重试。'
  if (/not.*found|relation|schema cache|permission|policy/i.test(text)) return '云端服务尚未配置完整，本地记录已保留。'
  return text.slice(0, 220)
}
export async function signInCloud(email, password) {
  let result = await requireClient().auth.signInWithPassword({ email: email.trim(), password })
  if (result.error?.code === 'email_not_confirmed') {
    await registerRequest(config, 'activate', email, password)
    result = await client.auth.signInWithPassword({ email: email.trim(), password })
  }
  if (result.error) throw result.error
  if (!result.data.session?.user?.id) throw Error('登录尚未完成，请重试。')
  acceptSession(result.data.session)
}
export async function signUpCloud(email, password) {
  requireClient()
  await registerRequest(config, 'register', email, password)
  try { await signInCloud(email, password) }
  catch { throw Object.assign(Error('账号已创建，自动登录未完成。'), { code: 'created_login_failed' }) }
  return true
}
export async function verifyRecoveryCloud(value, email) {
  const proof = recoveryProof(value, config.url, email)
  const { data, error } = await requireClient().auth.verifyOtp(proof)
  if (error) throw error
  if (!data.session?.user?.id) throw Error('邮箱验证尚未完成，请重试。')
  acceptSession(data.session, 'PASSWORD_RECOVERY')
}
export async function resetCloudPassword(email) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: currentRedirect() })
  if (error) throw error
}
export async function updateCloudPassword(password) {
  const { data, error } = await requireClient().auth.updateUser({ password })
  if (error) throw error
  emit({ recovery: false })
  const { data: session } = await client.auth.getSession()
  acceptSession(session.session)
  return data
}
export async function signOutCloud() {
  epoch++; consent = false; clearTimeout(timer); queued = false
  const { error } = await requireClient().auth.signOut({ scope: 'local' })
  if (error) { acceptSession((await client.auth.getSession()).data.session); throw error }
  emit({ phase: 'signed-out', user: null, recovery: false, pending: false, message: '' })
}
export async function attachLocalRecords() {
  if (!view.user) throw Error('请先登录。')
  if (owner() && owner() !== ownerKey(view.user.id)) throw Error('此设备记录属于其他账号，请先导出并清空当前设备记录。')
  await saveRecoveryCopy(store.getState().S)
  localStorage.setItem(OWNER, ownerKey(view.user.id))
  consent = true
  return syncCloudNow()
}
export async function syncCloudNow() {
  if (!view.user || !consent || view.recovery) return
  if (owner() !== ownerKey(view.user.id)) { consent = false; emit({ phase: 'account-mismatch' }); return }
  if (busy) { queued = true; return busy }
  if (navigator.onLine === false) { emit({ phase: 'offline', pending: true }); return }
  const generation = epoch, uid = view.user.id
  emit({ phase: 'syncing', message: '' })
  queued = false
  busy = (async () => {
    try {
      const { data, error } = await client.from('gym_profiles').select('revision,state').eq('user_id', uid).maybeSingle()
      if (error) throw error
      if (!check(generation, uid)) return
      const local = store.getState().S
      const merged = data?.state ? mergeCloudProfile(local, data.state) : local
      // Upload local references first. A remote document is never written pointing
      // at files that the account cannot yet restore.
      await mediaExchange(merged, uid, generation)
      let result
      if (data?.state && sameDocument(merged, data.state)) result = { revision: data.revision, state: data.state, local: mergeCloudProfile(store.getState().S, data.state) }
      else result = await writeCloudProfile({
        state: merged, revision: data?.revision || 0,
        active: () => check(generation, uid), readLocal: () => store.getState().S,
        write: async (revision, state) => {
          await mediaExchange(state, uid, generation)
          const { data, error } = await client.rpc('save_gym_profile', { expected_revision: revision, document: state })
          if (error) throw error
          return data
        },
      })
      if (!check(generation, uid)) return
      const latest = mergeCloudProfile(store.getState().S, result.state)
      await mediaExchange(latest, uid, generation)
      if (!check(generation, uid)) return
      if (!sameDocument(store.getState().S, latest)) applyState(latest)
      const stillPending = !sameDocument(store.getState().S, result.state)
      const at = Date.now()
      localStorage.setItem(MARK, JSON.stringify({ owner: ownerKey(uid), at, revision: result.revision }))
      emit({ phase: stillPending ? 'pending' : 'synced', pending: stillPending, lastSynced: at, message: '' })
      if (stillPending) queued = true
    } catch (error) {
      if (check(generation, uid)) emit({ phase: navigator.onLine === false ? 'offline' : 'error', pending: true, message: cloudError(error) })
      throw error
    } finally {
      busy = null
      if (queued && check(generation, uid)) { queued = false; schedule() }
    }
  })()
  return busy
}
