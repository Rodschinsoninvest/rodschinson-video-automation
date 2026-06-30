/**
 * Central fetch wrapper — automatically attaches the auth token from localStorage.
 * Drop-in replacement for fetch(): same signature, same return value.
 */
// Large uploads (generation) bypass the Netlify proxy — Netlify caps proxied
// request bodies (~125MB → HTTP 400) — and go straight to the backend, which
// accepts them. CORS allows this origin; the Bearer header authenticates it.
const BACKEND_DIRECT = 'https://content-studio-production-84de.up.railway.app'
const _isLocal = typeof location !== 'undefined'
  && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

export function apiFetch(url, opts = {}) {
  const token = localStorage.getItem('cs_auth_token')
  // Send /api/generate direct to the backend in production (skip Netlify's body
  // limit); in local dev keep it relative so the Vite proxy hits the local API.
  const finalUrl = (!_isLocal && url === '/api/generate') ? BACKEND_DIRECT + url : url
  return fetch(finalUrl, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

/**
 * Download a protected asset using the Bearer token (works regardless of
 * cookie state) by fetching it as a blob and triggering a save.
 */
export async function downloadAsset(path, filename) {
  const res = await apiFetch(path)
  if (!res.ok) {
    let detail = `Download failed (${res.status})`
    try { detail = (await res.json()).detail || detail } catch { /* not json */ }
    throw new Error(detail)
  }
  const blob = await res.blob()
  // Prefer the server-provided filename (correct extension), else the caller's.
  const cd = res.headers.get('content-disposition') || ''
  const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i)
  const serverName = m ? decodeURIComponent(m[1]) : ''
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = serverName || filename || (path.split('/').pop() || 'download')
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
