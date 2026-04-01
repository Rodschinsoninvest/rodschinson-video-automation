import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useGeneration } from '../contexts/GenerationContext'
import { useToast } from '../contexts/ToastContext'
import { CarouselSlidePreview } from '../components/CarouselPreview'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META = {
  Draft:     { color: '#b45309', bg: 'rgba(180,83,9,0.08)',    label: 'Draft'     },
  Ready:     { color: '#16a34a', bg: 'rgba(22,163,74,0.08)',   label: 'Ready'     },
  Approved:  { color: '#0284c7', bg: 'rgba(2,132,199,0.08)',   label: 'Approved'  },
  Scheduled: { color: '#6d28d9', bg: 'rgba(109,40,217,0.08)',  label: 'Scheduled' },
  Published: { color: 'rgba(0,0,0,0.35)', bg: 'rgba(0,0,0,0.05)', label: 'Published' },
}

const STATUS_FLOW = ['Draft', 'Ready', 'Approved', 'Scheduled', 'Published']

const TYPE_META = {
  video:      { icon: '🎬', label: 'Video'      },
  carousel:   { icon: '🖼️', label: 'Carousel'   },
  image_post: { icon: '📸', label: 'Image Post' },
  text_only:  { icon: '✍️', label: 'Text'       },
  story:      { icon: '⚡', label: 'Story'      },
  reel:       { icon: '🎞️', label: 'Reel'       },
}

const TEMPLATE_GRADIENTS = {
  rodschinson_premium: 'linear-gradient(135deg,#08316F,#0a3d8a)',
  news_reel:           'linear-gradient(135deg,#1a0505,#2d0f0f)',
  tech_data:           'linear-gradient(135deg,#031520,#061e2e)',
  corporate_minimal:   'linear-gradient(135deg,#0a0a0a,#181818)',
  social_story:        'linear-gradient(135deg,#1a0a2e,#2d1454)',
  motion_type:         'linear-gradient(135deg,#0a1a0a,#0f2a0f)',
}

const FILTERS = [
  { id: 'all',       label: 'All'       },
  { id: 'video',     label: 'Video'     },
  { id: 'carousel',  label: 'Carousel'  },
  { id: 'image_post',label: 'Post'      },
  { id: 'reel',      label: 'Reel'      },
  { id: 'pending',   label: 'Pending'   },
  { id: 'published', label: 'Published' },
]

const MOCK = [
  {
    job_id: 'mock-1', title: 'Le Cap Rate expliqué en 5 minutes',
    brand: 'rodschinson', language: 'FR', content_type: 'video', format: '16:9',
    template: 'rodschinson_premium', platforms: ['linkedin', 'youtube'],
    status: 'Published', created_at: '2026-03-22T10:00:00Z',
  },
  {
    job_id: 'mock-2', title: 'Dubai CRE Market 2025 — Why Now',
    brand: 'rodschinson', language: 'EN', content_type: 'reel', format: '9:16',
    template: 'tech_data', platforms: ['instagram', 'tiktok'],
    status: 'Scheduled', created_at: '2026-03-24T14:30:00Z',
  },
  {
    job_id: "mock-3", title: "Ce que 20 ans de M&A m'ont appris",
    brand: 'rachid', language: 'FR', content_type: 'video', format: '16:9',
    template: 'rodschinson_premium', platforms: ['linkedin'],
    status: 'Approved', created_at: '2026-03-25T09:00:00Z',
  },
  {
    job_id: 'mock-4', title: 'Due Diligence CRE : les 10 points clés',
    brand: 'rodschinson', language: 'FR', content_type: 'carousel', format: '1:1',
    template: 'corporate_minimal', platforms: ['linkedin'],
    status: 'Ready', created_at: '2026-03-26T11:15:00Z',
  },
  {
    job_id: 'mock-5', title: 'IRR — Comment valoriser un actif en 60s',
    brand: 'rachid', language: 'FR', content_type: 'reel', format: '9:16',
    template: 'news_reel', platforms: ['instagram', 'tiktok'],
    status: 'Draft', created_at: '2026-03-27T16:00:00Z',
  },
  {
    job_id: 'mock-6', title: 'Real estate investment up 12% in Q1',
    brand: 'rodschinson', language: 'EN', content_type: 'image_post', format: '4:5',
    template: 'tech_data', platforms: ['instagram'],
    status: 'Draft', created_at: '2026-03-28T08:45:00Z',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function initials(brand) { return brand === 'rachid' ? 'RC' : 'RI' }
function brandColor(brand) { return brand === 'rachid' ? '#00B6FF' : '#C8A96E' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.Draft
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 20,
      background: m.bg, fontSize: 11, fontWeight: 600, color: m.color,
      border: `1px solid ${m.color}40`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.color }} />
      {m.label}
    </span>
  )
}

function TypeBadge({ type }) {
  const m = TYPE_META[type] || { icon: '📄', label: type }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', borderRadius: 4,
      background: 'rgba(0,0,0,0.06)', fontSize: 11, color: 'rgba(0,0,0,0.5)',
    }}>
      <span style={{ fontSize: 10 }}>{m.icon}</span>{m.label}
    </span>
  )
}

const PLATFORM_ABBR = { linkedin: 'LI', youtube: 'YT', instagram: 'IG', tiktok: 'TT', facebook: 'FB', twitter: 'X' }
const PLATFORM_CLR  = { linkedin: '#0077B5', youtube: '#FF0000', instagram: '#E1306C', tiktok: '#00b4b4', facebook: '#1877F2', twitter: '#1DA1F2' }

function PlatformBadges({ platforms = [] }) {
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {platforms.slice(0, 4).map(p => (
        <span key={p} title={p} style={{
          padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
          background: `${PLATFORM_CLR[p] || '#999'}18`,
          color: PLATFORM_CLR[p] || '#999',
          border: `1px solid ${PLATFORM_CLR[p] || '#999'}40`,
          letterSpacing: '0.03em',
        }}>{PLATFORM_ABBR[p] || p.slice(0,2).toUpperCase()}</span>
      ))}
    </div>
  )
}

