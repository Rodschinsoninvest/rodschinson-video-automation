import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useGeneration } from '../contexts/GenerationContext'
import { useMobile } from '../hooks/useMobile'
import { Menu, Sun, Moon, ChevronRight, Film, Images, Camera, PenLine, Zap, Clapperboard, FileText, Inbox, X } from 'lucide-react'

// ─── Content type icons ───────────────────────────────────────────────────────
const TYPE_ICONS = {
  video: Film, carousel: Images, image_post: Camera,
  text_only: PenLine, story: Zap, reel: Clapperboard,
}

// ─── Spinner SVG ──────────────────────────────────────────────────────────────
function Spin({ size = 12, color = 'var(--cs-accent)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--cs-border)" strokeWidth="1.8" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

// ─── Job row ──────────────────────────────────────────────────────────────────
function JobRow({ job, onViewInLibrary, onClear, onCancel }) {
  const isRunning = job.status === 'pending' || job.status === 'running'
  const isDone    = job.status === 'done'
  const isError   = job.status === 'error'
  const isAborted = job.status === 'aborted'

  const statusColor = isDone ? '#22c55e' : isError ? '#f87171' : isAborted ? '#6b7280' : 'var(--cs-accent)'
  const TypeIcon = TYPE_ICONS[job.contentType] || FileText

  return (
    <div style={{
      padding: '11px 16px',
      borderBottom: '1px solid var(--cs-border-sub)',
      display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {/* Type icon */}
        <span style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: 'var(--cs-surface3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--cs-text-sub)',
        }}>
          <TypeIcon size={14} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--cs-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{job.title || 'Untitled'}</div>
          <div style={{ fontSize: 10, color: 'var(--cs-text-muted)', marginTop: 1 }}>
            {isRunning ? (job.step || 'Processing…') : isDone ? 'Completed' : isAborted ? 'Cancelled' : 'Failed'}
          </div>
        </div>
        {/* Status indicator */}
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: statusColor, flexShrink: 0,
        }} />
        {isRunning && <Spin />}
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ position: 'relative', height: 3, background: 'var(--cs-surface3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'var(--cs-accent)',
              width: `${job.progress}%`, transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--cs-accent)', fontWeight: 600 }}>{job.progress}%</span>
            <button onClick={onCancel} style={{
              padding: '2px 8px', borderRadius: 4,
              border: '1px solid rgba(239,68,68,0.25)',
              background: 'rgba(239,68,68,0.07)', color: '#dc4040',
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {isDone && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onViewInLibrary} style={{
            flex: 1, padding: '5px 10px', borderRadius: 6, border: 'none',
            background: 'var(--cs-accent-soft)', color: 'var(--cs-accent)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            View in Library <ChevronRight size={11} />
          </button>
          <button onClick={onClear} style={{
            width: 28, borderRadius: 6, border: '1px solid var(--cs-border)',
            background: 'transparent', color: 'var(--cs-text-muted)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={13} /></button>
        </div>
      )}

      {(isError || isAborted) && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 11, color: isAborted ? 'var(--cs-text-muted)' : '#dc4040' }}>
            {job.detail || (isAborted ? 'Generation cancelled' : 'Generation failed')}
          </span>
          <button onClick={onClear} style={{
            padding: '3px 8px', borderRadius: 5, border: '1px solid var(--cs-border)',
            background: 'transparent', color: 'var(--cs-text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center',
          }}><X size={12} /></button>
        </div>
      )}
    </div>
  )
}

