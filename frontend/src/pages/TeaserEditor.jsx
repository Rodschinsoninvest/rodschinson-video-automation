import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { apiFetch } from '../utils/apiFetch'

// ── Section schema ───────────────────────────────────────────────────────────
// Each section defines: id (must match `currentSection` in teaser_long.html),
// label (for the rail + visibility toggle), and the field groups it owns.
const SECTIONS = [
  { id: 'cover',        label: 'Cover',          icon: '⬛' },
  { id: 'activa',       label: 'Description',    icon: '📝' },
  { id: 'details',      label: 'Financial & Specs', icon: '📊' },
  { id: 'localisation', label: 'Localisation',   icon: '📍' },
  { id: 'aerial',       label: 'Aerial view',    icon: '🛰️' },
  { id: 'gallery',      label: 'Gallery',        icon: '🖼️' },
  { id: 'plans',        label: 'Plans',          icon: '📐' },
  { id: 'sales',        label: 'Sales & Contact',icon: '🤝' },
]

const TEXT_FIELDS_BY_SECTION = {
  cover: [
    ['title',         'Property title (long)'],
    ['cover_badge',   'Cover badge (leave empty to hide)'],
    ['reference',     'Reference'],
    ['price',         'Price (cover)'],
    ['price_label',   'Price label'],
  ],
  activa: [
    ['title',             'Title (description page)'],
    ['address',           'Full address'],
    ['address_label',     'Address label'],
    ['description_label', '"Description" label'],
    ['price_label',       '"Price" label'],
    ['description',       'Description (raw)'],
  ],
  details: [
    ['payment_terms', 'Payment terms / transaction structuring'],
  ],
  localisation: [
    ['map_url',       'Google Maps URL (file:// or https://)'],
    ['map_link_text', '"View on Maps" link text'],
  ],
  aerial: [
    ['aerial_view',      'Aerial image path (file://)'],
    ['boundary_caption', 'Boundary caption'],
    ['tab_aerial',       'Tab label'],
  ],
  gallery: [
    ['tab_photos', 'Tab label'],
  ],
  plans: [
    ['plans_label', 'Plans label'],
  ],
  sales: [
    ['agent_name',       'Agent name'],
    ['agent_role',       'Agent role'],
    ['agent_phone',      'Agent phone'],
    ['agent_email',      'Agent email'],
    ['infos_label',      'Infos label'],
    ['docs_label',       'Docs button label'],
    ['docs_helper',      'Docs helper text'],
    ['sharepoint_url',   'SharePoint URL'],
    ['sharepoint_label', 'SharePoint label'],
    ['expertise_url',    'Expertise PDF URL'],
    ['disclaimer',       'Footer disclaimer'],
  ],
}

const ROW_GROUPS_BY_SECTION = {
  activa: [
    { key: 'extra_bullets', label: 'Extra bullets (description page)', cols: [{ key: 'value', label: 'Bullet', span: 1 }], primitive: true },
  ],
  details: [
    { key: 'key_metrics',           label: 'KPI strip (cover-of-details)', cols: [['label','Label'],['value','Value'],['sub','Sub']] },
    { key: 'valuation_rows',        label: 'Valuation rows',               cols: [['label','Label'],['value','Value']] },
    { key: 'financial_summary_rows',label: 'Financial summary rows',       cols: [['label','Label'],['value','Value']] },
    { key: 'rental_income_rows',    label: 'Rental income rows',           cols: [['label','Label'],['value','Value']] },
    { key: 'technical_specs_rows',  label: 'Technical specs',              cols: [['label','Label'],['value','Value']] },
    { key: 'lease_terms_rows',      label: 'Lease terms',                  cols: [['label','Label'],['value','Value']] },
    { key: 'surfaces',              label: 'Surfaces (floor / area)',      cols: [['floor','Floor'],['area','Area']] },
  ],
}

const IMAGE_FIELDS_BY_SECTION = {
  cover:        [['cover_photo', 'Cover photo']],
  activa:       [['activa_photo', 'Description page photo']],
  aerial:       [['aerial_view',  'Aerial image']],
  localisation: [['map_url',      'Map image']],
  sales:        [['sales_photo',  'Contact-page photo']],
}

