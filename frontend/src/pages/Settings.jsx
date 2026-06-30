import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../utils/apiFetch'
import { useToast } from '../contexts/ToastContext'
import { Save, Eye, EyeOff, CheckCircle2, AlertCircle, Lock, Settings2, Globe, Zap, Mic2, Bot } from 'lucide-react'

const GROUPS = [
  { id: 'general',    label: 'General',      icon: Settings2 },
  { id: 'publishing', label: 'Publishing',   icon: Globe },
  { id: 'security',   label: 'Security',     icon: Lock },
  { id: 'metricool',  label: 'Metricool',    icon: Zap },
  { id: 'elevenlabs', label: 'ElevenLabs',   icon: Mic2 },
  { id: 'ai',         label: 'AI / Claude',  icon: Bot },
]

function SettingField({ keyName, meta, value, onChange }) {
  const [show, setShow] = useState(false)
  const isPassword = meta.type === 'password'

  const sourceColor = meta.source === 'override' ? '#00B6FF' : meta.source === 'env' ? '#22c55e' : '#637083'
  const sourceLabel = meta.source === 'override' ? 'override' : meta.source === 'env' ? 'env' : 'not set'

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--cs-text-sub)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {meta.label}
        </label>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
          background: `${sourceColor}18`, color: sourceColor, letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {sourceLabel}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={isPassword && !show ? 'password' : 'text'}
          value={value}
          onChange={e => onChange(keyName, e.target.value)}
          placeholder={meta.hasValue ? '(unchanged)' : 'Not configured'}
          style={{
            width: '100%', padding: isPassword ? '10px 42px 10px 14px' : '10px 14px',
            background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)',
            borderRadius: 8, color: 'var(--cs-text)', fontSize: 13,
            outline: 'none', boxSizing: 'border-box',
            fontFamily: isPassword && !show ? 'monospace' : 'inherit',
          }}
          onFocus={e => e.target.style.borderColor = '#00B6FF'}
          onBlur={e => e.target.style.borderColor = 'var(--cs-border)'}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--cs-text-muted)', padding: 0, display: 'flex',
            }}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const { username, logout } = useAuth()
  const { addToast } = useToast()
  const [activeGroup, setActiveGroup] = useState('general')
  const [schema, setSchema]           = useState(null)   // raw from /api/settings
  const [edits, setEdits]             = useState({})     // { KEY: newValue }
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    apiFetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSchema(data)
        // Pre-populate edits with current (possibly masked) values
        const initial = {}
        Object.entries(data).forEach(([k, v]) => {
          initial[k] = v.value  // shows masked or plain value
        })
        setEdits(initial)
      })
      .catch(() => addToast('Failed to load settings', 'error'))
  }, [])

  const handleChange = (key, value) => {
    setEdits(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async (groupId) => {
    if (!schema) return
    setSaving(true)
    // Collect only keys belonging to this group
    const groupKeys = Object.entries(schema)
      .filter(([, m]) => m.group === groupId)
      .map(([k]) => k)

    const updates = {}
    groupKeys.forEach(k => {
      const current = edits[k] ?? ''
      const original = schema[k]?.value ?? ''
      // Only send if actually changed
      if (current !== original) {
        updates[k] = current
      }
    })

    if (Object.keys(updates).length === 0) {
      addToast('No changes to save', 'info')
      setSaving(false)
      return
    }

    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) throw new Error()
      addToast('Settings saved', 'success')
      // Refresh schema to show updated sources
      const fresh = await apiFetch('/api/settings').then(r => r.json())
      setSchema(fresh)
      const next = {}
      Object.entries(fresh).forEach(([k, v]) => { next[k] = v.value })
      setEdits(next)
    } catch {
      addToast('Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const groupEntries = schema
    ? Object.entries(schema).filter(([, m]) => m.group === activeGroup)
    : []

  const activeGroupMeta = GROUPS.find(g => g.id === activeGroup)
  const ActiveIcon = activeGroupMeta?.icon || Settings2

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--cs-text)', margin: 0, letterSpacing: '-0.4px' }}>
          Settings
        </h1>
        <p style={{ color: 'var(--cs-text-sub)', fontSize: 14, margin: '4px 0 0' }}>
          Manage integrations, API keys, and app configuration
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Sidebar nav */}
        <div className="cs-card" style={{ width: 200, flexShrink: 0, padding: '8px 0', overflow: 'hidden' }}>
          {/* eslint-disable-next-line no-unused-vars -- Icon is rendered as <Icon/> below */}
          {GROUPS.map(({ id, label, icon: Icon }) => {
            const isActive = activeGroup === id
            // Count configured fields in this group
            const configured = schema
              ? Object.values(schema).filter(m => m.group === id && m.hasValue).length
              : 0
            const total = schema
              ? Object.values(schema).filter(m => m.group === id).length
              : 0
            return (
              <button
                key={id}
                onClick={() => setActiveGroup(id)}
                style={{
                  width: '100%', padding: '10px 16px', border: 'none', cursor: 'pointer',
                  background: isActive ? 'rgba(0,182,255,0.08)' : 'transparent',
                  borderLeft: isActive ? '2px solid #00B6FF' : '2px solid transparent',
                  color: isActive ? '#00B6FF' : 'var(--cs-text-sub)',
                  display: 'flex', alignItems: 'center', gap: 10,
                  textAlign: 'left', fontSize: 13, fontWeight: isActive ? 600 : 400,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <Icon size={15} />
                <span style={{ flex: 1 }}>{label}</span>
                {total > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: configured === total ? '#22c55e' : configured > 0 ? '#f59e0b' : 'var(--cs-text-muted)',
                  }}>
                    {configured}/{total}
                  </span>
                )}
              </button>
            )
          })}

          {/* Divider + logout */}
          <div style={{ margin: '8px 12px', borderTop: '1px solid var(--cs-border)' }} />
          <div style={{ padding: '6px 16px 10px', fontSize: 12, color: 'var(--cs-text-muted)' }}>
            Signed in as <strong style={{ color: 'var(--cs-text-sub)' }}>{username}</strong>
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%', padding: '8px 16px', border: 'none', cursor: 'pointer',
              background: 'transparent', color: '#f87171',
              display: 'flex', alignItems: 'center', gap: 10,
              textAlign: 'left', fontSize: 13,
            }}
          >
            Sign out
          </button>
        </div>

        {/* Main panel */}
        <div className="cs-card" style={{ flex: 1, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ActiveIcon size={18} color="#00B6FF" />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--cs-text)', margin: 0 }}>
                {activeGroupMeta?.label}
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--cs-text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                env
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00B6FF', display: 'inline-block' }} />
                override
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#637083', display: 'inline-block' }} />
                not set
              </span>
            </div>
          </div>

          {!schema ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3].map(i => (
                <div key={i} className="cs-skeleton" style={{ height: 60, borderRadius: 8 }} />
              ))}
            </div>
          ) : groupEntries.length === 0 ? (
            <p style={{ color: 'var(--cs-text-muted)', fontSize: 14 }}>No settings in this group.</p>
          ) : (
            <>
              {groupEntries.map(([k, meta]) => (
                <SettingField
                  key={k}
                  keyName={k}
                  meta={meta}
                  value={edits[k] ?? ''}
                  onChange={handleChange}
                />
              ))}

              {activeGroup === 'general' && (
                <div style={{
                  padding: '14px 16px', borderRadius: 8, marginTop: 4,
                  background: 'rgba(0,182,255,0.06)', border: '1px solid rgba(0,182,255,0.15)',
                  fontSize: 13, color: 'var(--cs-text-sub)', lineHeight: 1.6,
                }}>
                  <strong style={{ color: '#00B6FF' }}>Tip:</strong> Values set here override environment variables without requiring a server restart. Sensitive values are masked — leave unchanged to keep the current value.
                </div>
              )}

              {activeGroup === 'publishing' && (
                <div style={{
                  padding: '14px 16px', borderRadius: 8, marginTop: 4,
                  background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                  fontSize: 13, color: 'var(--cs-text-sub)', lineHeight: 1.6,
                }}>
                  <strong style={{ color: '#f59e0b' }}>Required for media upload:</strong> Set Backend Public URL to your Railway domain (e.g. <code style={{ fontFamily: 'monospace', fontSize: 12 }}>https://your-app.up.railway.app</code>) so Metricool can fetch your video and image files.
                </div>
              )}

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSave(activeGroup)}
                  disabled={saving}
                  style={{
                    padding: '10px 24px', borderRadius: 8,
                    background: saving ? 'rgba(0,182,255,0.4)' : '#00B6FF',
                    border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Save size={15} />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
