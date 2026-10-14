import { describe, it, expect, vi } from 'vitest'
import { authMessage, registerRequest, recoveryProof } from './cloud-auth.js'
import { registrationHandler } from '../../../supabase/functions/gym-register/handler.js'

const cfg = { url: 'https://gym.supabase.co', publishableKey: 'public', registrationKey: 'anon' }
const input = { email: 'person@example.com', password: 'Long-test-password!', action: 'register' }
function fixture({ passwordError = null, allowed = true, createError = null } = {}) {
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: createError })
  const updateUserById = vi.fn().mockResolvedValue({ error: null })
  const rpc = vi.fn(async name => name === 'gym_auth_allow_attempt' ? { data: allowed } : { data: 'pending-user' })
  const admin = { rpc, auth: { admin: { createUser, updateUserById } } }
  const passwordClient = vi.fn(() => ({ auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: passwordError }), signOut: vi.fn().mockResolvedValue({ error: null }) } }))
  const handle = registrationHandler({ admin, passwordClient, apiKeys: ['public'], fingerprint: async () => 'a'.repeat(64) })
  const req = (body = input, headers = {}) => new Request('https://gym.supabase.co/functions/v1/gym-register', { method: 'POST', headers: { apikey: 'public', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { handle, req, rpc, createUser, updateUserById, passwordClient }
}
describe('registration and pending account activation', () => {
  it('creates an immediately usable account without changing the requested password', async () => {
    const f = fixture(); const res = await f.handle(f.req())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ created: true })
    expect(f.createUser).toHaveBeenCalledWith({ email: input.email, password: input.password, email_confirm: true })
    expect(f.updateUserById).not.toHaveBeenCalled()
  })
  it('rejects invalid API credentials, input and foreign browser origins before privileged actions', async () => {
    const f = fixture()
    expect((await f.handle(f.req(input, { apikey: 'other' }))).status).toBe(401)
    expect((await f.handle(f.req({ ...input, email: 'bad' }))).status).toBe(400)
    expect((await f.handle(f.req(input, { origin: 'https://other.example' }))).status).toBe(403)
    expect(f.createUser).not.toHaveBeenCalled()
  })
  it('never overwrites the password of an existing account', async () => {
    const f = fixture({ createError: { code: 'email_exists' } })
    const res = await f.handle(f.req()); expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: 'email_exists' })
    expect(f.updateUserById).not.toHaveBeenCalled()
  })
  it('cannot activate an existing account with an incorrect password', async () => {
    const f = fixture({ passwordError: { code: 'invalid_credentials' } })
    expect((await f.handle(f.req({ ...input, action: 'activate' }))).status).toBe(401)
    expect(f.rpc).not.toHaveBeenCalledWith('gym_pending_account', expect.anything())
    expect(f.updateUserById).not.toHaveBeenCalled()
  })
  it('activates only after GoTrue has validated the original password', async () => {
    const f = fixture({ passwordError: { code: 'email_not_confirmed' } })
    expect((await f.handle(f.req({ ...input, action: 'activate' }))).status).toBe(200)
    expect(f.updateUserById).toHaveBeenCalledWith('pending-user', { email_confirm: true })
  })
  it('does not create an account if the rate limiter refuses or fails', async () => {
    const f = fixture({ allowed: false })
    expect((await f.handle(f.req())).status).toBe(429)
    expect(f.createUser).not.toHaveBeenCalled()
  })
})
describe('visible auth results and recovery proofs', () => {
  it('preserves an explicit duplicate or failed-registration result', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'email_exists' }), { status: 409 }))
    await expect(registerRequest(cfg, 'register', input.email, input.password, fetcher)).rejects.toMatchObject({ code: 'email_exists' })
    expect(authMessage({ code: 'email_exists' })).toContain('已经注册')
    expect(authMessage({ code: 'created_login_failed' })).toContain('账号已创建')
  })
  it('never accepts a missing registration confirmation as success', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    await expect(registerRequest(cfg, 'register', input.email, input.password, fetcher)).rejects.toMatchObject({ code: 'service_unavailable' })
  })
  it('verifies only recovery tokens belonging to this project', () => {
    const link = cfg.url + '/auth/v1/verify?token=' + 'a'.repeat(64) + '&type=recovery&redirect_to=http://localhost:3000'
    expect(recoveryProof(link, cfg.url, input.email)).toEqual({ token_hash: 'a'.repeat(64), type: 'recovery' })
    expect(() => recoveryProof(link.replace('gym.supabase.co', 'other.supabase.co'), cfg.url, input.email)).toThrow()
    expect(() => recoveryProof(link.replace('type=recovery', 'type=signup'), cfg.url, input.email)).toThrow()
    expect(recoveryProof('123456', cfg.url, input.email)).toEqual({ email: input.email, token: '123456', type: 'recovery' })
  })
})
