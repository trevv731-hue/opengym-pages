import { describe, it, expect } from 'vitest'
import { cloudDocument, mergeCloudProfile, sameDocument, writeCloudProfile } from './cloud-profile.js'

const base = extra => ({ unit: 'kg', workouts: [], routines: [], bodyweight: [], customEx: [], active: null, _ts: 1, ...extra })
const workout = id => ({ id, d: '2026-10-14', start: 1, end: 2, entries: [], _ts: 1 })

describe('personal cloud profiles', () => {
  it('keeps a running workout local even if the cloud is newer', () => {
    const active = { id: 'running', entries: [] }
    const merged = mergeCloudProfile(base({ active, workouts: [workout('phone')] }), base({ _ts: 8, workouts: [workout('desktop')] }))
    expect(merged.workouts.map(w => w.id).sort()).toEqual(['desktop', 'phone'])
    expect(merged.active).toEqual(active)
    expect(cloudDocument(merged)).not.toHaveProperty('active')
  })
  it('does not treat jsonb key ordering or a running timer as a new cloud edit', () => {
    const a = base({ week: { 1: 'push', 3: 'pull' }, active: { start: 1 } })
    const b = Object.fromEntries(Object.entries(a).reverse())
    b.active = { start: 2 }
    expect(sameDocument(a, b)).toBe(true)
  })
  it('retries a revision conflict while retaining edits made during the request', async () => {
    let local = base({ workouts: [workout('phone')] })
    const calls = []
    const result = await writeCloudProfile({ state: local, revision: 1, active: () => true, readLocal: () => local,
      write: async (revision, state) => {
        calls.push({ revision, state })
        if (calls.length === 1) {
          local = base({ workouts: [workout('phone'), workout('new-set')] })
          return { conflict: true, revision: 2, state: base({ workouts: [workout('desktop')] }) }
        }
        return { conflict: false, revision: 3, state }
      },
    })
    expect(calls[1].revision).toBe(2)
    expect(result.state.workouts.map(w => w.id).sort()).toEqual(['desktop', 'new-set', 'phone'])
  })
  it('never reports success when the network fails', async () => {
    await expect(writeCloudProfile({ state: base(), revision: 0, active: () => true, readLocal: () => base(), write: async () => { throw Error('offline') } })).rejects.toThrow('offline')
  })
  it('discards an old account response after logout', async () => {
    let signedIn = true
    await expect(writeCloudProfile({ state: base(), revision: 0, readLocal: () => base(), active: () => signedIn,
      write: async () => { signedIn = false; return { conflict: false, revision: 1, state: base() } },
    })).rejects.toThrow('同步已取消')
  })
  it('refuses malformed remote data and bounds conflict retries', async () => {
    expect(() => mergeCloudProfile(base(), {})).toThrow('不完整')
    let requests = 0
    await expect(writeCloudProfile({ state: base(), revision: 0, readLocal: () => base(), active: () => true,
      write: async () => { requests++; return { conflict: true, revision: requests, state: base() } },
    })).rejects.toThrow('其他设备')
    expect(requests).toBe(4)
  })
})
