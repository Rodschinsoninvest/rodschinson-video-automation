import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from './TopBar'
import Sidebar from './Sidebar'

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--cs-bg)' }}>
      <TopBar onMenuClick={() => setMobileOpen(o => !o)} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
