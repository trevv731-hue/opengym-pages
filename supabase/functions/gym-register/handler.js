const origins = new Set(['https://tvgym.pages.dev', 'https://trevv731-hue.github.io', 'https://tvgym.netlify.app', 'http://127.0.0.1:8765'])
export function registrationHandler({ admin, passwordClient, apiKeys, fingerprint }) {
  return async req => {
    const origin = req.headers.get('origin') || ''
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !origins.has(origin)) return reply(403, { code: 'origin_denied' })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (req.method !== 'POST') return reply(405, { code: 'method_not_allowed' })
    if (!apiKeys.includes(req.headers.get('apikey'))) return reply(401, { code: 'invalid_api_key' })
    try {
      const raw = await req.text()
      if (raw.length > 4096) return reply(413, { code: 'invalid_input' })
      const body = JSON.parse(raw)
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const action = body.action
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !['register', 'activate'].includes(action) || password.length < 8 || new TextEncoder().encode(password).length > 72) return reply(400, { code: 'invalid_input' })
      const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',').at(-1).trim()
      const bucket = await fingerprint(ip)
      const { data: allowed, error: limitError } = await admin.rpc('gym_auth_allow_attempt', { fingerprint: bucket })
      if (limitError) return reply(503, { code: 'service_unavailable' })
      if (!allowed) return reply(429, { code: 'registration_rate_limit' })
      if (action === 'register') {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        if (error) return reply(error.code === 'email_exists' || error.code === 'user_already_exists' ? 409 : 400, { code: error.code || 'registration_failed' })
        if (!data.user?.id) return reply(503, { code: 'service_unavailable' })
        return reply(201, { created: true })
      }
      // GoTrue checks the original password BEFORE returning email_not_confirmed.
      // Never activate an account merely because its email was supplied.
      const verifier = passwordClient()
      const { error: passwordError } = await verifier.auth.signInWithPassword({ email, password })
      if (!passwordError) {
        await verifier.auth.signOut({ scope: 'local' })
        return reply(200, { activated: true })
      }
      if (passwordError.code !== 'email_not_confirmed') return reply(401, { code: 'invalid_credentials' })
      const { data: uid, error: lookupError } = await admin.rpc('gym_pending_account', { address: email })
      if (lookupError || !uid) return reply(401, { code: 'invalid_credentials' })
      const { error } = await admin.auth.admin.updateUserById(uid, { email_confirm: true })
      if (error) return reply(503, { code: 'service_unavailable' })
      return reply(200, { activated: true })
    } catch {
      return reply(503, { code: 'service_unavailable' })
    }
  }
}
