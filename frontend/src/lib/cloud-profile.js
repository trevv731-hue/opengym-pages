import { mergeStates, inUnitOf } from './sync-merge.js'
import { validLocalState } from './data-safety.js'

export const cloudDocument = state => {
  const copy = JSON.parse(JSON.stringify(state))
  delete copy.active
  delete copy._wid
  return copy
}
// Keep the running workout on its originating device, converting its load if a
// remote device changed units while this device was offline.
export function mergeCloudProfile(local, remote, options) {
  if (!validLocalState(remote)) throw Error('云端返回的数据不完整，本地记录已保留。')
  const merged = mergeStates(local, { ...remote, active: null }, options)
  merged.active = local.active ? inUnitOf(local, merged).active : null
  return merged
}
// Postgres jsonb reorders object keys; compare content rather than key order.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
export const sameDocument = (a, b) => JSON.stringify(canonical(cloudDocument(a))) === JSON.stringify(canonical(cloudDocument(b)))

// One bounded optimistic write: a rejected revision is merged and retried, never
// accepted as success. Cancellation is checked after every awaited operation.
export async function writeCloudProfile({ state, revision, write, readLocal, active, merge = mergeCloudProfile, attempts = 4 }) {
  let document = cloudDocument(state)
  for (let n = 0; n < attempts; n++) {
    if (!active()) throw Error('同步已取消，本地记录已保留。')
    const result = await write(revision, document)
    if (!active()) throw Error('同步已取消，本地记录已保留。')
    if (!result || !Number.isSafeInteger(result.revision) || result.revision < 1 || !validLocalState(result.state)) {
      throw Error('云端未确认保存，请重试；本地记录仍在。')
    }
    if (result.conflict) {
      revision = result.revision
      document = cloudDocument(merge(readLocal(), result.state))
      continue
    }
    return { revision: result.revision, state: result.state, local: merge(readLocal(), result.state) }
  }
  throw Error('其他设备正在更新，请稍后重试。本地记录已保留。')
}
