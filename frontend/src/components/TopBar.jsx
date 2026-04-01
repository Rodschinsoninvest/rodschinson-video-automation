import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useGeneration } from '../contexts/GenerationContext'
import { useMobile } from '../hooks/useMobile'

// ─── Content type icons ───────────────────────────────────────────────────────
const TYPE_ICONS = {
  video: '🎬', carousel: '🖼️', image_post: '📸',
  text_only: '✍️', story: '⚡', reel: '🎞️',
}

// ─── Spinner SVG ──────────────────────────────────────────────────────────────
function Spin({ size = 12, color = '#00B6FF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke={color + '44'} strokeWidth="1.5" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Job row inside dropdown ──────────────────────────────────────────────────
function JobRow({ job, onViewInLibrary, onClear }) {
  const isRunning = job.status === 'pending' || job.status === 'running'
  const isDone    = job.status === 'done'
  const isError   = job.status === 'error'

  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid var(--cs-border-sub)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{TYPE_ICONS[job.contentType] || '📄'}</span>
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--cs-text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{job.title || 'Untitled'}</span>
        {isRunning && <Spin />}
        {isDone    && <span style={{ fontSize: 14 }}>✅</span>}
        {isError   && <span style={{ fontSize: 14 }}>❌</span>}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--cs-text-muted)' }}>{job.step || 'Processing…'}</span>
            <span style={{ fontSize: 10, color: '#00B6FF', fontWeight: 600 }}>{job.progress}%</span>
          </div>
          <div style={{ height: 3, background: 'var(--cs-border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'linear-gradient(90deg,#08316F,#00B6FF)',
              width: `${job.progress}%`, transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {isDone && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onViewInLibrary} style={{
            flex: 1, padding: '4px 10px', borderRadius: 5, border: 'none',
            background: 'rgba(0,182,255,0.1)', color: '#00B6FF',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>View in Library</button>
          <button onClick={onClear} style={{
            padding: '4px 8px', borderRadius: 5, border: '1px solid var(--cs-border)',
            background: 'transparent', color: 'var(--cs-text-muted)',
            fontSize: 11, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}

      {isError && (
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ flex: 1, fontSize: 11, color: '#f87171' }}>Generation failed</span>
          <button onClick={onClear} style={{
            padding: '4px 8px', borderRadius: 5, border: '1px solid var(--cs-border)',
            background: 'transparent', color: 'var(--cs-text-muted)',
            fontSize: 11, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}
    </div>
  )
}

// ─── Main TopBar ──────────────────────────────────────────────────────────────
export default function TopBar({ onMenuClick }) {
  const { isDark, toggle } = useTheme()
  const { jobs, badgeCount, markAllSeen, clearJob } = useGeneration()
  const navigate = useNavigate()
  const isMobile = useMobile()

  const [open, setOpen] = useState(false)
  const dropRef = useRef()

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasJobs = jobs.length > 0
  const activeCount = jobs.filter(j => j.status === 'pending' || j.status === 'running').length

  const handleToggle = () => {
    if (!open) markAllSeen()
    setOpen(s => !s)
  }

  const handleViewInLibrary = (job) => {
    clearJob(job.job_id)
    setOpen(false)
    navigate('/library')
  }

  return (
    <header style={{
      height: 56,
      background: 'var(--cs-surface)',
      borderBottom: '1px solid var(--cs-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', flexShrink: 0, position: 'relative', zIndex: 40,
    }}>
      {/* Logo + hamburger on mobile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isMobile && (
          <button
            onClick={onMenuClick}
            style={{
              width: 34, height: 34, borderRadius: 8, border: '1px solid var(--cs-border)',
              background: 'var(--cs-surface)', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: 0, flexShrink: 0,
            }}
          >
            <span style={{ width: 14, height: 1.5, background: 'var(--cs-text-sub)', borderRadius: 1, display: 'block' }} />
            <span style={{ width: 14, height: 1.5, background: 'var(--cs-text-sub)', borderRadius: 1, display: 'block' }} />
            <span style={{ width: 14, height: 1.5, background: 'var(--cs-text-sub)', borderRadius: 1, display: 'block' }} />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ color: '#08316F', fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
            Rodschinson
          </span>
          <span style={{ color: 'var(--cs-text-muted)', fontSize: 14 }}>/</span>
          <span style={{ color: 'var(--cs-text-sub)', fontWeight: 400, fontSize: 14 }}>
            Content Studio
          </span>
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Generation queue indicator */}
        <div ref={dropRef} style={{ position: 'relative' }}>
          <button
            onClick={handleToggle}
            title="Generation queue"
            style={{
              position: 'relative', width: 34, height: 34, borderRadius: 8,
              border: '1px solid var(--cs-border)',
              background: open ? 'rgba(0,182,255,0.08)' : 'var(--cs-surface)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            {/* Animated spinner when jobs are active */}
            {activeCount > 0 ? <Spin size={16} /> : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cs-text-sub)" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            )}
            {/* Badge */}
            {badgeCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 16, height: 16, borderRadius: '50%',
                background: activeCount > 0 ? '#00B6FF' : '#22c55e',
                color: '#fff', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--cs-surface)',
              }}>
                {badgeCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div style={{
              position: 'absolute', top: 42, right: 0, zIndex: 100,
              background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
              borderRadius: 10, width: 300,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              overflow: 'hidden', animation: 'fadein 0.12s ease',
            }}>
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid var(--cs-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 700 }}>
                  Generation Queue
                  {activeCount > 0 && (
                    <span style={{ marginLeft: 6, color: '#00B6FF', fontSize: 11 }}>
                      · {activeCount} running
                    </span>
                  )}
                </span>
                {hasJobs && (
                  <button
                    onClick={() => { navigate('/library'); setOpen(false) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00B6FF', fontSize: 11 }}
                  >
                    Library →
                  </button>
                )}
              </div>

              {!hasJobs ? (
                <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--cs-text-muted)', fontSize: 12 }}>
                  No active generations
                </div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {jobs.map(job => (
                    <JobRow
                      key={job.job_id}
                      job={job}
                      onViewInLibrary={() => handleViewInLibrary(job)}
                      onClear={() => clearJob(job.job_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            width: 34, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: isDark ? '#00B6FF' : 'rgba(0,0,0,0.15)',
            position: 'relative', transition: 'background 0.2s', padding: 0, flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%',
            background: '#ffffff', transition: 'left 0.2s',
            left: isDark ? 17 : 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, lineHeight: 1,
          }}>
            {isDark ? '🌙' : '☀️'}
          </span>
        </button>

        {/* Avatar */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'linear-gradient(135deg, #08316F, #00B6FF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: '0.5px',
          cursor: 'pointer', userSelect: 'none',
        }}>RC</div>
      </div>
    </header>
  )
}
