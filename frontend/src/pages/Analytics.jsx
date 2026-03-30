import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useTheme } from '../contexts/ThemeContext'

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANDS = [
  { id: 'both',        label: 'Both',                  subtitle: 'All brands combined'       },
  { id: 'rodschinson', label: 'Rodschinson Investment', subtitle: 'Investment brand only'      },
  { id: 'rachid',      label: 'Rachid Chikhi',          subtitle: 'Personal brand only'        },
]

const PLATFORM_COLORS = {
  LinkedIn:  '#0077B5',
  Instagram: '#E1306C',
  TikTok:    '#69C9D0',
  YouTube:   '#FF4444',
  Facebook:  '#1877F2',
}

// ─── Mock ────────────────────────────────────────────────────────────────────

function buildMock(brand) {
  const mul = brand === 'rodschinson' ? 0.62 : brand === 'rachid' ? 0.38 : 1
  const views30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i))
    const base = 1200 + Math.sin(i * 0.4) * 600 + Math.random() * 400
    return {
      date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      views: Math.round(base * mul),
      rodschinson: Math.round(base * 0.62),
      rachid: Math.round(base * 0.38),
    }
  })
  const platforms = [
    { platform: 'LinkedIn',  views: Math.round(48200 * mul) },
    { platform: 'YouTube',   views: Math.round(31500 * mul) },
    { platform: 'Instagram', views: Math.round(27800 * mul) },
    { platform: 'TikTok',    views: Math.round(19400 * mul) },
    { platform: 'Facebook',  views: Math.round(8100  * mul) },
  ].sort((a, b) => b.views - a.views)
  return {
    views30, platforms,
    totalViews: Math.round(135000 * mul),
    engagement: +(4.2 + Math.random() * 0.6).toFixed(1),
    videosGen:  Math.round(38 * mul),
    leads:      Math.round(214 * mul),
    viewsDelta: +(12 + Math.random() * 5).toFixed(1),
    engDelta:   +(0.3 + Math.random() * 0.4).toFixed(1),
    videosDelta: Math.round(6 * mul),
    leadsDelta: Math.round(31 * mul),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BrandFilter({ active, onChange }) {
  const current = BRANDS.find(b => b.id === active)
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        {BRANDS.map(b => {
          const on = active === b.id
          return (
            <button key={b.id} onClick={() => onChange(b.id)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: on ? 'rgba(0,182,255,0.12)' : 'var(--cs-hover)',
              color: on ? '#00B6FF' : 'var(--cs-text-sub)',
              fontSize: 12, fontWeight: on ? 600 : 400,
              outline: on ? '1px solid rgba(0,182,255,0.3)' : '1px solid var(--cs-border)',
              transition: 'all 0.12s',
            }}>
              {b.label}
            </button>
          )
        })}
      </div>
      <div style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>{current?.subtitle}</div>
    </div>
  )
}

function StatCard({ label, value, delta, deltaLabel, icon, accent, drilldownLabel, onDrilldown }) {
  const positive = delta > 0
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onDrilldown}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--cs-surface)', border: `1px solid ${hov && onDrilldown ? accent + '40' : 'var(--cs-border)'}`,
        borderRadius: 10, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10,
        cursor: onDrilldown ? 'pointer' : 'default',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: hov && onDrilldown ? `0 4px 20px ${accent}18` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--cs-text-muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ width: 32, height: 32, borderRadius: 8, fontSize: 16, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
      </div>
      <div style={{ color: 'var(--cs-text)', fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-1px' }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 10,
            color: positive ? '#4ade80' : '#f87171',
            background: positive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          }}>
            {positive ? '↑' : '↓'} {Math.abs(delta)}
          </span>
          <span style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>{deltaLabel}</span>
        </div>
        {onDrilldown && (
          <span style={{ color: hov ? accent : 'var(--cs-text-muted)', fontSize: 10, transition: 'color 0.15s' }}>
            {drilldownLabel} →
          </span>
        )}
      </div>
    </div>
  )
}

