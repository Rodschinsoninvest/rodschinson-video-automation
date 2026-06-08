import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider }      from './contexts/ThemeContext'
import { GenerationProvider } from './contexts/GenerationContext'
import { ToastProvider }      from './contexts/ToastContext'
import { BrandProvider }      from './contexts/BrandContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout      from './components/Layout'
import NewContent  from './pages/NewContent'
import Library     from './pages/Library'
import Schedule    from './pages/Schedule'
import Analytics   from './pages/Analytics'
import Brands      from './pages/Brands'
import Templates   from './pages/Templates'
import Settings    from './pages/Settings'
import Login       from './pages/Login'
import Strategy    from './pages/Strategy'
import Properties  from './pages/Properties'
import TeaserEditor from './pages/TeaserEditor'

function PrivateRoute({ children }) {
  const { isAuth, checking } = useAuth()
  const location = useLocation()
  if (checking) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--cs-bg)',
      }}>
        <span style={{
          width: 28, height: 28, border: '3px solid rgba(0,182,255,0.25)',
          borderTopColor: '#00B6FF', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite', display: 'inline-block',
        }} />
      </div>
    )
  }
  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GenerationProvider>
          <ToastProvider>
            <BrandProvider>
              <BrowserRouter>
                <Routes>
                  {/* Public */}
                  <Route path="/login" element={<Login />} />

                  {/* Protected */}
                  <Route path="/" element={
                    <PrivateRoute>
                      <Layout />
                    </PrivateRoute>
                  }>
                    <Route index              element={<NewContent />} />
                    <Route path="library"     element={<Library />} />
                    <Route path="schedule"    element={<Schedule />} />
                    <Route path="analytics"   element={<Analytics />} />
                    <Route path="strategy"    element={<Strategy />} />
                    <Route path="properties"  element={<Properties />} />
                    <Route path="brands"      element={<Brands />} />
                    <Route path="templates"   element={<Templates />} />
                    <Route path="settings"    element={<Settings />} />
                    <Route path="teaser-editor/:jobId" element={<TeaserEditor />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </BrandProvider>
          </ToastProvider>
        </GenerationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
