import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext()

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const toast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++counterRef.current
    setToasts(t => [...t.slice(-4), { id, message, type, duration }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  const success = useCallback((msg, dur) => toast(msg, 'success', dur), [toast])
  const error   = useCallback((msg, dur) => toast(msg, 'error',   dur || 5000), [toast])
  const info    = useCallback((msg, dur) => toast(msg, 'info',    dur), [toast])
  const warning = useCallback((msg, dur) => toast(msg, 'warning', dur), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

// ── Toast colors ──────────────────────────────────────────────────────────────
const TOAST_STYLES = {
  success: { bg: '#0f2d1a', border: 'rgba(34,197,94,0.35)',  icon: '✓', iconBg: '#16a34a', text: '#86efac' },
  error:   { bg: '#2d0f0f', border: 'rgba(239,68,68,0.35)',  icon: '✕', iconBg: '#dc2626', text: '#fca5a5' },
  info:    { bg: '#0a1e2d', border: 'rgba(0,182,255,0.3)',   icon: 'i', iconBg: '#0284c7', text: '#7dd3fc' },
  warning: { bg: '#2d1f0a', border: 'rgba(234,179,8,0.35)',  icon: '!', iconBg: '#ca8a04', text: '#fde68a' },
}

function Toast({ id, message, type, onDismiss }) {
  const s = TOAST_STYLES[type] || TOAST_STYLES.info
  return (
    <div
      onClick={() => onDismiss(id)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
        padding: '11px 14px', borderRadius: 10, marginBottom: 8,
        background: s.bg, border: `1px solid ${s.border}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        animation: 'fadein 0.18s ease', minWidth: 260, maxWidth: 380,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: s.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0, marginTop: 1,
      }}>{s.icon}</div>
      <span style={{ color: s.text, fontSize: 13, lineHeight: 1.45, flex: 1 }}>{message}</span>
    </div>
  )
}

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast {...t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
