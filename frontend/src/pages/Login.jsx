import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Sun, Moon, LogIn, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--cs-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      position: 'relative',
    }}>
      {/* Theme toggle */}
      <button
        onClick={toggle}
        style={{
          position: 'absolute', top: 20, right: 20,
          background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
          borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
          color: 'var(--cs-text-sub)', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 13,
        }}
      >
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
        {isDark ? 'Light' : 'Dark'}
      </button>

      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img
            src="/rodschinson-wordmark.png"
            alt="Rodschinson Investment"
            style={{ height: 46, width: 'auto', margin: '0 auto 14px', display: 'block' }}
          />
          <p style={{
            color: 'var(--cs-text-muted)', fontSize: 11, margin: 0,
            letterSpacing: '0.22em', fontWeight: 600, textTransform: 'uppercase',
          }}>
            Content Studio
          </p>
        </div>

        {/* Card */}
        <div className="cs-card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cs-text)', margin: '0 0 6px' }}>
            Sign in
          </h2>
          <p style={{ fontSize: 13, color: 'var(--cs-text-sub)', margin: '0 0 28px' }}>
            Access your content workspace
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Username */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--cs-text-sub)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
                required
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)',
                  borderRadius: 8, color: 'var(--cs-text)', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--cs-accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--cs-border)'}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--cs-text-sub)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: '100%', padding: '10px 42px 10px 14px',
                    background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)',
                    borderRadius: 8, color: 'var(--cs-text)', fontSize: 14,
                    outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--cs-accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--cs-border)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--cs-text-muted)', padding: 0, display: 'flex',
                  }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                color: '#f87171', fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                padding: '12px 24px', borderRadius: 8,
                background: 'var(--cs-accent)', opacity: loading ? 0.65 : 1,
                border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                color: '#fff', fontSize: 14, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity 0.15s, background 0.15s',
              }}
            >
              {loading ? (
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
              ) : (
                <LogIn size={16} />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--cs-text-muted)', marginTop: 24 }}>
          Rodschinson Investment · Content Studio
        </p>
      </div>
    </div>
  )
}
