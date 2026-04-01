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
      padding: '24px 0',
      gap: 2,
      transition: 'background 0.2s',
      height: '100%',
    }}>
      {/* Mobile close button */}
      {isMobile && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 28, height: 28, borderRadius: 6,
            border: '1px solid var(--cs-border)',
            background: 'var(--cs-hover)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--cs-text-sub)', fontSize: 16, lineHeight: 1,
          }}
        >×</button>
      )}

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
      <div style={{ margin: '10px 20px', borderTop: '1px solid var(--cs-border)' }} />

      <MetricoolLink />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

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
