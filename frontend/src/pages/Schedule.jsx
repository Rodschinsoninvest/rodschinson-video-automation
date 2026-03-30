import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_COLORS = {
  linkedin:  '#0077B5',
  instagram: '#E1306C',
  tiktok:    '#69C9D0',
  youtube:   '#FF4444',
  facebook:  '#1877F2',
  pending:   '#C8A96E',
}

const PLATFORM_LABELS = {
  linkedin: 'LinkedIn', instagram: 'Instagram', tiktok: 'TikTok',
  youtube: 'YouTube', facebook: 'Facebook',
}

const TIME_SLOTS = [
  { id: 'morning',   label: 'Morning',   sub: '07:00 – 11:00', default: '09:00' },
  { id: 'noon',      label: 'Midday',    sub: '11:00 – 14:00', default: '12:00' },
  { id: 'afternoon', label: 'Afternoon', sub: '14:00 – 18:00', default: '15:00' },
  { id: 'evening',   label: 'Evening',   sub: '18:00 – 22:00', default: '19:00' },
]

const PUBLISH_STATUS = {
  local:     { label: 'Local only',        color: '#C8A96E', bg: 'rgba(200,169,110,0.12)', dot: '#C8A96E' },
  sent:      { label: 'Sent to Metricool', color: '#00B6FF', bg: 'rgba(0,182,255,0.1)',   dot: '#00B6FF' },
  published: { label: 'Published',         color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   dot: '#22c55e' },
  failed:    { label: 'Failed',            color: '#f87171', bg: 'rgba(239,68,68,0.1)',   dot: '#f87171' },
}

const TYPE_ICONS = {
  video: '🎬', carousel: '🖼️', image_post: '📸',
  text_only: '✍️', story: '⚡', reel: '🎞️',
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfWeek(date) {
  const d = new Date(date)
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff); d.setHours(0,0,0,0)
  return d
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function isoDate(date)     { return date.toISOString().slice(0, 10) }
function fmtDay(date)      { return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) }
function fmtMonth(date)    { return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }
function isToday(date)     { return isoDate(date) === isoDate(new Date()) }

// ─── Mock data ────────────────────────────────────────────────────────────────

function buildMock(weekStart) {
  const seeds = [
    { day: 0, slot: 'morning',   time: '09:00', platform: 'linkedin',  title: 'Cap Rate expliqué — FR', type: 'video',      ps: 'sent'  },
    { day: 0, slot: 'evening',   time: '19:30', platform: 'instagram', title: 'Dubai CRE 2025',          type: 'reel',       ps: 'local' },
    { day: 1, slot: 'noon',      time: '12:00', platform: 'youtube',   title: '20 ans de M&A',           type: 'video',      ps: 'published' },
    { day: 2, slot: 'morning',   time: '09:00', platform: 'linkedin',  title: 'Due Diligence 10 points', type: 'carousel',   ps: 'local' },
    { day: 2, slot: 'afternoon', time: '15:00', platform: 'instagram', title: 'IRR en 60s',              type: 'reel',       ps: 'local' },
    { day: 3, slot: 'noon',      time: '13:00', platform: 'tiktok',    title: 'Comment valoriser PME',   type: 'reel',       ps: 'failed' },
    { day: 4, slot: 'morning',   time: '08:30', platform: 'linkedin',  title: 'Q1 Real Estate +12%',     type: 'image_post', ps: 'local' },
    { day: 5, slot: 'noon',      time: '12:00', platform: 'instagram', title: 'Story weekend',           type: 'story',      ps: 'local' },
  ]
  return seeds.map((s, i) => ({
    id: `mock-${i}`, date: isoDate(addDays(weekStart, s.day)), slot: s.slot,
    scheduled_time: s.time, platform: s.platform, title: s.title,
    content_type: s.type, status: 'Scheduled', publish_status: s.ps,
    job_id: `mock-job-${i}`,
  }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavBtn({ onClick, children }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
        background: hov ? 'var(--cs-hover)' : 'transparent',
        color: 'var(--cs-text-sub)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s' }}
    >{children}</button>
  )
}

function PublishDot({ publish_status }) {
  const ps = PUBLISH_STATUS[publish_status] || PUBLISH_STATUS.local
  return (
    <span title={ps.label} style={{
      width: 7, height: 7, borderRadius: '50%', background: ps.dot,
      flexShrink: 0, display: 'inline-block',
      boxShadow: publish_status === 'published' ? `0 0 4px ${ps.dot}` : 'none',
    }} />
  )
}

