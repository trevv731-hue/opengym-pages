export function authMessage(error) {
  const code = error?.code || ''
  const messages = {
    invalid_credentials: '邮箱或密码不正确，请检查后重试。',
    email_exists: '这个邮箱已经注册，请切换到登录。忘记密码可通过邮箱找回。',
    user_already_exists: '这个邮箱已经注册，请切换到登录。',
    email_address_invalid: '邮箱地址无效，请填写能收邮件的真实邮箱。',
    invalid_input: '请填写有效邮箱，密码至少 8 个字符，最多 72 字节。',
    weak_password: '密码强度不足，请换一个更长的密码。',
    registration_rate_limit: '尝试次数过多，请稍后重试。',
    over_email_send_rate_limit: '找回密码邮件发送次数已达上限，请稍后再试。',
    email_not_confirmed: '旧账号登录尚未完成，请重试；无需再验证注册邮箱。',
    otp_expired: '验证链接已失效或已使用，请重新发送找回密码邮件。',
    service_unavailable: '账号服务暂时无法连接，请重试。本机记录仍然保留。',
    created_login_failed: '账号已创建，但自动登录未完成。请切换到登录，使用刚设置的密码。',
  }
  return messages[code] || null
}

export async function registerRequest(config, action, email, password, fetcher = fetch) {
  if (!config.registrationKey) throw Object.assign(Error('注册服务尚未接通，请稍后重试。'), { code: 'service_unavailable' })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const res = await fetcher(config.url + '/functions/v1/gym-register', {
      method: 'POST', signal: controller.signal,
      headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + config.registrationKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, email: email.trim(), password }),
    })
    const result = await res.json()
    if (!res.ok || !(result.created || result.activated)) throw Object.assign(Error('账号操作未完成。'), { code: result.code || 'service_unavailable' })
    return result
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(Error('连接超时，请重试。本机记录仍然保留。'), { code: 'service_unavailable' })
    throw error
  } finally { clearTimeout(timer) }
}

export function recoveryProof(value, projectUrl, email) {
  const text = value.trim()
  if (/^\d{6,10}$/.test(text)) return { email: email.trim(), token: text, type: 'recovery' }
  let url
  try { url = new URL(text) } catch { throw Error('请粘贴找回密码邮件里的完整验证链接或验证码。') }
  const hash = url.searchParams.get('token_hash') || url.searchParams.get('token')
  if (url.origin !== projectUrl || url.pathname !== '/auth/v1/verify' || url.searchParams.get('type') !== 'recovery' || !hash || !/^[a-zA-Z0-9_-]{16,256}$/.test(hash)) throw Error('这不是本站的找回密码验证链接，请检查邮件。')
  return { token_hash: hash, type: 'recovery' }
}