function ChartCard({ title, children, action }) {
  return (
    <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--cs-border-sub)' }}>
        <span style={{ color: 'var(--cs-text)', fontSize: 13, fontWeight: 600 }}>{title}</span>
        {action}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '10px 14px' }}>
      <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--cs-text-sub)', fontSize: 11 }}>{p.name}</span>
          <span style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 600, marginLeft: 'auto', paddingLeft: 12 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function ViewsChart({ data, brand }) {
  const showBoth = brand === 'both'
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="var(--cs-border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: 'var(--cs-text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
        <YAxis tick={{ fill: 'var(--cs-text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmt} />
        <Tooltip content={<CustomTooltip />} />
        {showBoth ? (
          <>
            <Line type="monotone" dataKey="rodschinson" name="Rodschinson" stroke="#C8A96E" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="rachid" name="Rachid" stroke="#00B6FF" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </>
        ) : (
          <Line type="monotone" dataKey="views" name="Views" stroke="#00B6FF" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#00B6FF' }} />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}

function PlatformBars({ data, onPlatformClick }) {
  const maxVal = Math.max(...data.map(d => d.views), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.map(({ platform, views }) => {
        const color = PLATFORM_COLORS[platform] || '#00B6FF'
        const pct   = (views / maxVal) * 100
        return (
          <div key={platform} style={{ cursor: onPlatformClick ? 'pointer' : 'default' }} onClick={() => onPlatformClick?.(platform)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--cs-text-sub)', fontSize: 12 }}>{platform}</span>
              <span style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 600 }}>{fmt(views)}</span>
            </div>
            <div style={{ height: 6, background: 'var(--cs-hover)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
          </div>
        )
      })}
      {onPlatformClick && (
        <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, textAlign: 'center', marginTop: 4 }}>
          Click a platform to filter Library
        </div>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[0,1,2,3].map(i => <div key={i} style={{ height: 110, borderRadius: 10, background: 'var(--cs-hover)', animation: 'pulse 1.5s ease infinite' }} />)}
      </div>
      <div style={{ height: 280, borderRadius: 10, background: 'var(--cs-hover)', animation: 'pulse 1.5s ease infinite' }} />
      <div style={{ height: 200, borderRadius: 10, background: 'var(--cs-hover)', animation: 'pulse 1.5s ease infinite' }} />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  useTheme()
  const navigate = useNavigate()
  const [brand, setBrand]     = useState('both')
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)

  const load = useCallback(async (b) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics?brand=${b}`)
      if (!res.ok) throw new Error()
      setData(await res.json()); setApiError(false)
    } catch {
      setData(buildMock(b)); setApiError(true)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(brand) }, [brand, load])

  // Drill-down handlers
  const goLibrary = (filter) => navigate(`/library?filter=${filter}`)
  const goPlatformLibrary = (platform) => navigate(`/library?platform=${platform.toLowerCase()}`)

  return (
    <div style={{ maxWidth: 1060 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: 'var(--cs-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Analytics</h1>
          <p style={{ color: 'var(--cs-text-muted)', fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            Last 30 days · updated hourly
            {data?.source === 'metricool' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(0,182,255,0.08)', border: '1px solid rgba(0,182,255,0.2)', borderRadius: 10, padding: '1px 8px', fontSize: 11, color: '#00B6FF', fontWeight: 600 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00B6FF', display: 'inline-block' }} />
                Metricool
              </span>
            )}
            {data?.source === 'internal' && (
              <span style={{ color: 'rgba(200,169,110,0.6)', fontSize: 11 }}>· demo data — connect Metricool to see real stats</span>
            )}
            {apiError && <span style={{ color: 'rgba(200,169,110,0.6)', fontSize: 11 }}>· API offline</span>}
          </p>
        </div>
        <BrandFilter active={brand} onChange={b => { setBrand(b); load(b) }} />
      </div>

      {/* Metricool setup banner */}
      {!loading && data?.source === 'internal' && (
        <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 10, background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--cs-text)', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Connect Metricool for real analytics</div>
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>Add <code style={{ background: 'var(--cs-hover)', padding: '1px 5px', borderRadius: 3 }}>METRICOOL_TOKEN</code>, <code style={{ background: 'var(--cs-hover)', padding: '1px 5px', borderRadius: 3 }}>METRICOOL_USER_ID</code> and <code style={{ background: 'var(--cs-hover)', padding: '1px 5px', borderRadius: 3 }}>METRICOOL_BLOG_ID</code> to your .env</div>
          </div>
          <a href="https://app.metricool.com/en/profile/integrations" target="_blank" rel="noreferrer" style={{ padding: '7px 16px', borderRadius: 7, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.3)', color: '#C8A96E', fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Get API token →
          </a>
        </div>
      )}

      {loading && <LoadingSkeleton />}

      {!loading && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadein 0.2s ease' }}>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
            <StatCard
              label="Total Views" value={fmt(data.totalViews)} delta={data.viewsDelta} deltaLabel="vs last month"
              icon="👁️" accent="#00B6FF"
              drilldownLabel="View published" onDrilldown={() => goLibrary('published')}
            />
            <StatCard
              label="Engagement Rate" value={`${data.engagement}%`} delta={data.engDelta} deltaLabel="vs last month"
              icon="💬" accent="#C8A96E"
              drilldownLabel={null} onDrilldown={null}
            />
            <StatCard
              label="Videos Generated" value={data.videosGen} delta={data.videosDelta} deltaLabel="this month"
              icon="🎬" accent="#4ade80"
              drilldownLabel="Open Library" onDrilldown={() => goLibrary('all')}
            />
            <StatCard
              label="Leads" value={data.leads} delta={data.leadsDelta} deltaLabel="this month"
              icon="🎯" accent="#a855f7"
              drilldownLabel="Scheduled content" onDrilldown={() => goLibrary('pending')}
            />
          </div>

          {/* Two-column charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>

            <ChartCard
              title="Views — Last 30 Days"
              action={brand === 'both' ? (
                <div style={{ display: 'flex', gap: 12 }}>
                  {[['Rodschinson', '#C8A96E'], ['Rachid', '#00B6FF']].map(([l, c]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 20, height: 2, background: c, borderRadius: 1, display: 'inline-block' }} />
                      <span style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>{l}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            >
              <ViewsChart data={data.views30} brand={brand} />
            </ChartCard>

            <ChartCard title="Views by Platform">
              <PlatformBars data={data.platforms} onPlatformClick={goPlatformLibrary} />
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  )
}
