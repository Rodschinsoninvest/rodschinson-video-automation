import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { PlusSquare, Library, CalendarDays, BarChart3, ExternalLink, Sun, Moon, Building2, Layers, Settings, LogOut, ChevronRight, Sparkles, Landmark } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useMobile } from '../hooks/useMobile'

const NAV_MAIN = [
  { to: '/',          icon: PlusSquare,   label: 'New Content' },
  { to: '/library',   icon: Library,      label: 'Library'     },
  { to: '/schedule',  icon: CalendarDays, label: 'Schedule'    },
  { to: '/analytics', icon: BarChart3,    label: 'Analytics'   },
  { to: '/strategy',  icon: Sparkles,     label: 'Strategy'    },
  { to: '/properties', icon: Landmark,    label: 'Properties'  },
]
const NAV_BRAND = [
  { to: '/brands',    icon: Building2,    label: 'Brands'      },
  { to: '/templates', icon: Layers,       label: 'Templates'   },
]

// ── Shared styles ──────────────────────────────────────────────────────────────
const S = {
  sidebar: {
    width: 'var(--cs-sidebar-w)',
    minWidth: 'var(--cs-sidebar-w)',
    background: 'var(--cs-sidebar-bg)',
    borderRight: '1px solid var(--cs-sidebar-border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  // Aurora accent line at top
  aurora: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    background: 'linear-gradient(90deg, transparent 0%, #08316F 25%, #00B6FF 60%, #C8A96E 85%, transparent 100%)',
    opacity: 0.7,
    animation: 'aurora 4s ease-in-out infinite',
  },
}

// ── Nav item ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars -- Icon is rendered as <Icon/> in the JSX below
function NavItem({ to, icon: Icon, label, onClick, end }) {
  const [hov, setHov] = useState(false)
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        margin: '1px 8px',
        borderRadius: 8,
        textDecoration: 'none',
        color: isActive
          ? 'var(--cs-sidebar-active)'
          : hov ? 'rgba(255,255,255,0.75)' : 'var(--cs-sidebar-text)',
        fontWeight: isActive ? 600 : 400,
        fontSize: 13.5,
        background: isActive
          ? 'var(--cs-sidebar-active-bg)'
          : hov ? 'var(--cs-sidebar-hover)' : 'transparent',
        transition: 'all 0.14s',
        position: 'relative',
        letterSpacing: '-0.1px',
      })}
    >
      {({ isActive }) => (
        <>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 18, height: 18, flexShrink: 0,
            color: isActive ? '#00B6FF' : 'inherit',
            transition: 'color 0.14s',
          }}>
            <Icon size={15} strokeWidth={isActive ? 2.2 : 1.7} />
          </span>
          <span style={{ flex: 1 }}>{label}</span>
          {isActive && (
            <span style={{
              width: 4, height: 4, borderRadius: '50%',
              background: '#00B6FF',
              boxShadow: '0 0 6px #00B6FF',
              flexShrink: 0,
            }} />
          )}
        </>
      )}
    </NavLink>
  )
}

// ── External link item ─────────────────────────────────────────────────────────
function ExtItem({ href, label, accent }) {
  const [hov, setHov] = useState(false)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px', margin: '1px 8px', borderRadius: 8,
        textDecoration: 'none',
        color: hov ? 'rgba(255,255,255,0.75)' : 'var(--cs-sidebar-text)',
        fontSize: 13.5,
        background: hov ? 'var(--cs-sidebar-hover)' : 'transparent',
        transition: 'all 0.14s',
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        background: hov ? accent : 'rgba(255,255,255,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 9, fontWeight: 800,
        transition: 'background 0.14s',
      }}>M</span>
      <span style={{ flex: 1 }}>{label}</span>
      <ExternalLink size={11} style={{ opacity: 0.35 }} />
    </a>
  )
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      padding: '14px 22px 5px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.1em',
      color: 'rgba(255,255,255,0.2)',
      textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

// ── Main sidebar content ───────────────────────────────────────────────────────
function SidebarContent({ onClose }) {
  const { isDark, toggle } = useTheme()
  const { username, logout } = useAuth()
  const isMobile = useMobile()

  return (
    <aside style={S.sidebar}>

      {/* Aurora top line */}
      <div style={S.aurora} />

      {/* Brand header */}
      <div style={{
        padding: '20px 16px 16px',
        borderBottom: '1px solid var(--cs-sidebar-border)',
        flexShrink: 0,
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Logo mark */}
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(145deg, #0a3d8f 0%, #00B6FF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 0 1px rgba(0,182,255,0.3), 0 4px 12px rgba(0,182,255,0.25)',
          }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, letterSpacing: '-0.5px' }}>R</span>
          </div>
          <div>
            <div style={{
              color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: 13.5,
              letterSpacing: '-0.3px', lineHeight: 1.2,
            }}>
              Rodschinson
            </div>
            <div style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.25)', marginTop: 1,
            }}>
              CONTENT STUDIO
            </div>
          </div>

          {isMobile && (
            <button
              onClick={onClose}
              style={{
                marginLeft: 'auto', width: 24, height: 24, borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.5)', fontSize: 14,
              }}
            >×</button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 8, overflowY: 'auto' }}>

        <SectionLabel>Workspace</SectionLabel>
        {NAV_MAIN.map(({ to, icon, label }) => (
          <NavItem key={to} to={to} icon={icon} label={label} end={to === '/'} onClick={isMobile ? onClose : undefined} />
        ))}

        <SectionLabel>Brand</SectionLabel>
        {NAV_BRAND.map(({ to, icon, label }) => (
          <NavItem key={to} to={to} icon={icon} label={label} onClick={isMobile ? onClose : undefined} />
        ))}

        <SectionLabel>Integrations</SectionLabel>
        <ExtItem href="https://app.metricool.com" label="Metricool" accent="#00B6FF" />
      </div>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid var(--cs-sidebar-border)', paddingBottom: 4 }}>

        {/* Settings */}
        <NavItem to="/settings" icon={Settings} label="Settings" onClick={isMobile ? onClose : undefined} />

        {/* Divider */}
        <div style={{ margin: '4px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }} />

        {/* User row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 16px', margin: '1px 8px',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: 'linear-gradient(135deg, #08316F, #00B6FF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 10, letterSpacing: '0.5px',
          }}>
            {(username || 'A').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {username || 'admin'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Administrator</div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.25)', padding: 4, display: 'flex',
              borderRadius: 5, transition: 'color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
          >
            <LogOut size={12} />
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '7px 16px', margin: '1px 8px', borderRadius: 8,
            border: 'none', cursor: 'pointer', width: 'calc(100% - 16px)',
            background: 'transparent', textAlign: 'left',
            color: 'rgba(255,255,255,0.3)', fontSize: 12,
            transition: 'background 0.14s, color 0.14s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
        >
          {isDark
            ? <Sun size={13} style={{ flexShrink: 0 }} />
            : <Moon size={13} style={{ flexShrink: 0 }} />
          }
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </aside>
  )
}

// ── Export ─────────────────────────────────────────────────────────────────────
export default function Sidebar({ mobileOpen, onClose }) {
  const isMobile = useMobile()

  if (!isMobile) return <SidebarContent onClose={onClose} />

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            animation: 'fadein 0.15s ease',
          }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 51,
        transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: mobileOpen ? '6px 0 40px rgba(0,0,0,0.4)' : 'none',
      }}>
        <SidebarContent onClose={onClose} />
      </div>
    </>
  )
}
