// Owner access is checked in the application, on every hostname serving this Worker.
const HOST = 'gym.bdprk.com';
const COOKIE = '__Host-journal_owner';
const AGE = 30 * 86400;
const utf8 = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async value => hex(await crypto.subtle.digest('SHA-256', utf8.encode(value)));
export async function secretEqual(a, b) {
  if (!a || !b) return false;
  const x = await sha256(a), y = await sha256(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
export async function appAuthorized(request, secret) {
  return secretEqual(request.headers.get('authorization'), secret ? 'Bearer ' + secret : '');
}
const normalizeFingerprint = value => String(value || '').replace(/:/g, '').toLowerCase();
async function signingKey(env) {
  return crypto.subtle.importKey('raw', utf8.encode(env.OWNER_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function issueSession(env, now = Math.floor(Date.now() / 1000)) {
  const payload = `${now + AGE}.${crypto.randomUUID()}`;
  const signature = hex(await crypto.subtle.sign('HMAC', await signingKey(env), utf8.encode(payload)));
  return `${payload}.${signature}`;
}
export async function ownerAuthorized(request, env) {
  const url = new URL(request.url);
  // Cookies and client certificates must not grant owner access on alternate hosts.
  if (url.protocol !== 'https:' || url.hostname !== HOST) return false;
  const origin = request.headers.get('origin');
  if (origin && origin !== `https://${HOST}`) return false;
  const tls = request.cf?.tlsClientAuth;
  const allowed = String(env.OWNER_CERT_SHA256 || '').split(',').map(normalizeFingerprint).filter(v => /^[a-f0-9]{64}$/.test(v));
  if (tls?.certVerified === 'SUCCESS' && tls.certRevoked === '0' && allowed.includes(normalizeFingerprint(tls.certFingerprintSHA256))) return true;
  if (!env.OWNER_SESSION_SECRET) return false;
  const cookie = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 180) return false;
  const match = /^(\d{10})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(cookie);
  if (!match) return false;
  const now = Math.floor(Date.now() / 1000), expiry = Number(match[1]);
  if (expiry <= now || expiry > now + AGE) return false;
  const signature = Uint8Array.from(match[3].match(/../g), v => parseInt(v, 16));
  return crypto.subtle.verify('HMAC', await signingKey(env), signature, utf8.encode(`${match[1]}.${match[2]}`));
}
export function safeBrowserMutation(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  return request.headers.get('origin') === `https://${HOST}` && request.headers.get('sec-fetch-site') !== 'cross-site';
}
const headers = {
  'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
  'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
function loginPage(message = '', status = 200) {
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>进入训练手记</title><style>body{margin:0;background:#f5f3ed;color:#38352f;font:16px/1.7 system-ui}main{max-width:440px;margin:12vh auto;padding:28px}h1{font-size:28px}p{color:#6e685f}form{display:grid;gap:16px;margin-top:28px}input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #b6afa3;box-sizing:border-box;max-width:100%;min-width:0}button{background:#70412d;color:white;cursor:pointer}a{color:#70412d}.error{color:#a42c20}small{display:block;margin-top:28px;color:#6e685f}</style><main><h1>你的私人训练空间</h1><p>已授权的电脑可使用设备证书进入。换设备时，可以使用备用恢复密钥。</p>${message ? `<p class="error" role="alert">${message}</p>` : ''}<form method="post" action="/auth/recover"><label for="recovery">恢复密钥</label><input id="recovery" name="recovery" type="password" autocomplete="off" required maxlength="120"><button type="submit">使用恢复密钥进入</button></form><p><a href="/">重新检查设备授权</a></p><small>恢复密钥也丢失？通过网站的 Cloudflare 管理账户重置访问。站点不会向任何人展示或发送已有密钥。</small></main></html>`, { status, headers });
}
export function ownerDenied(request) {
  if (new URL(request.url).pathname.startsWith('/api/')) return Response.json({error:'需要设备授权或恢复登录'}, {status:401,headers:{'cache-control':'no-store'}});
  return new Response(null, {status:303,headers:{location:`https://${HOST}/auth/login`,'cache-control':'no-store'}});
}
export async function ownerAuthRoute(request, env) {
  const url = new URL(request.url);
  if (url.hostname !== HOST || url.protocol !== 'https:') return new Response('Not found', {status:404});
  if (url.pathname === '/auth/login' && request.method === 'GET') return loginPage();
  if (url.pathname === '/auth/recover' && request.method === 'POST') {
    if (!safeBrowserMutation(request)) return new Response('Forbidden', {status:403});
    if (!env.OWNER_RECOVERY_SHA256 || !env.OWNER_SESSION_SECRET) return loginPage('恢复入口尚未配置，请通过网站管理端重置。', 503);
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return loginPage('请通过恢复表单提交。', 400);
    // Bound the stream; Content-Length is optional and cannot be trusted.
    const reader = request.body?.getReader();
    if (!reader) return loginPage('请输入恢复密钥。', 400);
    let size = 0, chunks = [];
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length; if (size > 1024) { await reader.cancel(); return loginPage('输入内容过长。',413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const recovery = new URLSearchParams(new TextDecoder().decode(bytes)).get('recovery')?.trim() || '';
    if (!await secretEqual(await sha256(recovery), env.OWNER_RECOVERY_SHA256)) return loginPage('恢复密钥不正确，请检查后重试。', 401);
    const token = await issueSession(env);
    return new Response(null, {status:303,headers:{location:'/', 'cache-control':'no-store','set-cookie':`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${AGE}`}});
  }
  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    if (!safeBrowserMutation(request)) return new Response('Forbidden',{status:403});
    return new Response(null,{status:303,headers:{location:'/auth/login','cache-control':'no-store','set-cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}});
  }
  return new Response('Not found',{status:404});
}

