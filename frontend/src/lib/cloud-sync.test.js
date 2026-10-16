// @vitest-environment happy-dom
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {pairCloudDevice,hasCloudPairing,fetchCloudDeviceState} from './cloud-sync.js'
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn())})
afterEach(()=>vi.unstubAllGlobals())
it('pairing validates before saving and only sends the ActiveT token',async()=>{
  const token='a'.repeat(43)
  fetch.mockResolvedValue({ok:false,status:401})
  await expect(pairCloudDevice(token)).rejects.toThrow('同步密钥不正确')
  expect(hasCloudPairing()).toBe(false)
  fetch.mockResolvedValue({ok:true,json:async()=>({found:false})})
  await pairCloudDevice(token)
  expect(hasCloudPairing()).toBe(true)
  await fetchCloudDeviceState('my-device')
  const [url,opts]=fetch.mock.calls.at(-1)
  expect(url).toContain('device=my-device')
  expect(opts.headers.Authorization).toBe('Bearer '+token)
  expect(url).not.toContain(token)
})
it('unpaired devices do not send a cloud request',async()=>{
  await expect(fetchCloudDeviceState('device')).rejects.toThrow('请先')
  expect(fetch).not.toHaveBeenCalled()
})