function PostPill({ entry, onClick }) {
  const [hov, setHov] = useState(false)
  const color = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.pending
  const icon  = TYPE_ICONS[entry.content_type] || '📄'
  return (
    <div onClick={() => onClick(entry)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: '4px 7px', borderRadius: 5, cursor: 'pointer', marginBottom: 4,
        background: hov ? `${color}22` : `${color}14`,
        border: `1px solid ${color}40`, transition: 'background 0.12s' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 9 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {PLATFORM_LABELS[entry.platform] || entry.platform}
        </span>
        {entry.scheduled_time && (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {entry.scheduled_time}
          </span>
        )}
        <PublishDot publish_status={entry.publish_status} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--cs-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.title}
      </div>
    </div>
  )
}

function EmptySlot({ onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ height: 28, borderRadius: 5, cursor: 'pointer',
        border: `1px dashed ${hov ? 'rgba(0,182,255,0.4)' : 'var(--cs-border)'}`,
        background: hov ? 'rgba(0,182,255,0.04)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
    >
      {hov && <span style={{ color: 'rgba(0,182,255,0.6)', fontSize: 14, lineHeight: 1 }}>+</span>}
    </div>
  )
}

function PostDetailModal({ entry, onClose, onRemove, onPublished }) {
  const color = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.pending
  const icon  = TYPE_ICONS[entry.content_type] || '📄'
  const ps    = PUBLISH_STATUS[entry.publish_status] || PUBLISH_STATUS.local
  const [publishing, setPublishing] = useState(false)
  const [pubError, setPubError]     = useState('')
  const [localPs, setLocalPs]       = useState(entry.publish_status || 'local')

  const handlePublish = async () => {
    if (entry.id?.startsWith('mock-')) {
      // Demo mode — just toggle to sent
      setLocalPs('sent')
      onPublished && onPublished(entry.id, 'sent')
      return
    }
    setPublishing(true); setPubError('')
    try {
      const res = await fetch(`/api/schedule/${entry.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setPubError(err.detail || `Error ${res.status}`)
        setLocalPs('failed')
        onPublished && onPublished(entry.id, 'failed')
      } else {
        setLocalPs('sent')
        onPublished && onPublished(entry.id, 'sent')
      }
    } catch {
      setPubError('Network error')
      setLocalPs('failed')
    } finally { setPublishing(false) }
  }

  const currentPs = PUBLISH_STATUS[localPs] || PUBLISH_STATUS.local

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 12, width: 400, maxWidth: '90vw', padding: 24, animation: 'fadein 0.15s ease' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0, background: `${color}20`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color, fontSize: 12, fontWeight: 700 }}>{PLATFORM_LABELS[entry.platform] || entry.platform}</div>
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 1 }}>
              {entry.date}{entry.scheduled_time ? ` · ${entry.scheduled_time}` : ''}
            </div>
          </div>
          {/* Publish status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: currentPs.bg, border: `1px solid ${currentPs.color}40` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: currentPs.dot, display: 'inline-block',
              boxShadow: localPs === 'published' ? `0 0 5px ${currentPs.dot}` : 'none' }} />
            <span style={{ color: currentPs.color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{currentPs.label}</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ color: 'var(--cs-text)', fontSize: 14, fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>{entry.title}</div>

        {/* Meta chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {['content_type'].map(k => (
            <span key={k} style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--cs-hover)', color: 'var(--cs-text-sub)', fontSize: 11 }}>
              {entry[k]?.replace(/_/g,' ')}
            </span>
          ))}
          {entry.scheduled_time && (
            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--cs-hover)', color: 'var(--cs-text-sub)', fontSize: 11 }}>
              🕐 {entry.scheduled_time}
            </span>
          )}
        </div>

        {/* Publish to Metricool */}
        {localPs !== 'published' && (
          <div style={{ background: 'var(--cs-surface2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Metricool
            </div>
            {pubError && (
              <div style={{ color: '#f87171', fontSize: 11, marginBottom: 8, padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
                {pubError}
              </div>
            )}
            <button onClick={handlePublish} disabled={publishing || localPs === 'sent'}
              style={{ width: '100%', padding: '8px 0', borderRadius: 6, border: 'none', cursor: (publishing || localPs === 'sent') ? 'not-allowed' : 'pointer',
                background: localPs === 'sent' ? 'rgba(0,182,255,0.1)' : 'linear-gradient(135deg,#0066cc,#00B6FF)',
                color: localPs === 'sent' ? '#00B6FF' : '#fff',
                fontSize: 12, fontWeight: 600, transition: 'opacity 0.15s',
                opacity: publishing ? 0.6 : 1 }}>
              {publishing ? '⏳ Sending…' : localPs === 'sent' ? '✓ Sent to Metricool' : '→ Send to Metricool'}
            </button>
            {localPs !== 'sent' && entry.scheduled_time && (
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, textAlign: 'center', marginTop: 6 }}>
                Will schedule for {entry.date} at {entry.scheduled_time}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {onRemove && (
            <button onClick={() => { onRemove(entry); onClose() }} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
              Remove
            </button>
          )}
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleModal({ date, slot, library, onClose, onSchedule }) {
  const slotInfo = TIME_SLOTS.find(s => s.id === slot) || TIME_SLOTS[0]
  const [search, setSearch]   = useState('')
  const [platform, setPlatform] = useState('linkedin')
  const [selected, setSelected] = useState(null)
  const [time, setTime]       = useState(slotInfo.default)

  const available = library.filter(item =>
    ['Approved','Ready','Draft'].includes(item.status) &&
    item.title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 12, width: 440, maxWidth: '92vw', overflow: 'hidden', animation: 'fadein 0.15s ease' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--cs-border)' }}>
          <div style={{ color: 'var(--cs-text)', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Schedule content</div>
          <div style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>{date} · {slotInfo.label}</div>
        </div>
        <div style={{ padding: '14px 20px 20px' }}>

          {/* Platform */}
          <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Platform</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {Object.entries(PLATFORM_LABELS).map(([id, label]) => {
              const c = PLATFORM_COLORS[id]; const active = platform === id
              return (
                <div key={id} onClick={() => setPlatform(id)} style={{
                  padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                  background: active ? `${c}20` : 'var(--cs-hover)',
                  border: `1px solid ${active ? c+'60' : 'var(--cs-border)'}`,
                  color: active ? c : 'var(--cs-text-sub)',
                  fontSize: 11, fontWeight: active ? 600 : 400, transition: 'all 0.12s',
                }}>{label}</div>
              )
            })}
          </div>

          {/* Time picker */}
          <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Publication time</div>
          <input
            type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 6, padding: '7px 10px', color: 'var(--cs-text)', fontSize: 14, fontWeight: 600, outline: 'none', marginBottom: 14, fontFamily: 'inherit', cursor: 'pointer' }}
          />

          {/* Search */}
          <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Select content</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search library…"
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 6, padding: '7px 10px', color: 'var(--cs-text)', fontSize: 12, outline: 'none', marginBottom: 10, fontFamily: 'inherit' }} />
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {available.length === 0 ? (
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No content available — generate first</div>
            ) : available.map(item => (
              <div key={item.job_id} onClick={() => setSelected(item)} style={{
                padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                background: selected?.job_id === item.job_id ? 'rgba(0,182,255,0.1)' : 'var(--cs-hover)',
                border: `1px solid ${selected?.job_id === item.job_id ? 'rgba(0,182,255,0.3)' : 'var(--cs-border)'}`,
                transition: 'all 0.1s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{TYPE_ICONS[item.content_type] || '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                    <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, marginTop: 1 }}>{item.language} · {item.format} · {item.status}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <button disabled={!selected} onClick={() => selected && (onSchedule(date, slot, platform, selected, time), onClose())} style={{
              padding: '7px 16px', borderRadius: 6, border: 'none', cursor: selected ? 'pointer' : 'not-allowed',
              background: selected ? 'linear-gradient(135deg,#0066cc,#00B6FF)' : 'var(--cs-hover)',
              color: selected ? '#fff' : 'var(--cs-text-muted)',
              fontSize: 12, fontWeight: 600, transition: 'all 0.12s',
            }}>Schedule {time && `· ${time}`} →</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ entries, onEntry }) {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const t1 = a.scheduled_time || '00:00', t2 = b.scheduled_time || '00:00'
    return t1.localeCompare(t2)
  })

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--cs-text-muted)', fontSize: 14 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
        No posts scheduled this week
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map(entry => {
        const color = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.pending
        const icon  = TYPE_ICONS[entry.content_type] || '📄'
        const ps    = PUBLISH_STATUS[entry.publish_status] || PUBLISH_STATUS.local
        return (
          <div key={entry.id} onClick={() => onEntry(entry)} style={{
            background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
            borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'box-shadow 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ width: 52, textAlign: 'center', flexShrink: 0 }}>
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600 }}>{entry.date.slice(5)}</div>
              <div style={{ color: 'var(--cs-text-sub)', fontSize: 12, fontWeight: 600, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                {entry.scheduled_time || '—'}
              </div>
            </div>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--cs-text)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</div>
              <div style={{ color, fontSize: 11, marginTop: 2 }}>{PLATFORM_LABELS[entry.platform] || entry.platform}</div>
            </div>
            {/* Publish status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: ps.bg, border: `1px solid ${ps.color}30`, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ps.dot, display: 'inline-block',
                boxShadow: entry.publish_status === 'published' ? `0 0 4px ${ps.dot}` : 'none' }} />
              <span style={{ color: ps.color, fontSize: 11, fontWeight: 600 }}>{ps.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Schedule() {
  useTheme()
  const [viewMode, setViewMode]         = useState('calendar')
  const [weekStart, setWeekStart]       = useState(() => startOfWeek(new Date()))
  const [entries, setEntries]           = useState([])
  const [library, setLibrary]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [apiError, setApiError]         = useState(false)
  const [detailEntry, setDetailEntry]   = useState(null)
  const [scheduleSlot, setScheduleSlot] = useState(null)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const loadWeek = useCallback(async (ws) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedule/week?start=${isoDate(ws)}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setEntries(data.entries || []); setApiError(false)
    } catch {
      setEntries(buildMock(ws)); setApiError(true)
    } finally { setLoading(false) }
  }, [])

  const loadLibrary = useCallback(async () => {
    try {
      const res  = await fetch('/api/library')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setLibrary(data.items || [])
    } catch { setLibrary([]) }
  }, [])

  useEffect(() => { loadWeek(weekStart) }, [weekStart, loadWeek])
  useEffect(() => { loadLibrary() }, [loadLibrary])

  const prevWeek = () => setWeekStart(d => addDays(d, -7))
  const nextWeek = () => setWeekStart(d => addDays(d, 7))
  const goToday  = () => setWeekStart(startOfWeek(new Date()))

  function entriesFor(date, slot) {
    const d = isoDate(date)
    return entries.filter(e => e.date === d && e.slot === slot)
      .sort((a,b) => (a.scheduled_time||'00:00').localeCompare(b.scheduled_time||'00:00'))
  }

  async function handleSchedule(date, slot, platform, item, time) {
    const newEntry = {
      id: `local-${Date.now()}`, date, slot, scheduled_time: time,
      platform, title: item.title, content_type: item.content_type,
      status: 'Scheduled', publish_status: 'local', job_id: item.job_id,
    }
    setEntries(prev => [...prev, newEntry])
    try {
      await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: item.job_id, date, slot, platform, scheduled_time: time }),
      })
    } catch { /* optimistic */ }
  }

  async function handleRemove(entry) {
    setEntries(prev => prev.filter(e => e.id !== entry.id))
    try { await fetch(`/api/schedule/${entry.id}`, { method: 'DELETE' }) } catch { }
  }

  function handlePublished(entryId, newStatus) {
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, publish_status: newStatus } : e))
    if (detailEntry?.id === entryId) setDetailEntry(prev => ({ ...prev, publish_status: newStatus }))
  }

  // Summary counts
  const totalSent      = entries.filter(e => e.publish_status === 'sent').length
  const totalPublished = entries.filter(e => e.publish_status === 'published').length
  const totalLocal     = entries.filter(e => e.publish_status === 'local').length
  const totalFailed    = entries.filter(e => e.publish_status === 'failed').length
  const platformCounts = entries.reduce((acc, e) => { acc[e.platform] = (acc[e.platform]||0)+1; return acc }, {})

  return (
    <div style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: 'var(--cs-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Schedule</h1>
          <p style={{ color: 'var(--cs-text-muted)', fontSize: 13, margin: 0 }}>{fmtMonth(weekStart)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 7, overflow: 'hidden' }}>
            {[['calendar','📅 Calendar'],['list','☰ List']].map(([mode, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12,
                background: viewMode === mode ? 'rgba(0,182,255,0.1)' : 'transparent',
                color: viewMode === mode ? '#00B6FF' : 'var(--cs-text-sub)',
                fontWeight: viewMode === mode ? 600 : 400,
                borderRight: mode === 'calendar' ? '1px solid var(--cs-border)' : 'none',
                transition: 'all 0.12s',
              }}>{label}</button>
            ))}
          </div>
          <NavBtn onClick={prevWeek}>‹</NavBtn>
          <button onClick={goToday} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer' }}>Today</button>
          <NavBtn onClick={nextWeek}>›</NavBtn>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {[
          { label: 'Local', count: totalLocal,     ...PUBLISH_STATUS.local     },
          { label: 'Sent',  count: totalSent,      ...PUBLISH_STATUS.sent      },
          { label: 'Live',  count: totalPublished, ...PUBLISH_STATUS.published },
          { label: 'Failed',count: totalFailed,    ...PUBLISH_STATUS.failed    },
        ].map(s => s.count > 0 && (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: s.bg, border: `1px solid ${s.color}30` }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
            <span style={{ color: s.color, fontSize: 11, fontWeight: 600 }}>{s.label} · {s.count}</span>
          </div>
        ))}
        {/* Platform legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(PLATFORM_LABELS).map(([id, label]) => {
            const count = platformCounts[id] || 0
            if (!count) return null
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: PLATFORM_COLORS[id] }} />
                <span style={{ fontSize: 11, color: 'var(--cs-text-sub)' }}>{label} ({count})</span>
              </div>
            )
          })}
          {apiError && <span style={{ color: 'rgba(200,169,110,0.6)', fontSize: 11 }}>API offline — demo data</span>}
        </div>
      </div>

      {/* Calendar view */}
      {viewMode === 'calendar' && (
        <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 10, overflow: 'hidden', overflowX: 'auto' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '76px repeat(7, minmax(110px, 1fr))', borderBottom: '1px solid var(--cs-border)', minWidth: 750 }}>
            <div style={{ padding: '10px 8px' }} />
            {weekDays.map((d, i) => {
              const today = isToday(d)
              return (
                <div key={i} style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid var(--cs-border-sub)' }}>
                  <div style={{ fontSize: 11, fontWeight: today ? 700 : 500, color: today ? '#00B6FF' : 'var(--cs-text-sub)' }}>
                    {fmtDay(d).split(' ')[0]}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: today ? '#00B6FF' : 'var(--cs-text)', marginTop: 2 }}>
                    {fmtDay(d).split(' ')[1]}
                  </div>
                  {today && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#00B6FF', margin: '3px auto 0' }} />}
                </div>
              )
            })}
          </div>
          {/* Time rows */}
          {TIME_SLOTS.map((slot, si) => (
            <div key={slot.id} style={{ display: 'grid', gridTemplateColumns: '76px repeat(7, minmax(110px, 1fr))', borderBottom: si < TIME_SLOTS.length - 1 ? '1px solid var(--cs-border-sub)' : 'none', minHeight: 90, minWidth: 750 }}>
              <div style={{ padding: '10px 8px', borderRight: '1px solid var(--cs-border-sub)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600 }}>{slot.label}</div>
                <div style={{ color: 'var(--cs-text-muted)', fontSize: 9, marginTop: 2 }}>{slot.sub}</div>
              </div>
              {weekDays.map((day, di) => {
                const dayEntries = entriesFor(day, slot.id)
                const today = isToday(day)
                return (
                  <div key={di} style={{ padding: '6px 5px', borderLeft: '1px solid var(--cs-border-sub)', background: today ? 'rgba(0,182,255,0.02)' : 'transparent', minWidth: 0 }}>
                    {loading ? (
                      <div style={{ height: 24, borderRadius: 4, background: 'var(--cs-hover)', animation: 'pulse 1.5s ease infinite' }} />
                    ) : (
                      <>
                        {dayEntries.map(entry => <PostPill key={entry.id} entry={entry} onClick={setDetailEntry} />)}
                        <EmptySlot onClick={() => setScheduleSlot({ date: isoDate(day), slot: slot.id })} />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <ListView entries={entries} onEntry={setDetailEntry} />
      )}

      {/* Footer count */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingRight: 4 }}>
        <span style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>
          {entries.length} post{entries.length !== 1 ? 's' : ''} this week
        </span>
      </div>

      {/* Modals */}
      {detailEntry && (
        <PostDetailModal
          entry={detailEntry}
          onClose={() => setDetailEntry(null)}
          onRemove={handleRemove}
          onPublished={handlePublished}
        />
      )}
      {scheduleSlot && (
        <ScheduleModal
          date={scheduleSlot.date} slot={scheduleSlot.slot}
          library={library} onClose={() => setScheduleSlot(null)}
          onSchedule={handleSchedule}
        />
      )}
    </div>
  )
}
