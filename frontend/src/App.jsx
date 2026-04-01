import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { GenerationProvider } from './contexts/GenerationContext'
import { ToastProvider } from './contexts/ToastContext'
import Layout from './components/Layout'
import NewContent from './pages/NewContent'
import Library from './pages/Library'
import Schedule from './pages/Schedule'
import Analytics from './pages/Analytics'

export default function App() {
  return (
    <ThemeProvider>
      <GenerationProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<NewContent />} />
                <Route path="library"   element={<Library />} />
                <Route path="schedule"  element={<Schedule />} />
                <Route path="analytics" element={<Analytics />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </GenerationProvider>
    </ThemeProvider>
  )
}