// ─── Icon button ──────────────────────────────────────────────────────────────
function IconBtn({ onClick, title, active, children }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 34, height: 34, borderRadius: 9,
        border: '1px solid',
        borderColor: active || hov ? 'var(--cs-accent-line)' : 'var(--cs-border)',
        background: active ? 'var(--cs-accent-soft)' : hov ? 'var(--cs-hover)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s', position: 'relative', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ─── Main TopBar ──────────────────────────────────────────────────────────────
export default function TopBar({ onMenuClick }) {
  const { isDark, toggle } = useTheme()
  const { jobs, badgeCount, markAllSeen, clearJob, cancelJob, clearAllDone } = useGeneration()
  const navigate = useNavigate()
  const isMobile = useMobile()

  const [open, setOpen]   = useState(false)
  const dropRef           = useRef()

  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasJobs    = jobs.length > 0
  const activeCount = jobs.filter(j => j.status === 'pending' || j.status === 'running').length

  const handleToggle = () => {
    if (!open) markAllSeen()
    setOpen(s => !s)
  }

  return (
    <header className="cs-topbar-glass" style={{
      height: 'var(--cs-topbar-h)',
      borderBottom: '1px solid var(--cs-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px 0 16px', flexShrink: 0,
      position: 'relative', zIndex: 40,
    }}>

      {/* Left: hamburger (mobile) + breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {isMobile && (
          <IconBtn onClick={onMenuClick} title="Menu">
            <Menu size={15} color="var(--cs-text-sub)" />
          </IconBtn>
        )}
        {/* Subtle breadcrumb on desktop */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: '#ffffff', border: '1px solid var(--cs-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img src="/rodschinson-mark.png" alt="Rodschinson" style={{ width: 18, height: 18, objectFit: 'contain' }} />
            </div>
            <span style={{ color: 'var(--cs-text-sub)', fontSize: 13, fontWeight: 500, letterSpacing: '0.01em' }}>
              Content Studio
            </span>
          </div>
        )}
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Generation queue */}
        <div ref={dropRef} style={{ position: 'relative' }}>
          <IconBtn onClick={handleToggle} title="Generation queue" active={open}>
            {activeCount > 0 ? <Spin size={15} /> : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--cs-text-sub)" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            )}
            {badgeCount > 0 && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                minWidth: 16, height: 16, borderRadius: 8, padding: '0 3px',
                background: activeCount > 0 ? 'var(--cs-accent)' : '#22c55e',
                color: '#fff', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--cs-bg)',
              }}>
                {badgeCount}
              </span>
            )}
          </IconBtn>

          {/* Dropdown */}
          {open && (
            <div style={{
              position: 'absolute', top: 42, right: 0, zIndex: 100,
              background: 'var(--cs-surface)',
              border: '1px solid var(--cs-border)',
              borderRadius: 12, width: 320,
              boxShadow: 'var(--cs-shadow-lg)',
              overflow: 'hidden', animation: 'slidedown 0.14s ease',
            }}>
              {/* Header */}
              <div style={{
                padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid var(--cs-border)',
                background: 'var(--cs-surface2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 700 }}>Queue</span>
                  {activeCount > 0 && (
                    <span style={{
                      padding: '1px 7px', borderRadius: 20,
                      background: 'var(--cs-accent-soft)', color: 'var(--cs-accent)',
                      fontSize: 10, fontWeight: 600,
                    }}>
                      {activeCount} running
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {jobs.some(j => ['done','error','aborted'].includes(j.status)) && (
                    <button onClick={clearAllDone} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--cs-text-muted)', fontSize: 11, padding: 0,
                    }}>
                      Clear done
                    </button>
                  )}
                  {hasJobs && (
                    <button onClick={() => { navigate('/library'); setOpen(false) }} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--cs-accent)', fontSize: 11, padding: 0,
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      Library <ChevronRight size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Job list */}
              {!hasJobs ? (
                <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--cs-text-muted)' }}>
                    <Inbox size={22} />
                  </div>
                  <div style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>No active generations</div>
                </div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {jobs.map(job => (
                    <JobRow
                      key={job.job_id}
                      job={job}
                      onViewInLibrary={() => { clearJob(job.job_id); setOpen(false); navigate('/library') }}
                      onClear={() => clearJob(job.job_id)}
                      onCancel={() => cancelJob(job.job_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <IconBtn onClick={toggle} title={isDark ? 'Light mode' : 'Dark mode'}>
          {isDark
            ? <Sun size={14} color="var(--cs-text-sub)" />
            : <Moon size={14} color="var(--cs-text-sub)" />
          }
        </IconBtn>

        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'var(--cs-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.5px',
          cursor: 'pointer', userSelect: 'none',
          boxShadow: 'var(--cs-shadow-sm)',
        }}>RC</div>
      </div>
    </header>
  )
}
