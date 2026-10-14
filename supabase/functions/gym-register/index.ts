import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { registrationHandler } from './handler.js'

const url = Deno.env.get('SUPABASE_URL')!
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const anon = Deno.env.get('SUPABASE_ANON_KEY')!
const publicKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')).map(String)
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } }
const admin = createClient(url, service, options)
Deno.serve(registrationHandler({
  admin,
  passwordClient: () => createClient(url, anon, options),
  apiKeys: [anon, ...publicKeys, 'sb_publishable_OUxAoH8FbahM3qV3sR4VDQ_g1RClGcR'],
  fingerprint: async (ip: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(service + ':' + ip))
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  },
}))