function ActionBtn({ onClick, label, color = 'rgba(0,0,0,0.5)' }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '5px 10px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${hover ? color : 'rgba(0,0,0,0.1)'}`,
        background: hover ? `${color}12` : 'transparent',
        color: hover ? color : 'rgba(0,0,0,0.4)',
        fontSize: 11, fontWeight: 500, transition: 'all 0.12s',
      }}
    >{label}</button>
  )
}

// ─── Content-type aware preview modal ────────────────────────────────────────

const VIDEO_TYPES  = new Set(['video','reel','story'])
const IMAGE_TYPES  = new Set(['image_post','carousel'])
const TEXT_TYPES   = new Set(['text_only'])

function StatusStepper({ status, onChangeStatus }) {
  const [hovered, setHovered] = useState(null)
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
      {STATUS_FLOW.map((s, i) => {
        const idx = STATUS_FLOW.indexOf(status)
        const done = i <= idx; const current = i === idx
        const isHov = hovered === s
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: onChangeStatus ? 'pointer' : 'default' }}
              onMouseEnter={() => onChangeStatus && setHovered(s)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onChangeStatus && s !== status && onChangeStatus(s)}
              title={onChangeStatus && s !== status ? `Set to ${s}` : s}
            >
              <div style={{
                width: current ? 10 : 8, height: current ? 10 : 8, borderRadius: '50%',
                background: isHov ? '#00B6FF' : current ? '#00B6FF' : done ? 'rgba(0,182,255,0.4)' : 'var(--cs-border)',
                border: current ? '2px solid #00B6FF' : isHov ? '2px solid #00B6FF' : 'none',
                boxShadow: current ? '0 0 6px #00B6FF80' : 'none',
                transition: 'all 0.15s',
              }} />
              <span style={{ fontSize: 9, color: done ? 'var(--cs-text-sub)' : 'var(--cs-text-muted)', whiteSpace: 'nowrap', fontWeight: current ? 700 : 400 }}>{s}</span>
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done && i < idx ? 'rgba(0,182,255,0.3)' : 'var(--cs-border)', marginBottom: 16 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ModalHeader({ item, onClose }) {
  const type = TYPE_META[item.content_type] || { icon: '📄', label: item.content_type }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
        <span style={{ fontSize: 24, lineHeight: 1.2 }}>{type.icon}</span>
        <div>
          <h2 style={{ color: 'var(--cs-text)', fontSize: 15, fontWeight: 700, margin: '0 0 4px', lineHeight: 1.3 }}>{item.title}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <TypeBadge type={item.content_type} />
            {item.language && <span style={{ padding: '2px 7px', borderRadius: 4, background: 'var(--cs-hover)', fontSize: 11, color: 'var(--cs-text-sub)' }}>{item.language}</span>}
            {item.format && item.format !== 'text' && <span style={{ padding: '2px 7px', borderRadius: 4, background: 'var(--cs-hover)', fontSize: 11, color: 'var(--cs-text-sub)' }}>{item.format}</span>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,#08316F,${brandColor(item.brand)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>{initials(item.brand)}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text-muted)', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>×</button>
      </div>
    </div>
  )
}

const SLOTS = ['morning', 'noon', 'afternoon', 'evening']
const PLATFORM_COLORS = { linkedin: '#0077B5', youtube: '#FF0000', instagram: '#E1306C', tiktok: '#00b4b4', facebook: '#1877F2', twitter: '#1DA1F2' }

function ScheduleInline({ item, onScheduled, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate]       = useState(today)
  const [slot, setSlot]       = useState('morning')
  const [platform, setPlatform] = useState(item.platforms?.[0] || 'linkedin')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)
  const platforms = item.platforms?.length ? item.platforms : ['linkedin']

  const submit = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: item.job_id, date, slot, platform }),
      })
      if (!res.ok) throw new Error(await res.text())
      onScheduled()
    } catch (e) {
      setErr('Schedule failed — API offline')
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'var(--cs-surface2)', border: '1px solid rgba(109,40,217,0.2)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Schedule Post</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} style={{
          padding: '6px 10px', borderRadius: 6, border: '1px solid var(--cs-border)',
          background: 'var(--cs-surface)', color: 'var(--cs-text)', fontSize: 12, flex: 1, minWidth: 130,
        }} />
        <select value={slot} onChange={e => setSlot(e.target.value)} style={{
          padding: '6px 10px', borderRadius: 6, border: '1px solid var(--cs-border)',
          background: 'var(--cs-surface)', color: 'var(--cs-text)', fontSize: 12, flex: 1,
        }}>
          {SLOTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {platforms.map(p => (
          <button key={p} onClick={() => setPlatform(p)} style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600,
            border: `1px solid ${platform === p ? (PLATFORM_COLORS[p] || '#999') : 'var(--cs-border)'}`,
            background: platform === p ? `${PLATFORM_COLORS[p] || '#999'}18` : 'transparent',
            color: platform === p ? (PLATFORM_COLORS[p] || '#999') : 'var(--cs-text-muted)',
          }}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
        ))}
      </div>
      {err && <div style={{ color: '#f87171', fontSize: 11, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={submit} disabled={saving} style={{
          flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
          background: 'linear-gradient(135deg,#6d28d9,#8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 600,
        }}>{saving ? 'Scheduling…' : 'Confirm Schedule'}</button>
        <button onClick={onClose} style={{
          padding: '7px 10px', borderRadius: 6, border: '1px solid var(--cs-border)',
          background: 'transparent', color: 'var(--cs-text-muted)', fontSize: 12, cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </div>
  )
}

function ModalActions({ item, onStatusChange, onRegenerate, onDelete, onClose }) {
  const currentIdx = STATUS_FLOW.indexOf(item.status)
  const nextStatus = STATUS_FLOW[currentIdx + 1]
  const prevStatus = STATUS_FLOW[currentIdx - 1]
  const [showSchedule, setShowSchedule] = useState(false)

  return (
    <div>
      {showSchedule && (
        <ScheduleInline
          item={item}
          onScheduled={() => { onStatusChange(item.job_id, 'Scheduled'); setShowSchedule(false); onClose() }}
          onClose={() => setShowSchedule(false)}
        />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>{fmtDate(item.created_at)}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onRegenerate} style={{ padding: '7px 14px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12 }}>↻ Regenerate</button>
          {item.output_file && (
            <button onClick={() => window.open(`/api/download/${item.job_id}`, '_blank')} style={{ padding: '7px 14px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(22,163,74,0.3)', background: 'rgba(22,163,74,0.06)', color: '#16a34a', fontSize: 12, fontWeight: 600 }}>⬇ Download</button>
          )}
          {prevStatus && (
            <button onClick={() => { onStatusChange(item.job_id, prevStatus); onClose() }} style={{
              padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--cs-border)', background: 'transparent',
              color: 'var(--cs-text-muted)', fontSize: 12,
            }}>← {prevStatus}</button>
          )}
          <button onClick={onDelete} style={{ padding: '7px 14px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 12 }}>🗑 Delete</button>
          {!showSchedule && item.status !== 'Scheduled' && item.status !== 'Published' && (
            <button onClick={() => setShowSchedule(true)} style={{
              padding: '7px 14px', borderRadius: 6, cursor: 'pointer', border: 'none',
              background: 'rgba(109,40,217,0.1)', color: '#6d28d9', fontSize: 12, fontWeight: 600,
            }}>📅 Schedule</button>
          )}
          {nextStatus && nextStatus !== 'Scheduled' && (
            <button onClick={() => { onStatusChange(item.job_id, nextStatus); onClose() }} style={{
              padding: '7px 14px', borderRadius: 6, cursor: 'pointer', border: 'none',
              background: STATUS_META[nextStatus]?.bg || 'var(--cs-hover)',
              color: STATUS_META[nextStatus]?.color, fontSize: 12, fontWeight: 600,
            }}>→ {nextStatus}</button>
          )}
          {item.status === 'Scheduled' && (
            <button onClick={async () => {
              try {
                const res = await fetch(`/api/publish/${item.job_id}`, { method: 'POST' })
                if (res.ok) { onStatusChange(item.job_id, 'Published'); onClose() }
                else alert('Publish failed — check METRICOOL_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID in .env')
              } catch { alert('Publish endpoint unreachable') }
            }} style={{ padding: '7px 14px', borderRadius: 6, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#08316F,#00B6FF)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
              Publish via Metricool
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


// ─── Platform preview chrome ─────────────────────────────────────────────────

const PLATFORM_META = {
  linkedin:  { name: 'LinkedIn',  color: '#0077B5', bg: '#F3F2EF', dark: false, icon: '💼' },
  youtube:   { name: 'YouTube',   color: '#FF0000', bg: '#0F0F0F', dark: true,  icon: '▶' },
  tiktok:    { name: 'TikTok',    color: '#ff2d55', bg: '#000000', dark: true,  icon: '♪' },
  instagram: { name: 'Instagram', color: '#E1306C', bg: '#FAFAFA', dark: false, icon: '📷' },
  facebook:  { name: 'Facebook',  color: '#1877F2', bg: '#F0F2F5', dark: false, icon: 'f' },
}

function ContentThumbnail({ item, slides, height = 220, borderRadius = 0 }) {
  const gradient = TEMPLATE_GRADIENTS[item.template] || 'linear-gradient(135deg,#08316F,#0d1a30)'
  const type = TYPE_META[item.content_type] || { icon: '📄' }

  if (item.content_type === 'carousel' && slides?.length) {
    const firstPng = slides[0]?.png_url
    if (firstPng) {
      return <img src={firstPng} alt="" style={{ width: '100%', height, objectFit: 'cover', display: 'block', borderRadius }} />
    }
    // Render first slide data as a mini card
    const s = slides[0]
    return (
      <div style={{ width: '100%', height, background: 'linear-gradient(135deg,#08316F,#00B6FF)', borderRadius, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center', boxSizing: 'border-box' }}>
        {s?.tag && <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{s.tag}</div>}
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{(s?.headline || item.title || '').replace(/\\n/g, ' ')}</div>
        {s?.subheadline && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 6 }}>{s.subheadline}</div>}
      </div>
    )
  }
  if (['video','reel','story'].includes(item.content_type) && item.output_file) {
    return <video src={`/api/video/${item.job_id}`} style={{ width: '100%', height, objectFit: 'cover', display: 'block', borderRadius }} />
  }
  if (item.content_type === 'image_post' && item.output_file) {
    return <img src={`/api/image/${item.job_id}`} alt="" style={{ width: '100%', height, objectFit: 'cover', display: 'block', borderRadius }} />
  }
  return (
    <div style={{ width: '100%', height, background: gradient, borderRadius, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 36 }}>{type.icon}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 6 }}>{item.format}</div>
    </div>
  )
}

function LinkedInPreview({ item, slides }) {
  const isPortrait  = item.format === '9:16'
  const postText    = item.output_text?.slice(0, 220) || item.title
  const isCarousel  = item.content_type === 'carousel'
  const slideCount  = slides?.length || 0
  return (
    <div style={{ background: '#F3F2EF', padding: '12px 0', minHeight: 300 }}>
      <div style={{ maxWidth: 520, margin: '0 auto', background: '#fff', borderRadius: 8, boxShadow: '0 0 0 1px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#08316F,#C8A96E)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            {initials(item.brand)}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#000', lineHeight: 1.2 }}>
              {item.brand === 'rachid' ? 'Rachid Chikhi' : 'Rodschinson Investment'}
            </div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.3 }}>
              {item.brand === 'rachid' ? 'Managing Partner · CRE Investor' : 'Commercial Real Estate · Belgium'}
            </div>
            <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>2h · <span style={{ fontSize: 10 }}>🌐</span></div>
          </div>
          <div style={{ marginLeft: 'auto', color: '#0077B5', fontSize: 18 }}>···</div>
        </div>
        {/* Text */}
        <div style={{ padding: '0 16px 10px', fontSize: 13, color: '#000', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {postText}{postText.length >= 220 ? '…' : ''}
          {isCarousel && <span style={{ color: '#0077B5', cursor: 'pointer' }}> see more</span>}
        </div>
        {/* Media */}
        <div style={{ position: 'relative' }}>
          <ContentThumbnail item={item} slides={slides} height={isPortrait ? 340 : 240} />
          {isCarousel && slideCount > 1 && (
            <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4 }}>
              1 / {slideCount}
            </div>
          )}
          {isCarousel && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.5)', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{item.title?.slice(0,50)}</div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{slideCount} slides ›</div>
            </div>
          )}
        </div>
        {/* Reactions */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid #eee', display: 'flex', gap: 0 }}>
          {[['👍 Like','#666'], ['💬 Comment','#666'], ['🔁 Repost','#666'], ['✈️ Send','#666']].map(([label, color]) => (
            <button key={label} style={{ flex: 1, padding: '6px 4px', border: 'none', background: 'none', cursor: 'pointer', color, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 4 }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function YouTubePreview({ item, slides }) {
  const isPortrait = item.format === '9:16'
  const isShort    = isPortrait || item.content_type === 'reel'
  return (
    <div style={{ background: '#0F0F0F', padding: 12, minHeight: 300 }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Thumbnail */}
        <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
          <ContentThumbnail item={item} slides={slides} height={isPortrait ? 340 : 240} />
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 5px', borderRadius: 3 }}>
            {isShort ? 'SHORT' : item.format === '16:9' ? '0:60' : '0:45'}
          </div>
        </div>
        {/* Info row */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#08316F,#C8A96E)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
            {initials(item.brand)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{item.title}</div>
            <div style={{ color: '#aaa', fontSize: 11 }}>
              {item.brand === 'rachid' ? 'Rachid Chikhi' : 'Rodschinson Investment'} · 1.2K views · 2 hours ago
            </div>
          </div>
          <div style={{ color: '#aaa', fontSize: 18, cursor: 'pointer' }}>⋮</div>
        </div>
      </div>
    </div>
  )
}

function TikTokPreview({ item, slides }) {
  return (
    <div style={{ background: '#000', display: 'flex', justifyContent: 'center', padding: '12px 0', minHeight: 300 }}>
      {/* Phone frame */}
      <div style={{ width: 220, position: 'relative', borderRadius: 16, overflow: 'hidden', border: '2px solid #333' }}>
        <ContentThumbnail item={item} slides={slides} height={390} />
        {/* Right action bar */}
        <div style={{ position: 'absolute', right: 6, bottom: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {[['❤️','842'],['💬','24'],['🔖',''],['↗️','']].map(([icon, count], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ fontSize: 22, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.8))' }}>{icon}</div>
              {count && <div style={{ color: '#fff', fontSize: 10, fontWeight: 700, textShadow: '0 1px 3px #000' }}>{count}</div>}
            </div>
          ))}
        </div>
        {/* Bottom overlay */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.8))', padding: '20px 10px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#08316F,#C8A96E)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 700 }}>{initials(item.brand)}</div>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>@{item.brand === 'rachid' ? 'rachid.chikhi' : 'rodschinson'}</div>
          </div>
          <div style={{ color: '#fff', fontSize: 11, lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.title}</div>
          <div style={{ color: '#fff', fontSize: 10, opacity: 0.7 }}>♫ Original sound</div>
        </div>
        {/* Top TikTok bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.5),transparent)' }}>
          <span style={{ color: '#fff', fontSize: 12, opacity: 0.8 }}>Following</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, borderBottom: '2px solid #fff' }}>For You</span>
          <span style={{ color: '#fff', fontSize: 12, opacity: 0.8 }}>LIVE</span>
        </div>
      </div>
    </div>
  )
}

function InstagramPreview({ item, slides }) {
  const isPortrait = item.format === '9:16'
  const isCarousel = item.content_type === 'carousel'
  const slideCount = slides?.length || 0
  return (
    <div style={{ background: '#FAFAFA', padding: '12px 0', minHeight: 300 }}>
      <div style={{ maxWidth: 420, margin: '0 auto', background: '#fff', border: '1px solid #dbdbdb', borderRadius: 8, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: 2 }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#08316F,#C8A96E)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700 }}>{initials(item.brand)}</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#000' }}>{item.brand === 'rachid' ? 'rachid.chikhi' : 'rodschinson_invest'}</div>
            <div style={{ fontSize: 11, color: '#888' }}>Belgium</div>
          </div>
          <div style={{ color: '#000', fontSize: 18 }}>···</div>
        </div>
        {/* Media */}
        <div style={{ position: 'relative' }}>
          <ContentThumbnail item={item} slides={slides} height={isPortrait ? 380 : 280} />
          {isCarousel && slideCount > 1 && (
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
              {Array.from({ length: Math.min(slideCount, 5) }).map((_, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === 0 ? '#0095f6' : 'rgba(255,255,255,0.7)' }} />
              ))}
            </div>
          )}
        </div>
        {/* Actions */}
        <div style={{ padding: '10px 14px 4px', display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 22, cursor: 'pointer' }}>🤍</span>
          <span style={{ fontSize: 22, cursor: 'pointer' }}>💬</span>
          <span style={{ fontSize: 22, cursor: 'pointer' }}>✈️</span>
          <span style={{ marginLeft: 'auto', fontSize: 22, cursor: 'pointer' }}>🔖</span>
        </div>
        <div style={{ padding: '0 14px', fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 4 }}>842 likes</div>
        <div style={{ padding: '0 14px 10px', fontSize: 13, color: '#000', lineHeight: 1.4 }}>
          <span style={{ fontWeight: 700 }}>{item.brand === 'rachid' ? 'rachid.chikhi' : 'rodschinson_invest'}</span>
          {' '}{item.title?.slice(0, 100)}
        </div>
      </div>
    </div>
  )
}

function FacebookPreview({ item, slides }) {
  return (
    <div style={{ background: '#F0F2F5', padding: '12px 0', minHeight: 300 }}>
      <div style={{ maxWidth: 500, margin: '0 auto', background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#08316F,#C8A96E)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>{initials(item.brand)}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#050505' }}>{item.brand === 'rachid' ? 'Rachid Chikhi' : 'Rodschinson Investment'}</div>
            <div style={{ fontSize: 11, color: '#65676B', display: 'flex', alignItems: 'center', gap: 4 }}>
              2h · <span style={{ fontSize: 12 }}>🌐</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, color: '#65676B' }}>
            <span style={{ cursor: 'pointer', fontSize: 18 }}>···</span>
            <span style={{ cursor: 'pointer', fontSize: 16 }}>✕</span>
          </div>
        </div>
        <div style={{ padding: '0 16px 10px', fontSize: 14, color: '#050505', lineHeight: 1.5 }}>
          {(item.output_text?.slice(0, 180) || item.title)}
          {(item.output_text?.length || 0) > 180 && <span style={{ color: '#65676B' }}>… See more</span>}
        </div>
        {/* Media */}
        <ContentThumbnail item={item} slides={slides} height={240} />
        {/* Counts */}
        <div style={{ padding: '6px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E4E6EB' }}>
          <div style={{ fontSize: 13, color: '#65676B', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>👍❤️😮</span> 342
          </div>
          <div style={{ fontSize: 13, color: '#65676B' }}>24 comments · 8 shares</div>
        </div>
        {/* Action bar */}
        <div style={{ padding: '4px 8px', display: 'flex' }}>
          {[['👍 Like','#65676B'],['💬 Comment','#65676B'],['↗️ Share','#65676B']].map(([label, color]) => (
            <button key={label} style={{ flex: 1, padding: '8px 4px', border: 'none', background: 'none', cursor: 'pointer', color, fontSize: 13, fontWeight: 600, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PlatformPreviewPane({ item, platform, slides }) {
  if (platform === 'linkedin')  return <LinkedInPreview  item={item} slides={slides} />
  if (platform === 'youtube')   return <YouTubePreview   item={item} slides={slides} />
  if (platform === 'tiktok')    return <TikTokPreview    item={item} slides={slides} />
  if (platform === 'instagram') return <InstagramPreview item={item} slides={slides} />
  if (platform === 'facebook')  return <FacebookPreview  item={item} slides={slides} />
  return null
}

// ─── Preview modal ────────────────────────────────────────────────────────────

function PreviewModal({ item, onClose, onStatusChange, onRegenerate, onDelete }) {
  const gradient = TEMPLATE_GRADIENTS[item.template] || 'linear-gradient(135deg,#08316F,#0d1a30)'
  const type     = TYPE_META[item.content_type] || { icon: '📄', label: item.content_type }
  const isVideo  = VIDEO_TYPES.has(item.content_type)
  const isImage  = IMAGE_TYPES.has(item.content_type)
  const isText   = TEXT_TYPES.has(item.content_type)
  const [slides, setSlides]         = useState(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [previewTab, setPreviewTab] = useState('original')  // 'original' | platform key

  const allPlatforms = item.platforms?.length ? item.platforms : []
  // Tabs: original + each platform the item targets
  const tabs = [
    { id: 'original', label: 'Original', icon: '🎨' },
    ...allPlatforms
      .filter(p => PLATFORM_META[p])
      .map(p => ({ id: p, label: PLATFORM_META[p].name, icon: PLATFORM_META[p].icon, color: PLATFORM_META[p].color })),
  ]

  useEffect(() => {
    if (item.content_type === 'carousel' && item.output_file) {
      fetch(`/api/carousel-slides/${item.job_id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.slides) { setSlides(d.slides); setActiveSlide(0) } })
        .catch(() => {})
    }
  }, [item.job_id, item.content_type, item.output_file])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
        borderRadius: 14,
        width: item.content_type === 'carousel' ? 780 : isText ? 620 : 520,
        maxWidth: '96vw',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', animation: 'fadein 0.15s ease',
        display: 'flex', flexDirection: 'column', maxHeight: '92vh',
      }}>

        {/* ── Platform tab switcher ── */}
        {tabs.length > 1 && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--cs-border)', background: 'var(--cs-surface2)', flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {tabs.map(tab => {
              const active = previewTab === tab.id
              return (
                <button key={tab.id} onClick={() => setPreviewTab(tab.id)} style={{
                  padding: '9px 16px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: 'none', fontSize: 12, fontWeight: active ? 700 : 400,
                  color: active ? (tab.color || '#00B6FF') : 'var(--cs-text-muted)',
                  borderBottom: active ? `2px solid ${tab.color || '#00B6FF'}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.12s',
                }}>
                  <span style={{ fontSize: tab.id === 'original' ? 14 : 13 }}>{tab.icon}</span>
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Platform preview pane ── */}
        {previewTab !== 'original' && (
          <div style={{ flexShrink: 0, maxHeight: 440, overflowY: 'auto' }}>
            <PlatformPreviewPane item={item} platform={previewTab} slides={slides} />
          </div>
        )}

        {/* ── Original preview (existing) ── */}
        {previewTab === 'original' && (
          <>
            {/* ── Video preview ── */}
            {isVideo && (
              item.output_file ? (
                <video src={`/api/video/${item.job_id}`} controls style={{ width: '100%', maxHeight: 280, background: '#000', display: 'block', flexShrink: 0 }} />
              ) : (
                <div style={{ background: gradient, height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                  <div style={{ fontSize: 44, marginBottom: 6 }}>{type.icon}</div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{item.format} · {item.template?.replace(/_/g,' ')}</div>
                  <div style={{ position: 'absolute', top: 10, right: 10 }}><StatusBadge status={item.status} /></div>
                </div>
              )
            )}

            {/* ── Carousel preview ── */}
            {item.content_type === 'carousel' && (
              <div style={{ background: 'var(--cs-bg)', padding: '16px 28px', flexShrink: 0 }}>
                {slides ? (
                  <CarouselSlidePreview
                    slides={slides}
                    template={item.template || 'carousel_bold'}
                    activeSlide={activeSlide}
                    onSlideChange={setActiveSlide}
                  />
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', height: 80, color: 'var(--cs-text-muted)', fontSize: 12 }}>
                    {item.output_file ? 'Loading slides…' : 'No preview yet — generate first'}
                  </div>
                )}
              </div>
            )}

            {/* ── Image post preview ── */}
            {item.content_type === 'image_post' && (
              item.output_file ? (
                <div style={{ background: '#000', maxHeight: 340, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  <img src={`/api/image/${item.job_id}`} alt={item.title} style={{ maxWidth: '100%', maxHeight: 340, objectFit: 'contain', display: 'block' }} />
                  <div style={{ position: 'absolute', top: 10, right: 10 }}><StatusBadge status={item.status} /></div>
                </div>
              ) : (
                <div style={{ background: gradient, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 40 }}>📸</div>
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 6 }}>{item.format} · {item.template?.replace(/_/g,' ')}</div>
                  </div>
                  <div style={{ position: 'absolute', top: 10, right: 10 }}><StatusBadge status={item.status} /></div>
                </div>
              )
            )}

            {/* ── Text post preview — show the actual text content ── */}
            {isText && (
              <div style={{ background: 'linear-gradient(135deg,#0077B5,#005580)', padding: '20px 24px', flexShrink: 0 }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Text Post</div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, lineHeight: 1.4, maxWidth: 400 }}>{item.title}</div>
              </div>
            )}
          </>
        )}

        {/* Body */}
        <div style={{ padding: 22, overflowY: 'auto', flex: 1 }}>
          <ModalHeader item={item} onClose={onClose} />
          <StatusStepper status={item.status} onChangeStatus={(s) => onStatusChange(item.job_id, s)} />

          {/* Text content body — for text_only show editable area */}
          {isText && item.output_text && (
            <div style={{ background: 'var(--cs-surface2)', borderRadius: 8, padding: 14, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Generated Copy</div>
              <pre style={{ color: 'var(--cs-text)', fontSize: 12, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {item.output_text}
              </pre>
            </div>
          )}

          {/* Carousel info */}
          {item.content_type === 'carousel' && slides && (
            <div style={{ background: 'rgba(0,182,255,0.06)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, border: '1px solid rgba(0,182,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#00B6FF', fontSize: 12 }}>🖼️ {slides.length} slides ready</span>
              <button onClick={() => window.open(`/api/download/${item.job_id}`, '_blank')} style={{ padding: '4px 12px', borderRadius: 5, cursor: 'pointer', border: '1px solid rgba(22,163,74,0.4)', background: 'rgba(22,163,74,0.08)', color: '#16a34a', fontSize: 11, fontWeight: 600 }}>⬇ Download PNGs</button>
            </div>
          )}

          <ModalActions item={item} onStatusChange={onStatusChange} onRegenerate={onRegenerate} onDelete={onDelete} onClose={onClose} />
        </div>
      </div>
    </div>
  )
}

// ─── Content Card ─────────────────────────────────────────────────────────────

function CardThumbnail({ item, gradient, height = 130 }) {
  const [thumbUrl, setThumbUrl] = useState(null)
  const type = TYPE_META[item.content_type] || { icon: '📄' }
  const isPortrait = item.format === '9:16'
  const isVideoType = ['video','reel','story'].includes(item.content_type)

  // Lazy-load carousel first slide
  useEffect(() => {
    if (item.content_type === 'carousel' && item.output_file) {
      fetch(`/api/carousel-slides/${item.job_id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.slides?.[0]?.png_url) setThumbUrl(d.slides[0].png_url) })
        .catch(() => {})
    }
  }, [item.job_id, item.content_type, item.output_file])

  if (thumbUrl) {
    return <img src={thumbUrl} alt="" style={{ width: '100%', height, objectFit: 'cover', display: 'block' }} />
  }
  if (isVideoType && item.output_file) {
    return (
      <div style={{ width: '100%', height, background: gradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>▶</div>
      </div>
    )
  }
  if (item.content_type === 'image_post' && item.output_file) {
    return <img src={`/api/image/${item.job_id}`} alt="" style={{ width: '100%', height, objectFit: 'cover', display: 'block' }} />
  }
  return (
    <div style={{ width: '100%', height, background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: isPortrait ? 46 : 72, height: isPortrait ? 72 : 46, border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 20 }}>{type.icon}</span>
      </div>
    </div>
  )
}

function ContentCard({ item, onStatusChange, onRegenerate, onDelete, selected, onSelect }) {
  const [preview, setPreview] = useState(false)
  const gradient    = TEMPLATE_GRADIENTS[item.template] || 'linear-gradient(135deg,#08316F,#0d1a30)'
  const nextStatus  = STATUS_FLOW[STATUS_FLOW.indexOf(item.status) + 1]

  return (
    <>
      {preview && (
        <PreviewModal
          item={item}
          onClose={() => setPreview(false)}
          onStatusChange={onStatusChange}
          onRegenerate={() => { setPreview(false); onRegenerate(item) }}
          onDelete={() => { setPreview(false); onDelete(item.job_id) }}
        />
      )}
      <div
        style={{
          background: 'var(--cs-surface)', borderRadius: 10, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.15s, transform 0.15s',
          border: selected ? '2px solid #00B6FF' : '1px solid var(--cs-border)',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
      >
        {/* Thumbnail */}
        <div onClick={() => setPreview(true)} style={{ height: 130, cursor: 'pointer', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
          <CardThumbnail item={item} gradient={gradient} height={130} />
          {/* Selection checkbox */}
          {onSelect && (
            <div
              onClick={e => { e.stopPropagation(); onSelect(item.job_id) }}
              style={{ position: 'absolute', top: 8, left: 8, width: 18, height: 18, borderRadius: 4, cursor: 'pointer', zIndex: 2,
                background: selected ? '#00B6FF' : 'rgba(0,0,0,0.4)',
                border: selected ? '2px solid #00B6FF' : '2px solid rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >{selected && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}</div>
          )}
          <div style={{ position: 'absolute', top: 8, right: 8 }}><StatusBadge status={item.status} /></div>
          <div style={{ position: 'absolute', bottom: 8, left: 8, width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg,#08316F,${brandColor(item.brand)})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 700 }}>{initials(item.brand)}</div>
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 3, padding: '1px 5px', fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>{item.format}</div>
        </div>

        {/* Body */}
        <div style={{ padding: '10px 12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 600, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {item.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ color: 'var(--cs-text-muted)', fontSize: 10 }}>{fmtDate(item.created_at)}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--cs-hover)', color: 'var(--cs-text-muted)', fontSize: 9, fontWeight: 600 }}>{item.language}</span>
              <PlatformBadges platforms={item.platforms} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, padding: '6px 8px', borderTop: '1px solid var(--cs-border-sub)', flexWrap: 'wrap' }}>
          <ActionBtn label="Preview" onClick={() => setPreview(true)} color="#0284c7" />
          <ActionBtn label="↻" onClick={() => onRegenerate(item)} color="#b45309" />
          {item.output_file && (
            <ActionBtn label="⬇" onClick={() => window.open(`/api/download/${item.job_id}`, '_blank')} color="#16a34a" />
          )}
          {nextStatus && nextStatus !== 'Scheduled' && (
            <ActionBtn label={`→ ${nextStatus}`} onClick={() => onStatusChange(item.job_id, nextStatus)} color={STATUS_META[nextStatus]?.color} />
          )}
          {item.status !== 'Scheduled' && item.status !== 'Published' && (
            <ActionBtn label="📅" onClick={() => setPreview(true)} color="#6d28d9" />
          )}
          <ActionBtn label="🗑" onClick={() => onDelete(item.job_id)} color="#ef4444" />
        </div>
      </div>
    </>
  )
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({ active, onSelect, search, onSearch, total, counts }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
        {FILTERS.map(f => {
          const on = active === f.id
          const cnt = counts?.[f.id]
          return (
            <button key={f.id} onClick={() => onSelect(f.id)} style={{
              padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: on ? 'rgba(0,182,255,0.1)' : 'var(--cs-hover)',
              color: on ? '#0284c7' : 'var(--cs-text-sub)',
              fontSize: 12, fontWeight: on ? 600 : 400,
              outline: on ? '1px solid rgba(0,182,255,0.3)' : '1px solid var(--cs-border)',
              transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {f.label}
              {cnt > 0 && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{cnt}</span>}
            </button>
          )
        })}
      </div>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--cs-text-muted)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
        <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search…" style={{
          background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
          borderRadius: 8, padding: '6px 12px 6px 30px',
          color: 'var(--cs-text)', fontSize: 13, outline: 'none', width: 180,
        }} />
      </div>
      <span style={{ color: 'var(--cs-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{total} {total === 1 ? 'item' : 'items'}</span>
    </div>
  )
}

// ─── Bulk Action Bar ─────────────────────────────────────────────────────────

function BulkBar({ selected, total, onSelectAll, onClear, onDelete, onStatus }) {
  const [showStatus, setShowStatus] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: 'rgba(0,182,255,0.06)', border: '1px solid rgba(0,182,255,0.2)',
      borderRadius: 8, padding: '8px 14px', marginBottom: 14,
      animation: 'fadein 0.15s ease',
    }}>
      <span style={{ color: '#00B6FF', fontSize: 12, fontWeight: 700 }}>{selected} selected</span>
      <button onClick={onSelectAll} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 11, cursor: 'pointer' }}>Select all ({total})</button>
      <button onClick={onClear} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 11, cursor: 'pointer' }}>Clear</button>
      <div style={{ flex: 1 }} />
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowStatus(s => !s)} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--cs-border)', background: 'var(--cs-surface)', color: 'var(--cs-text-sub)', fontSize: 11, cursor: 'pointer' }}>
          Set status ▾
        </button>
        {showStatus && (
          <div style={{ position: 'absolute', top: 30, left: 0, zIndex: 50, background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 130, animation: 'fadein 0.1s ease' }}>
            {STATUS_FLOW.map(s => (
              <button key={s} onClick={() => { onStatus(s); setShowStatus(false) }} style={{ display: 'block', width: '100%', padding: '8px 14px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: STATUS_META[s]?.color, fontWeight: 600 }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onDelete} style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
        🗑 Delete {selected}
      </button>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ filtered }) {
  const navigate = useNavigate()
  if (filtered) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div style={{ color: 'var(--cs-text-sub)', fontSize: 14, marginBottom: 6 }}>No content matches your filter</div>
        <div style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>Try a different filter or clear your search</div>
      </div>
    )
  }
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', animation: 'fadein 0.3s ease' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
      <div style={{ color: 'var(--cs-text)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No content yet</div>
      <div style={{ color: 'var(--cs-text-sub)', fontSize: 14, marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
        Generate your first video and it will appear here ready for review and scheduling.
      </div>
      <button
        onClick={() => navigate('/')}
        style={{
          padding: '12px 28px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg,#08316F,#00B6FF)',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,182,255,0.3)',
        }}
      >
        Create your first video →
      </button>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Library() {
  useTheme()
  const navigate  = useNavigate()
  const { jobs }  = useGeneration()
  const { success, error: toastError, info } = useToast()
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [newBanner, setNewBanner] = useState(null)
  const [selected, setSelected] = useState(new Set()) // bulk selection
  const prevJobsRef = useRef([])

  // Auto-refresh when a background job transitions to 'done'
  useEffect(() => {
    const prev = prevJobsRef.current
    const justDone = jobs.filter(j =>
      j.status === 'done' &&
      prev.find(p => p.job_id === j.job_id && p.status !== 'done')
    )
    if (justDone.length > 0) {
      load()
      setNewBanner(justDone[0].job_id)
      success('Content ready! Your generation has been added to your library.')
      setTimeout(() => setNewBanner(null), 5000)
    }
    prevJobsRef.current = jobs
  }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/library')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setItems(data.items || [])
    } catch {
      setError('Could not reach API — make sure the backend is running')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleStatusChange = useCallback(async (jobId, newStatus) => {
    setItems(prev => prev.map(i => i.job_id === jobId ? { ...i, status: newStatus } : i))
    try {
      await fetch(`/api/library/${jobId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      info(`Status updated to ${newStatus}`)
    } catch { load() }
  }, [load, info])

  const handleDelete = useCallback(async (jobId) => {
    if (!window.confirm('Delete this content? This cannot be undone.')) return
    setItems(prev => prev.filter(i => i.job_id !== jobId))
    setSelected(prev => { const s = new Set(prev); s.delete(jobId); return s })
    try {
      await fetch(`/api/library/${jobId}`, { method: 'DELETE' })
      success('Content deleted.')
    } catch { load() }
  }, [load, success])

  // Bulk actions
  const handleBulkDelete = useCallback(async () => {
    const ids = [...selected]
    if (!window.confirm(`Delete ${ids.length} items? This cannot be undone.`)) return
    setItems(prev => prev.filter(i => !selected.has(i.job_id)))
    setSelected(new Set())
    await Promise.allSettled(ids.map(id => fetch(`/api/library/${id}`, { method: 'DELETE' })))
    success(`Deleted ${ids.length} items.`)
  }, [selected, success])

  const handleBulkStatus = useCallback(async (newStatus) => {
    const ids = [...selected]
    setItems(prev => prev.map(i => selected.has(i.job_id) ? { ...i, status: newStatus } : i))
    setSelected(new Set())
    await Promise.allSettled(ids.map(id => fetch(`/api/library/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })))
    success(`${ids.length} items set to ${newStatus}.`)
  }, [selected, success])

  const toggleSelect = useCallback((jobId) => {
    setSelected(prev => { const s = new Set(prev); s.has(jobId) ? s.delete(jobId) : s.add(jobId); return s })
  }, [])

  // Navigate to New Content with pre-filled brief for regeneration
  const handleRegenerate = useCallback((item) => {
    sessionStorage.setItem('cs-regenerate', JSON.stringify({
      subject: item.title,
      brand: item.brand === 'rodschinson' ? 'investment' : 'rachid',
      language: item.language,
      contentType: item.content_type,
      format: item.format,
      template: item.template,
    }))
    navigate('/')
  }, [navigate])

  const filtered = items.filter(item => {
    if (filter === 'pending')   { if (!['Draft','Ready','Approved'].includes(item.status)) return false }
    else if (filter === 'published') { if (item.status !== 'Published') return false }
    else if (filter !== 'all')  { if (item.content_type !== filter) return false }
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!item.title?.toLowerCase().includes(q) && !item.brand?.toLowerCase().includes(q) && !item.language?.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Filter counts for filter bar
  const filterCounts = {
    all: items.length,
    video: items.filter(i => i.content_type === 'video').length,
    carousel: items.filter(i => i.content_type === 'carousel').length,
    image_post: items.filter(i => i.content_type === 'image_post').length,
    reel: items.filter(i => i.content_type === 'reel').length,
    pending: items.filter(i => ['Draft','Ready','Approved'].includes(i.status)).length,
    published: items.filter(i => i.status === 'Published').length,
  }

  const counts = STATUS_FLOW.reduce((acc, s) => { acc[s] = items.filter(i => i.status === s).length; return acc }, {})

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: 'var(--cs-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Library</h1>
          <p style={{ color: 'var(--cs-text-sub)', fontSize: 13, margin: 0 }}>Manage and publish your content</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {STATUS_FLOW.map(s => {
            const m = STATUS_META[s]
            if (!counts[s]) return null
            return (
              <span key={s} style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: m.color, background: m.bg, border: `1px solid ${m.color}40` }}>
                {counts[s]} {m.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* New content banner */}
      {newBanner && (
        <div style={{
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'fadein 0.2s ease',
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div style={{ flex: 1 }}>
            <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>New content ready! </span>
            <span style={{ color: 'var(--cs-text-sub)', fontSize: 12 }}>Your generation completed and has been added to your library.</span>
          </div>
          <button onClick={() => setNewBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text-muted)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Active jobs banner */}
      {jobs.filter(j => j.status === 'pending' || j.status === 'running').length > 0 && (
        <div style={{
          background: 'rgba(0,182,255,0.05)', border: '1px solid rgba(0,182,255,0.2)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(0,182,255,0.3)" strokeWidth="1.5" />
            <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="#00B6FF" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ color: '#00B6FF', fontSize: 12, fontWeight: 600 }}>
            {jobs.filter(j => j.status === 'pending' || j.status === 'running').length} generation{jobs.filter(j => j.status === 'pending' || j.status === 'running').length > 1 ? 's' : ''} in progress
          </span>
          <span style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>— this page will refresh automatically when done</span>
        </div>
      )}

      <FilterBar active={filter} onSelect={setFilter} search={search} onSearch={setSearch} total={filtered.length} counts={filterCounts} />

      {selected.size > 0 && (
        <BulkBar
          selected={selected.size}
          total={filtered.length}
          onSelectAll={() => setSelected(new Set(filtered.map(i => i.job_id)))}
          onClear={() => setSelected(new Set())}
          onDelete={handleBulkDelete}
          onStatus={handleBulkStatus}
        />
      )}

      {error && (
        <div style={{ background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.15)', borderRadius: 7, padding: '8px 14px', marginBottom: 16, color: '#b45309', fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--cs-border)" strokeWidth="2" />
            <path d="M12 2A10 10 0 0 1 22 12" fill="none" stroke="#00B6FF" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {!loading && items.length === 0 && <EmptyState filtered={false} />}
      {!loading && items.length > 0 && filtered.length === 0 && <EmptyState filtered={true} />}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {filtered.map(item => (
            <ContentCard
              key={item.job_id}
              item={item}
              onStatusChange={handleStatusChange}
              onRegenerate={handleRegenerate}
              onDelete={handleDelete}
              selected={selected.has(item.job_id)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
