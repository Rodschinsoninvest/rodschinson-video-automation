/**
 * GenerationContext — global background job tracking.
 * Polling continues even when the user navigates away from NewContent.
 * Jobs are persisted to sessionStorage so they survive route changes.
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const GenerationContext = createContext()

const MAX_JOBS       = 6
const POLL_MS        = 2000
const MAX_NET_ERRORS = 5    // after this many consecutive failures, mark job as connection-lost
const TERMINAL       = new Set(['done', 'error', 'aborted'])
const STALE_MS       = 2 * 60 * 60 * 1000  // 2 hours — jobs stuck pending longer than this are stale

function loadPersistedJobs() {
  try {
    const jobs = JSON.parse(sessionStorage.getItem('cs-active-jobs') || '[]')
    const now = Date.now()
    // Mark old non-terminal jobs as stale so they don't pollute the queue forever
    return jobs.map(j => {
      if (!TERMINAL.has(j.status) && j.startedAt && now - j.startedAt > STALE_MS) {
        return { ...j, status: 'error', step: 'Timed out', detail: 'Job was still queued from a previous session.' }
      }
      return j
    })
  } catch { return [] }
}

function persistJobs(jobs) {
  sessionStorage.setItem('cs-active-jobs', JSON.stringify(jobs))
}

export function GenerationProvider({ children }) {
  const [jobs, setJobs] = useState(loadPersistedJobs)
  const intervalsRef  = useRef({})  // job_id → intervalId
  const netErrorsRef  = useRef({})  // job_id → consecutive network error count

  // ── Poll a single job ────────────────────────────────────────────────────────
  const _poll = useCallback((job_id) => {
    if (intervalsRef.current[job_id]) return  // already polling
    netErrorsRef.current[job_id] = 0

    intervalsRef.current[job_id] = setInterval(async () => {
      try {
        const res  = await fetch(`/api/jobs/${job_id}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        netErrorsRef.current[job_id] = 0  // reset on success

        setJobs(prev => {
          const updated = prev.map(j =>
            j.job_id === job_id
              ? { ...j, status: data.status, progress: data.progress ?? 0,
                  step: data.step ?? '', detail: data.detail ?? j.detail ?? '' }
              : j
          )
          persistJobs(updated)
          return updated
        })

        if (TERMINAL.has(data.status)) {
          clearInterval(intervalsRef.current[job_id])
          delete intervalsRef.current[job_id]
        }
      } catch {
        // Network error — count consecutive failures, keep retrying until threshold
        netErrorsRef.current[job_id] = (netErrorsRef.current[job_id] || 0) + 1
        if (netErrorsRef.current[job_id] >= MAX_NET_ERRORS) {
          clearInterval(intervalsRef.current[job_id])
          delete intervalsRef.current[job_id]
          // Mark as error locally so the UI shows a dismissable state
          setJobs(prev => {
            const updated = prev.map(j =>
              j.job_id === job_id && !TERMINAL.has(j.status)
                ? { ...j, status: 'error', step: 'Failed',
                    detail: 'Lost connection to backend. The server may have restarted — please retry.' }
                : j
            )
            persistJobs(updated)
            return updated
          })
        }
      }
    }, POLL_MS)
  }, [])

  // Resume polling for any unfinished jobs on mount (after page reload / navigation)
  useEffect(() => {
    jobs.forEach(j => {
      if (!TERMINAL.has(j.status)) {
        _poll(j.job_id)
      }
    })
    return () => Object.values(intervalsRef.current).forEach(clearInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Public API ───────────────────────────────────────────────────────────────

  /** Call this right after /api/generate returns a job_id */
  const trackJob = useCallback((job_id, { title, contentType }) => {
    const newJob = {
      job_id, title, contentType,
      status: 'pending', progress: 0, step: 'Queued',
      startedAt: Date.now(),
      seen: false,      // user has acknowledged this completion
    }
    setJobs(prev => {
      const deduped = prev.filter(j => j.job_id !== job_id)
      const updated = [newJob, ...deduped].slice(0, MAX_JOBS)
      persistJobs(updated)
      return updated
    })
    _poll(job_id)
  }, [_poll])

  /** Mark a completed job as "seen" so the notification badge clears */
  const markSeen = useCallback((job_id) => {
    setJobs(prev => {
      const updated = prev.map(j => j.job_id === job_id ? { ...j, seen: true } : j)
      persistJobs(updated)
      return updated
    })
  }, [])

  const markAllSeen = useCallback(() => {
    setJobs(prev => {
      const updated = prev.map(j => ({ ...j, seen: true }))
      persistJobs(updated)
      return updated
    })
  }, [])

  const clearJob = useCallback((job_id) => {
    clearInterval(intervalsRef.current[job_id])
    delete intervalsRef.current[job_id]
    setJobs(prev => {
      const updated = prev.filter(j => j.job_id !== job_id)
      persistJobs(updated)
      return updated
    })
  }, [])

  const cancelJob = useCallback(async (job_id) => {
    // Optimistically mark as aborted in UI immediately
    setJobs(prev => {
      const updated = prev.map(j =>
        j.job_id === job_id ? { ...j, status: 'aborted', step: 'Cancelled', detail: 'Cancelled by user.' } : j
      )
      persistJobs(updated)
      return updated
    })
    clearInterval(intervalsRef.current[job_id])
    delete intervalsRef.current[job_id]
    // Fire and forget — backend abort
    try { await fetch(`/api/jobs/${job_id}/abort`, { method: 'POST' }) } catch { /* ignore */ }
  }, [])

  const clearAllDone = useCallback(() => {
    setJobs(prev => {
      const updated = prev.filter(j => j.status === 'pending' || j.status === 'running')
      persistJobs(updated)
      return updated
    })
  }, [])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeJobs  = jobs.filter(j => j.status === 'pending' || j.status === 'running')
  const doneJobs    = jobs.filter(j => j.status === 'done')
  const unseenDone  = doneJobs.filter(j => !j.seen)
  const hasActive   = activeJobs.length > 0
  const badgeCount  = activeJobs.length + unseenDone.length

  return (
    <GenerationContext.Provider value={{
      jobs, activeJobs, doneJobs, unseenDone,
      hasActive, badgeCount,
      trackJob, markSeen, markAllSeen, clearJob, cancelJob, clearAllDone,
    }}>
      {children}
    </GenerationContext.Provider>
  )
}

export const useGeneration = () => useContext(GenerationContext)
