import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [token, setToken]       = useState(() => localStorage.getItem('cs_auth_token'))
  const [username, setUsername] = useState(null)
  const [checking, setChecking] = useState(true)  // verifying token on mount

  const verify = useCallback(async (t) => {
    if (!t) { setChecking(false); return }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${t}` },
        signal: controller.signal,
      })
      if (res.ok) {
        const { username: u } = await res.json()
        setUsername(u)
        setToken(t)
      } else {
        localStorage.removeItem('cs_auth_token')
        setToken(null)
        setUsername(null)
      }
    } catch {
      // network error or timeout → keep token, let pages handle 401s
      setUsername(null)
    } finally {
      clearTimeout(timeout)
      setChecking(false)
    }
  }, [])

  useEffect(() => { verify(token) }, [])   // eslint-disable-line

  const login = async (usernameInput, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput, password }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'Invalid credentials')
    }
    const { token: t, username: u } = await res.json()
    localStorage.setItem('cs_auth_token', t)
    setToken(t)
    setUsername(u)
    return u
  }

  const logout = () => {
    localStorage.removeItem('cs_auth_token')
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider value={{ token, username, checking, login, logout, isAuth: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