// Plural image-list field (gallery, plans).
const IMAGE_LIST_BY_SECTION = {
  gallery: 'photos',
  plans:   'plans',
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fileUrlToFilename(url) {
  if (!url || typeof url !== 'string') return ''
  const s = url.split('/').pop() || ''
  return decodeURIComponent(s)
}

export default function TeaserEditor() {
  const { jobId } = useParams()
  const navigate  = useNavigate()
  const { dark }  = useTheme()
  const { toast } = useToast()

  const [loading, setLoading]   = useState(true)
  const [data, setData]         = useState(null)
  const [assets, setAssets]     = useState([])
  const [library, setLibrary]   = useState(null)
  const [shortId, setShortId]   = useState('')
  const [activeId, setActiveId] = useState('cover')
  const [dirty, setDirty]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [pdfBust, setPdfBust]   = useState(Date.now())
  const [error, setError]       = useState(null)
  const uploadRef = useRef(null)
  const galleryUploadRef = useRef(null)

  // ── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/long-teaser/${jobId}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Load failed (${res.status})`)
      }
      const payload = await res.json()
      const incoming = payload.data || {}
      // Default section_visibility (all true) so toggles render in a defined state.
      if (!incoming.section_visibility || typeof incoming.section_visibility !== 'object') {
        incoming.section_visibility = SECTIONS.reduce((acc, s) => ({ ...acc, [s.id]: true }), {})
      } else {
        SECTIONS.forEach(s => {
          if (incoming.section_visibility[s.id] === undefined) incoming.section_visibility[s.id] = true
        })
      }
      setData(incoming)
      setAssets(payload.assets || [])
      setLibrary(payload.library || null)
      setShortId(payload.short_id || jobId.slice(0, 8))
      setDirty(false)
    } catch (e) {
      setError(e.message)
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [jobId, toast])

  useEffect(() => { load() }, [load])

  // ── Mutation helpers ────────────────────────────────────────────────────
  const setField = (key, value) => {
    setData(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }
  const setVis = (sid, on) => {
    setData(prev => ({
      ...prev,
      section_visibility: { ...(prev.section_visibility || {}), [sid]: !!on },
    }))
    setDirty(true)
  }

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async ({ thenRegenerate = true } = {}) => {
    if (!data) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/long-teaser/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Save failed (${res.status})`)
      }
      setDirty(false)
      toast('Saved', 'success')
      if (thenRegenerate) await handleRegenerate()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Regenerate ──────────────────────────────────────────────────────────
  const handleRegenerate = async ({ regenerate_pptx = false } = {}) => {
    setRendering(true)
    setRenderProgress(20)
    try {
      const res = await apiFetch(`/api/long-teaser/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate_pptx }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Regenerate failed (${res.status})`)
      }
      const { job_id: renderJobId } = await res.json()
      // Poll
      const started = Date.now()
      while (Date.now() - started < 180_000) {
        await new Promise(r => setTimeout(r, 1500))
        const j = await apiFetch(`/api/jobs/${renderJobId}`)
        if (!j.ok) continue
        const job = await j.json()
        setRenderProgress(Math.max(20, Math.min(95, job.progress || 20)))
        if (job.status === 'done') {
          setRenderProgress(100)
          setPdfBust(Date.now())
          toast('PDF regenerated', 'success')
          return
        }
        if (job.status === 'error' || job.status === 'aborted') {
          throw new Error(job.detail || 'Render failed')
        }
      }
      throw new Error('Render timed out')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setRendering(false)
    }
  }

  // ── Asset upload (for single-image fields) ──────────────────────────────
  const [uploadTarget, setUploadTarget] = useState(null) // {key: fieldKey} or {listKey: 'photos'}
  const triggerUpload = (target) => {
    setUploadTarget(target)
    setTimeout(() => uploadRef.current?.click(), 0)
  }
  const handleUploadChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !uploadTarget) return
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch(`/api/long-teaser/${jobId}/assets`, { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Upload failed (${res.status})`)
      }
      const asset = await res.json()
      setAssets(prev => [...prev, { name: asset.name, size: asset.size, url: asset.url }])
      if (uploadTarget.key) {
        setField(uploadTarget.key, asset.url)
      } else if (uploadTarget.listKey) {
        const cur = Array.isArray(data?.[uploadTarget.listKey]) ? data[uploadTarget.listKey] : []
        setField(uploadTarget.listKey, [...cur, asset.url])
      }
      toast(`Uploaded ${asset.name}`, 'success')
    } catch (e2) {
      toast(e2.message, 'error')
    } finally {
      setUploadTarget(null)
    }
  }

  const handleGalleryMultiUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const listKey = IMAGE_LIST_BY_SECTION[activeId]
    if (!listKey) return
    let cur = Array.isArray(data?.[listKey]) ? [...data[listKey]] : []
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await apiFetch(`/api/long-teaser/${jobId}/assets`, { method: 'POST', body: fd })
        if (!res.ok) continue
        const asset = await res.json()
        setAssets(prev => [...prev, { name: asset.name, size: asset.size, url: asset.url }])
        cur.push(asset.url)
      } catch {/* noop, continue */}
    }
    setField(listKey, cur)
    toast(`Added ${files.length} file(s)`, 'success')
  }

  // Token-aware image: small wrapper that fetches the blob with Authorization header.
  const AuthImg = ({ url, ...rest }) => {
    const [src, setSrc] = useState('')
    useEffect(() => {
      let revoked = ''
      const name = fileUrlToFilename(url)
      if (!name) { setSrc(''); return }
      apiFetch(`/api/long-teaser/${jobId}/asset-blob/${encodeURIComponent(name)}`)
        .then(r => r.ok ? r.blob() : null)
        .then(b => { if (b) { const u = URL.createObjectURL(b); revoked = u; setSrc(u) } })
      return () => { if (revoked) URL.revokeObjectURL(revoked) }
    }, [url])
    return src ? <img src={src} {...rest} /> : <div {...rest} style={{ ...(rest.style||{}), background: 'rgba(0,0,0,0.05)' }} />
  }

  // ── Theme ───────────────────────────────────────────────────────────────
  const bg     = dark ? '#0d0d0d' : '#f7f7fa'
  const panel  = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const text   = dark ? '#fff' : '#0D1F3C'
  const muted  = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12,
    border: `1px solid ${border}`, background: panel, color: text, fontFamily: 'inherit',
  }
  const textareaStyle = { ...inputStyle, minHeight: 90, lineHeight: 1.5, resize: 'vertical' }

  // ── Body ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 40, color: text }}>Loading teaser…</div>
  }
  if (error) {
    return (
      <div style={{ padding: 40, color: text }}>
        <div style={{ marginBottom: 12 }}>Error: {error}</div>
        <button onClick={() => navigate('/library')} style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${border}`, background: panel, color: text, cursor: 'pointer' }}>Back to Library</button>
      </div>
    )
  }
  if (!data) return null

  const section = SECTIONS.find(s => s.id === activeId) || SECTIONS[0]
  const textFields = TEXT_FIELDS_BY_SECTION[activeId] || []
  const imgFields  = IMAGE_FIELDS_BY_SECTION[activeId] || []
  const rowGroups  = ROW_GROUPS_BY_SECTION[activeId] || []
  const galleryListKey = IMAGE_LIST_BY_SECTION[activeId]
  const visOn = data.section_visibility?.[activeId] !== false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: bg, color: text }}>
      {/* Hidden file inputs for asset uploads */}
      <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadChange} />
      <input ref={galleryUploadRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={handleGalleryMultiUpload} />

      {/* Top bar */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${border}`, background: panel, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/library')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', color: muted, cursor: 'pointer', fontSize: 12 }}>← Library</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{library?.title || data.title || 'Long Teaser'}</div>
          <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>ID {shortId} · {library?.language || data.language || ''} · {library?.brand || ''}{dirty ? ' · unsaved changes' : ''}</div>
        </div>
        {rendering && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: muted }}>
            <span>Rendering… {renderProgress}%</span>
            <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${renderProgress}%`, height: '100%', background: '#00B6FF', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
        <button onClick={() => handleSave({ thenRegenerate: false })} disabled={saving || rendering || !dirty} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${border}`, background: panel, color: muted, fontSize: 12, fontWeight: 600, cursor: saving || rendering || !dirty ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => handleSave({ thenRegenerate: true })} disabled={saving || rendering} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: saving || rendering ? 'rgba(8,49,111,0.4)' : 'linear-gradient(135deg,#08316F,#0a4a9a)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving || rendering ? 'not-allowed' : 'pointer' }}>
          {saving || rendering ? 'Working…' : 'Save & Regenerate'}
        </button>
        <button onClick={() => handleRegenerate({ regenerate_pptx: true })} disabled={saving || rendering} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', color: muted, fontSize: 11, cursor: saving || rendering ? 'not-allowed' : 'pointer' }} title="Re-render PDF and PPTX from current saved JSON">
          + PPTX
        </button>
      </div>

      {/* Main 3-pane */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr 460px', minHeight: 0 }}>
        {/* Section rail */}
        <div style={{ borderRight: `1px solid ${border}`, background: panel, overflowY: 'auto' }}>
          {SECTIONS.map(s => {
            const on = activeId === s.id
            const visible = data.section_visibility?.[s.id] !== false
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${border}` }}>
                <button onClick={() => setActiveId(s.id)} style={{ flex: 1, padding: '12px 14px', border: 'none', background: on ? (dark ? 'rgba(0,182,255,0.12)' : 'rgba(8,49,111,0.07)') : 'transparent', color: on ? '#00B6FF' : text, fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ opacity: visible ? 1 : 0.35 }}>{s.icon}</span>
                  <span style={{ opacity: visible ? 1 : 0.45, textDecoration: visible ? 'none' : 'line-through' }}>{s.label}</span>
                </button>
                <label style={{ padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title={visible ? 'Hide this page in the PDF' : 'Show this page in the PDF'}>
                  <input type="checkbox" checked={visible} onChange={e => setVis(s.id, e.target.checked)} style={{ accentColor: '#00B6FF' }} />
                </label>
              </div>
            )
          })}
        </div>

        {/* Editor pane */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: text }}>{section.icon} {section.label}</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={visOn} onChange={e => setVis(activeId, e.target.checked)} style={{ accentColor: '#00B6FF' }} />
              Include this page in the PDF
            </label>
          </div>

          {/* Image fields */}
          {imgFields.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>Images</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {imgFields.map(([key, label]) => {
                  const url = data[key] || ''
                  return (
                    <div key={key} style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 10, background: panel }}>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: text }}>{label}</div>
                      <div style={{ width: '100%', height: 120, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.05)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {url ? <AuthImg url={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: muted }}>No image</span>}
                      </div>
                      <div style={{ fontSize: 10, color: muted, marginBottom: 6, wordBreak: 'break-all' }}>{fileUrlToFilename(url) || '—'}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => triggerUpload({ key })} style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: `1px solid ${border}`, background: 'transparent', color: '#00B6FF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↑ Replace</button>
                        {url && <button onClick={() => setField(key, '')} style={{ padding: '6px 10px', borderRadius: 5, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Clear</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Gallery / Plans (image list) */}
          {galleryListKey && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>{galleryListKey === 'photos' ? 'Gallery photos' : 'Plans'}</div>
                <button onClick={() => galleryUploadRef.current?.click()} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: '#00B6FF', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add images</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {(data[galleryListKey] || []).map((url, i) => {
                  const name = fileUrlToFilename(typeof url === 'string' ? url : (url?.data || ''))
                  return (
                    <div key={`${url}-${i}`} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: `1px solid ${border}`, background: panel }}>
                      <div style={{ width: '100%', height: 100, background: 'rgba(0,0,0,0.05)' }}>
                        {typeof url === 'string' && <AuthImg url={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <div style={{ padding: '4px 6px', fontSize: 9, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                      <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}>
                        {i > 0 && <button onClick={() => { const arr = [...data[galleryListKey]]; [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; setField(galleryListKey, arr) }} title="Move up" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>↑</button>}
                        <button onClick={() => { const arr = data[galleryListKey].filter((_, idx) => idx !== i); setField(galleryListKey, arr) }} title="Remove from list" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(220,38,38,0.85)', color: '#fff', cursor: 'pointer', fontSize: 11 }}>×</button>
                      </div>
                    </div>
                  )
                })}
                {(data[galleryListKey] || []).length === 0 && (
                  <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', fontSize: 12, color: muted, border: `1px dashed ${border}`, borderRadius: 6 }}>No images. Click "+ Add images" to upload.</div>
                )}
              </div>
            </div>
          )}

          {/* Text fields */}
          {textFields.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>Text fields</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {textFields.map(([key, label]) => {
                  const v = data[key] ?? ''
                  const isLong = typeof v === 'string' && (v.length > 80 || v.includes('\n')) || ['description','disclaimer','payment_terms'].includes(key)
                  return (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>{label}</label>
                      {isLong
                        ? <textarea value={v} onChange={e => setField(key, e.target.value)} style={textareaStyle} />
                        : <input value={v} onChange={e => setField(key, e.target.value)} style={inputStyle} />
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Row groups */}
          {rowGroups.map(group => (
            <RowGroupEditor
              key={group.key}
              group={group}
              rows={data[group.key] || []}
              onChange={rows => setField(group.key, rows)}
              theme={{ panel, border, text, muted, inputStyle }}
            />
          ))}
        </div>

        {/* PDF preview pane */}
        <div style={{ borderLeft: `1px solid ${border}`, background: panel, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>Preview</div>
            <a href={`/api/download/${jobId}?_t=${pdfBust}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#00B6FF', textDecoration: 'none', fontWeight: 600 }}>⬇ Download PDF</a>
          </div>
          <PdfPreview jobId={jobId} cacheBust={pdfBust} />
        </div>
      </div>
    </div>
  )
}

// ── Structured row editor ──────────────────────────────────────────────────
function RowGroupEditor({ group, rows, onChange, theme }) {
  const { border, text, muted, inputStyle, panel } = theme
  const safeRows = Array.isArray(rows) ? rows : []
  const isPrimitive = group.primitive

  const updateCell = (i, key, val) => {
    const next = [...safeRows]
    if (isPrimitive) {
      next[i] = val
    } else {
      next[i] = { ...(next[i] || {}), [key]: val }
    }
    onChange(next)
  }
  const removeRow = (i) => onChange(safeRows.filter((_, idx) => idx !== i))
  const moveRow = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= safeRows.length) return
    const next = [...safeRows]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const addRow = () => {
    if (isPrimitive) onChange([...safeRows, ''])
    else {
      const blank = {}
      group.cols.forEach(c => { const k = Array.isArray(c) ? c[0] : c.key; blank[k] = '' })
      onChange([...safeRows, blank])
    }
  }

  return (
    <div style={{ marginBottom: 20, border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: text }}>{group.label} <span style={{ color: muted, fontWeight: 500 }}>({safeRows.length})</span></div>
        <button onClick={addRow} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${border}`, background: panel, color: '#00B6FF', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add row</button>
      </div>
      {safeRows.length === 0 ? (
        <div style={{ padding: 16, fontSize: 12, color: muted, textAlign: 'center' }}>No rows.</div>
      ) : (
        <div style={{ padding: 10 }}>
          {safeRows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
              {isPrimitive ? (
                <textarea value={String(row || '')} onChange={e => updateCell(i, null, e.target.value)} style={{ ...inputStyle, minHeight: 36, resize: 'vertical' }} />
              ) : (
                group.cols.map(c => {
                  const [k, label] = Array.isArray(c) ? c : [c.key, c.label]
                  return (
                    <input
                      key={k}
                      value={String(row?.[k] ?? '')}
                      onChange={e => updateCell(i, k, e.target.value)}
                      placeholder={label}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  )
                })
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button onClick={() => moveRow(i, -1)} disabled={i === 0} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: i === 0 ? 'not-allowed' : 'pointer', fontSize: 10 }}>↑</button>
                <button onClick={() => moveRow(i, 1)} disabled={i === safeRows.length - 1} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: i === safeRows.length - 1 ? 'not-allowed' : 'pointer', fontSize: 10 }}>↓</button>
              </div>
              <button onClick={() => removeRow(i)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PDF preview ────────────────────────────────────────────────────────────
function PdfPreview({ jobId, cacheBust }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let revoked = ''
    apiFetch(`/api/download/${jobId}`)
      .then(r => r.ok ? r.blob() : null)
      .then(b => { if (b) { const u = URL.createObjectURL(b); revoked = u; setSrc(u) } })
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
  }, [jobId, cacheBust])
  if (!src) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(0,0,0,0.4)' }}>Loading PDF…</div>
  return <iframe src={src} title="teaser-preview" style={{ flex: 1, border: 'none', width: '100%', minHeight: 0 }} />
}
