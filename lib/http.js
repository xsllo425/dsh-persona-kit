// dsh-persona-kit: the small HTTP helpers every route shares.
const LOCAL = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * Only the user's own machine may call these routes: a request that came through a proxy (mobile access, a tunnel),
 * names another host, or carries a foreign Origin (another web page poking at localhost) is refused.
 */
export function trusted(req) {
  if (req.headers['x-forwarded-for'] !== undefined || req.headers.forwarded !== undefined) return false
  const a = req.socket?.remoteAddress || ''
  if (a !== '127.0.0.1' && a !== '::1' && a !== '::ffff:127.0.0.1') return false
  const host = String(req.headers.host || '').toLowerCase()
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '')
  if (host !== '' && !LOCAL.has(hostname)) return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '') { try { if (!LOCAL.has(new URL(origin).hostname)) return false } catch { return false } }
  return true
}

export const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
