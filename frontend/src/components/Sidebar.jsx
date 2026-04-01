import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { PlusSquare, Library, CalendarDays, BarChart3, ExternalLink, Sun, Moon } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useMobile } from '../hooks/useMobile'

const NAV = [
  { to: '/',          icon: PlusSquare,   label: 'New Content' },
  { to: '/library',   icon: Library,      label: 'Library'     },
  { to: '/schedule',  icon: CalendarDays, label: 'Schedule'    },
  { to: '/analytics', icon: BarChart3,    label: 'Analytics'   },
]

function MetricoolLink() {
  const [hover, setHover] = useState(false)
  return (
    <a
      href="https://app.metricool.com"
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px',
        textDecoration: 'none',
        color: hover ? '#00B6FF' : 'var(--cs-text-sub)',
        fontWeight: 400,
        fontSize: 14,
        borderLeft: '2px solid transparent',
        background: hover ? 'rgba(0,182,255,0.06)' : 'transparent',
        transition: 'color 0.15s, background 0.15s',
      }}
    >
      {/* Metricool "M" mark */}
      <span style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        background: hover ? '#00B6FF' : 'var(--cs-text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 10, fontWeight: 800, lineHeight: 1,
        transition: 'background 0.15s',
      }}>M</span>
      Metricool
      <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
    </a>
  )
}

function SidebarContent({ onClose }) {
  const { isDark, toggle } = useTheme()
  const isMobile = useMobile()

  return (
    <aside style={{
      width: 220,
      minWidth: 220,
      background: 'var(--cs-surface)',
      borderRight: '1px solid var(--cs-border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      transition: 'background 0.25s',
      height: '100%',
      position: 'relative',
    }}>

      {/* Brand header */}
      <div style={{
        padding: '22px 20px 18px',
        borderBottom: '1px solid var(--cs-border)',
        background: 'linear-gradient(160deg, rgba(8,49,111,0.08) 0%, transparent 100%)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #08316F 0%, #00B6FF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,182,255,0.35)',
          }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '-0.5px' }}>R</span>
          </div>
          <div>
            <div style={{ color: 'var(--cs-text)', fontWeight: 700, fontSize: 13, lineHeight: 1.2, letterSpacing: '-0.2px' }}>
              Rodschinson
            </div>
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em' }}>
              CONTENT STUDIO
            </div>
          </div>
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 16, right: 14,
              width: 26, height: 26, borderRadius: 6,
              border: '1px solid var(--cs-border)',
              background: 'var(--cs-hover)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--cs-text-sub)', fontSize: 14, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {/* Nav section */}
      <div style={{ padding: '10px 0', flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={isMobile ? onClose : undefined}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 20px',
            textDecoration: 'none',
            color: isActive ? '#00B6FF' : 'var(--cs-text-sub)',
            fontWeight: isActive ? 600 : 400,
            fontSize: 14,
            borderLeft: isActive ? '2px solid #00B6FF' : '2px solid transparent',
            background: isActive ? 'rgba(0,182,255,0.06)' : 'transparent',
            transition: 'color 0.15s, background 0.15s',
          })}
        >
          <Icon size={18} />
          {label}
        </NavLink>
      ))}

      {/* Divider */}
      <div style={{ margin: '6px 20px', borderTop: '1px solid var(--cs-border)' }} />

      <MetricoolLink />
      </div>

      {/* Theme toggle at bottom */}
      <button
        onClick={toggle}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px', border: 'none', cursor: 'pointer',
          background: 'transparent', width: '100%', textAlign: 'left',
          color: 'var(--cs-text-muted)', fontSize: 13,
          transition: 'color 0.15s',
        }}
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
        {isDark ? 'Light mode' : 'Dark mode'}
      </button>
    </aside>
  )
}

export default function Sidebar({ mobileOpen, onClose }) {
  const isMobile = useMobile()

  if (!isMobile) {
    return <SidebarContent onClose={onClose} />
  }

  // Mobile: render as slide-out drawer with backdrop
  return (
    <>
      {/* Backdrop */}
      {mobileOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
            animation: 'fadein 0.15s ease',
          }}
        />
      )}
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 51,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: mobileOpen ? '4px 0 24px rgba(0,0,0,0.25)' : 'none',
      }}>
        <SidebarContent onClose={onClose} />
      </div>
    </>
  )
}
