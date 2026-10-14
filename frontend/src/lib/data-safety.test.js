import { describe, it, expect, vi, afterEach } from 'vitest'
import { validLocalState, backupDue, hasPersonalData, saveBackupFile, safetyStatus } from './data-safety.js'

afterEach(() => vi.unstubAllGlobals())

const empty = { workouts: [], routines: [], bodyweight: [], customEx: [] }
describe('external backup reminders', () => {
  it('reminds for real records, rather than every empty first launch', () => {
    expect(backupDue(empty, 1000, { exportedAt: 0 })).toBe(false)
    expect(backupDue({ ...empty, bodyweight: [{ d: '2026-10-14', w: 70 }] }, 1000, { exportedAt: 0 })).toBe(true)
  })
  it('reminds after a week and refuses incomplete recovery records', () => {
    const recorded = { ...empty, workouts: [{ id: 'one' }] }
    expect(backupDue(recorded, 8 * 86400000, { exportedAt: 86400000 })).toBe(false)
    expect(backupDue(recorded, 9 * 86400000, { exportedAt: 86400000 })).toBe(true)
    expect(validLocalState(empty)).toBe(true)
    expect(validLocalState({ workouts: 'bad' })).toBe(false)
    expect(hasPersonalData({ ...empty, measurements: [{ d: '2026-10-14' }] })).toBe(true)
  })
})

describe('iPhone backup sharing', () => {
  it('does not mark a cancelled share as an external backup', async () => {
    const before = safetyStatus().exportedAt
    const write = vi.fn()
    vi.stubGlobal('localStorage', { setItem: write })
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')) })
    await expect(saveBackupFile(new Blob(['{}'], { type: 'application/json' }), 'backup.json')).rejects.toMatchObject({ name: 'AbortError' })
    expect(write).not.toHaveBeenCalled()
    expect(safetyStatus().exportedAt).toBe(before)
  })
  it('does not count an incomplete media archive as a complete backup', async () => {
    const write = vi.fn()
    vi.stubGlobal('localStorage', { setItem: write })
    vi.stubGlobal('navigator', { canShare: () => true, share: vi.fn().mockResolvedValue(undefined) })
    await saveBackupFile(new Blob(['zip']), 'backup.zip', false)
    expect(write).not.toHaveBeenCalled()
    await saveBackupFile(new Blob(['zip']), 'backup.zip', true)
    expect(write).toHaveBeenCalledWith('gym_external_export_at', expect.any(String))
  })
})
