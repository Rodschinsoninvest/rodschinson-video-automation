import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { GenerationProvider } from './contexts/GenerationContext'
import { ToastProvider } from './contexts/ToastContext'
import { BrandProvider } from './contexts/BrandContext'
import Layout from './components/Layout'
import NewContent from './pages/NewContent'
import Library from './pages/Library'
import Schedule from './pages/Schedule'
import Analytics from './pages/Analytics'
import Brands from './pages/Brands'

export default function App() {
  return (
    <ThemeProvider>
      <GenerationProvider>
        <ToastProvider>
          <BrandProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<NewContent />} />
                  <Route path="library"   element={<Library />} />
                  <Route path="schedule"  element={<Schedule />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="brands"    element={<Brands />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </BrandProvider>
        </ToastProvider>
      </GenerationProvider>
    </ThemeProvider>
  )
}
