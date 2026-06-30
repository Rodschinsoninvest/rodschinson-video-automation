import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Square, FileText, BarChart3, MapPin, Satellite, Images, Ruler, Handshake,
  Building2, Home, Plus, ArrowUp, ArrowDown, X, ArrowLeft, Download,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { apiFetch, downloadAsset } from '../utils/apiFetch'

// ── Section schema ───────────────────────────────────────────────────────────
// Each section defines: id (must match `currentSection` in teaser_long.html),
// label (for the rail + visibility toggle), and the field groups it owns.
const SECTIONS = [
  { id: 'cover',        label: 'Cover',          icon: Square },
  { id: 'activa',       label: 'Description',    icon: FileText },
  { id: 'details',      label: 'Financial & Specs', icon: BarChart3 },
  { id: 'localisation', label: 'Localisation',   icon: MapPin },
  { id: 'aerial',       label: 'Aerial view',    icon: Satellite },
  { id: 'gallery',      label: 'Gallery',        icon: Images },
  { id: 'plans',        label: 'Plans',          icon: Ruler },
  { id: 'sales',        label: 'Sales & Contact',icon: Handshake },
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
    ['google_maps_url', 'Google Maps link (https://) — where the link opens'],
    ['map_link_text',   '"View on Maps" link text'],
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
  localisation: [['street_map',   'Google Maps photo']],
  sales:        [['sales_photo',  'Contact-page photo']],
}

// Plural image-list field (gallery, plans).
const IMAGE_LIST_BY_SECTION = {
  gallery: 'photos',
  plans:   'plans',
}

// ── Portfolio (multiple-asset) editor schema ─────────────────────────────────
// Per-building text fields, single-image roles, and structured row groups.
const PORTFOLIO_ASSET_TEXT = [
  ['name',          'Building name'],
  ['short',         'Short label (City · type)'],
  ['subtitle',      'Subtitle'],
  ['address',       'Address (drives location + aerial view)'],
  ['annual_income', 'Annual income'],
  ['terrain',       'Land / terrain'],
]
const PORTFOLIO_ASSET_IMAGES = [
  ['activa_photo', 'Presentation photo'],
  ['aerial_view',  'Aerial image (overrides auto)'],
]
const PORTFOLIO_ASSET_ROWGROUPS = [
  { key: 'metrics',             label: 'Header metrics (chips)', cols: [['k','Label'],['v','Value']] },
  { key: 'bullets',             label: 'Presentation bullets',   cols: [{ key: 'value', label: 'Bullet', span: 1 }], primitive: true },
  { key: 'rental_income_rows',  label: 'Rental income',          cols: [['label','Label'],['value','Value']] },
  { key: 'technical_specs_rows',label: 'Technical specs',        cols: [['label','Label'],['value','Value']] },
  { key: 'lease_terms_rows',    label: 'Lease terms',            cols: [['label','Label'],['value','Value']] },
  { key: 'surfaces',            label: 'Surfaces (floor / area)',cols: [['floor','Floor'],['area','Area']] },
  { key: 'amenities_bullets',   label: 'Amenities',              cols: [{ key: 'value', label: 'Amenity', span: 1 }], primitive: true },
]
// Company-wide (shared) fields for a portfolio teaser.
const PORTFOLIO_COVER_TEXT = [
  ['title',       'Portfolio title'],
  ['cover_badge', 'Cover badge (empty = hide)'],
  ['reference',   'Reference'],
  ['price',       'Price (cover)'],
  ['price_label', 'Price label'],
]
const PORTFOLIO_SALES_TEXT = [
  ['agent_name','Agent name'], ['agent_role','Agent role'], ['agent_phone','Agent phone'], ['agent_email','Agent email'],
  ['sharepoint_url','SharePoint URL'], ['sharepoint_label','SharePoint label'],
  ['expertise_url','Expertise PDF URL'], ['disclaimer','Footer disclaimer'],
]
const PORTFOLIO_COMPANY_ROWGROUPS = [
  { key: 'key_metrics',            label: 'KPI strip',          cols: [['label','Label'],['value','Value'],['sub','Sub']] },
  { key: 'valuation_rows',         label: 'Valuation breakdown',cols: [['label','Label'],['value','Value']] },
  { key: 'financial_summary_rows', label: 'Financial summary',  cols: [['label','Label'],['value','Value']] },
  { key: 'company_specs_rows',     label: 'Company specs',      cols: [['label','Label'],['value','Value']] },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
function fileUrlToFilename(url) {
  if (!url || typeof url !== 'string') return ''
  const s = url.split('/').pop() || ''
  return decodeURIComponent(s)
}
// Path of an asset relative to the teaser's assets dir, e.g. "asset_00/photo_00.jpg"
// (per-building galleries live in subfolders). Falls back to the bare filename.
function assetRelPath(url) {
  if (!url || typeof url !== 'string') return ''
  const s = decodeURIComponent(url)
  const m = s.match(/_long_assets\/(.+)$/)
  return m ? m[1] : (s.split('/').pop() || '')
}

export default function TeaserEditor() {
  const { jobId } = useParams()
  const navigate  = useNavigate()
  const { dark }  = useTheme()
  const { toast } = useToast()

  const [loading, setLoading]   = useState(true)
  const [data, setData]         = useState(null)
  const [, setAssets]           = useState([])  // tracks uploaded files (write-only cache)
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
  const assetGalleryRef = useRef(null)
  const [assetUploadIdx, setAssetUploadIdx] = useState(null)  // which asset's gallery is receiving a multi-upload

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

  // ── Per-asset mutation helpers (portfolio / multiple-asset teasers) ────────
  const setAssetField = (idx, key, value) => {
    setData(prev => {
      const assets = [...(prev.assets || [])]
      assets[idx] = { ...assets[idx], [key]: value }
      return { ...prev, assets }
    })
    setDirty(true)
  }
  const addAsset = () => {
    setData(prev => {
      const assets = [...(prev.assets || [])]
      assets.push({ name: `Asset ${assets.length + 1}`, address: '', photos: [] })
      return { ...prev, assets }
    })
    setDirty(true)
  }
  const removeAsset = (idx) => {
    setData(prev => ({ ...prev, assets: (prev.assets || []).filter((_, i) => i !== idx) }))
    setDirty(true)
  }
  const moveAsset = (idx, dir) => {
    setData(prev => {
      const assets = [...(prev.assets || [])]
      const j = idx + dir
      if (j < 0 || j >= assets.length) return prev
      ;[assets[idx], assets[j]] = [assets[j], assets[idx]]
      return { ...prev, assets }
    })
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
      if (uploadTarget.assetIndex != null) {
        // Per-asset target (portfolio mode)
        setData(prev => {
          const arr = [...(prev.assets || [])]
          const a = { ...arr[uploadTarget.assetIndex] }
          if (uploadTarget.listKey) {
            a[uploadTarget.listKey] = [...(Array.isArray(a[uploadTarget.listKey]) ? a[uploadTarget.listKey] : []), asset.url]
          } else if (uploadTarget.key) {
            a[uploadTarget.key] = asset.url
          }
          arr[uploadTarget.assetIndex] = a
          return { ...prev, assets: arr }
        })
        setDirty(true)
      } else if (uploadTarget.key) {
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

  // Multi-upload into a specific asset's gallery (portfolio mode)
  const triggerAssetGallery = (idx) => {
    setAssetUploadIdx(idx)
    setTimeout(() => assetGalleryRef.current?.click(), 0)
  }
  const handleAssetGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    const idx = assetUploadIdx
    setAssetUploadIdx(null)
    if (!files.length || idx == null) return
    const urls = []
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await apiFetch(`/api/long-teaser/${jobId}/assets`, { method: 'POST', body: fd })
        if (!res.ok) continue
        const asset = await res.json()
        setAssets(prev => [...prev, { name: asset.name, size: asset.size, url: asset.url }])
        urls.push(asset.url)
      } catch {/* noop, continue */}
    }
    if (urls.length) {
      setData(prev => {
        const arr = [...(prev.assets || [])]
        const a = { ...arr[idx] }
        a.photos = [...(Array.isArray(a.photos) ? a.photos : []), ...urls]
        arr[idx] = a
        return { ...prev, assets: arr }
      })
      setDirty(true)
      toast(`Added ${urls.length} photo(s)`, 'success')
    }
  }

  // Token-aware image: small wrapper that fetches the blob with Authorization header.
  const AuthImg = ({ url, ...rest }) => {
    const [src, setSrc] = useState('')
    useEffect(() => {
      let revoked = ''
      const rel = assetRelPath(url)
      if (!rel) { setSrc(''); return }
      const enc = rel.split('/').map(encodeURIComponent).join('/')
      apiFetch(`/api/long-teaser/${jobId}/asset-blob/${enc}`)
        .then(r => r.ok ? r.blob() : null)
        .then(b => { if (b) { const u = URL.createObjectURL(b); revoked = u; setSrc(u) } })
      return () => { if (revoked) URL.revokeObjectURL(revoked) }
    }, [url])
    return src ? <img src={src} {...rest} /> : <div {...rest} style={{ ...(rest.style||{}), background: 'rgba(0,0,0,0.05)' }} />
  }

  // ── Theme ───────────────────────────────────────────────────────────────
  const bg     = dark ? '#0d0d0d' : '#f7f7fa'
  const panel  = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)'
  const text   = dark ? '#fff' : '#0D1F3C'
  const muted  = dark ? 'rgba(255,255,255,0.66)' : 'rgba(0,0,0,0.6)'
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
  const isPortfolio = Array.isArray(data.assets) && data.assets.length > 0
  const activeAssetIdx = activeId.startsWith('asset:') ? parseInt(activeId.slice(6), 10) : -1

  // Plain-function render helpers (NOT components — keeps input focus on edit).
  const imgCard = (label, url, onReplace, onClear) => (
    <div style={{ border: `1px solid ${border}`, borderRadius: 8, padding: 10, background: panel }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: text }}>{label}</div>
      <div style={{ width: '100%', height: 120, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.05)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {url ? <AuthImg url={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, color: muted }}>No image</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onReplace} style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: `1px solid ${border}`, background: 'transparent', color: 'var(--cs-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ArrowUp size={12} /> Replace</button>
        {url && <button onClick={onClear} style={{ padding: '6px 10px', borderRadius: 5, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Clear</button>}
      </div>
    </div>
  )
  const textBlock = (list, getVal, setVal) => (
    <div style={{ display: 'grid', gap: 10 }}>
      {list.map(([key, label]) => {
        const v = getVal(key) ?? ''
        const long = (typeof v === 'string' && (v.length > 80 || v.includes('\n'))) || ['disclaimer', 'description', 'subtitle'].includes(key)
        return (
          <div key={key}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>{label}</label>
            {long
              ? <textarea value={v} onChange={e => setVal(key, e.target.value)} style={textareaStyle} />
              : <input value={v} onChange={e => setVal(key, e.target.value)} style={inputStyle} />}
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: bg, color: text }}>
      {/* Hidden file inputs for asset uploads */}
      <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadChange} />
      <input ref={galleryUploadRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={handleGalleryMultiUpload} />

      {/* Top bar */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${border}`, background: panel, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/library')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', color: muted, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}><ArrowLeft size={13} /> Library</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{library?.title || data.title || 'Long Teaser'}</div>
          <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>ID {shortId} · {library?.language || data.language || ''} · {library?.brand || ''}{dirty ? ' · unsaved changes' : ''}</div>
        </div>
        {rendering && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: muted }}>
            <span>Rendering… {renderProgress}%</span>
            <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <div style={{ width: `${renderProgress}%`, height: '100%', background: 'var(--cs-accent)', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
        <button onClick={() => handleSave({ thenRegenerate: false })} disabled={saving || rendering || !dirty} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${border}`, background: panel, color: muted, fontSize: 12, fontWeight: 600, cursor: saving || rendering || !dirty ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => handleSave({ thenRegenerate: true })} disabled={saving || rendering} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--cs-accent)', opacity: saving || rendering ? 0.5 : 1, color: '#fff', fontSize: 12, fontWeight: 700, cursor: saving || rendering ? 'not-allowed' : 'pointer' }}>
          {saving || rendering ? 'Working…' : 'Save & Regenerate'}
        </button>
        <button onClick={() => handleRegenerate({ regenerate_pptx: true })} disabled={saving || rendering} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${border}`, background: 'transparent', color: muted, fontSize: 11, cursor: saving || rendering ? 'not-allowed' : 'pointer' }} title="Re-render PDF and PPTX from current saved JSON">
          + PPTX
        </button>
      </div>

      {/* Hidden multi-uploader for a building's gallery (portfolio mode) */}
      <input ref={assetGalleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleAssetGalleryUpload} />

      {/* Main 3-pane */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 460px', minHeight: 0 }}>
        {isPortfolio ? (
        <>
          {/* Portfolio rail: Cover · Company · one entry per building · Sales */}
          <div style={{ borderRight: `1px solid ${border}`, background: panel, overflowY: 'auto' }}>
            {[['cover', 'Cover', Square], ['company', 'Company', Building2]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setActiveId(id)} style={{ width: '100%', padding: '12px 14px', border: 'none', borderBottom: `1px solid ${border}`, background: activeId === id ? 'var(--cs-accent-soft)' : 'transparent', color: activeId === id ? 'var(--cs-accent)' : text, fontSize: 13, fontWeight: activeId === id ? 700 : 500, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}><Icon size={15} style={{ color: activeId === id ? 'var(--cs-accent)' : 'var(--cs-text-sub)' }} /> {label}</button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>
              <span>Assets ({data.assets.length})</span>
              <button onClick={() => { addAsset(); setActiveId(`asset:${data.assets.length}`) }} title="Add building" style={{ border: `1px solid ${border}`, background: 'transparent', color: 'var(--cs-accent)', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', display: 'inline-flex', alignItems: 'center' }}><Plus size={13} /></button>
            </div>
            {data.assets.map((a, i) => {
              const on = activeId === `asset:${i}`
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${border}`, background: on ? 'var(--cs-accent-soft)' : 'transparent' }}>
                  <button onClick={() => setActiveId(`asset:${i}`)} style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: 'none', background: 'transparent', color: on ? 'var(--cs-accent)' : text, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i + 1}. {a.name || `Asset ${i + 1}`}
                  </button>
                  <div style={{ display: 'flex', gap: 1, paddingRight: 4 }}>
                    <button onClick={() => moveAsset(i, -1)} disabled={i === 0} title="Up" style={{ border: 'none', background: 'transparent', color: muted, cursor: i === 0 ? 'not-allowed' : 'pointer', padding: '2px 3px', display: 'inline-flex', alignItems: 'center' }}><ArrowUp size={13} /></button>
                    <button onClick={() => moveAsset(i, 1)} disabled={i === data.assets.length - 1} title="Down" style={{ border: 'none', background: 'transparent', color: muted, cursor: i === data.assets.length - 1 ? 'not-allowed' : 'pointer', padding: '2px 3px', display: 'inline-flex', alignItems: 'center' }}><ArrowDown size={13} /></button>
                    <button onClick={() => { if (confirm(`Remove ${a.name || 'this building'}?`)) { removeAsset(i); setActiveId('cover') } }} title="Remove" style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', padding: '2px 3px', display: 'inline-flex', alignItems: 'center' }}><X size={13} /></button>
                  </div>
                </div>
              )
            })}
            <button onClick={() => setActiveId('sales')} style={{ width: '100%', padding: '12px 14px', border: 'none', borderTop: `1px solid ${border}`, background: activeId === 'sales' ? 'var(--cs-accent-soft)' : 'transparent', color: activeId === 'sales' ? 'var(--cs-accent)' : text, fontSize: 13, fontWeight: activeId === 'sales' ? 700 : 500, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}><Handshake size={15} style={{ color: activeId === 'sales' ? 'var(--cs-accent)' : 'var(--cs-text-sub)' }} /> Sales &amp; Contact</button>
          </div>

          {/* Portfolio editor pane */}
          <div style={{ overflowY: 'auto', padding: 24 }}>
            {activeId === 'cover' && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 8 }}><Square size={18} style={{ color: 'var(--cs-accent)' }} /> Cover</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 22 }}>
                  {imgCard('Cover photo', data.cover_photo || '', () => triggerUpload({ key: 'cover_photo' }), () => setField('cover_photo', ''))}
                </div>
                {textBlock(PORTFOLIO_COVER_TEXT, k => data[k], (k, v) => setField(k, v))}
              </div>
            )}
            {activeId === 'company' && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 8 }}><Building2 size={18} style={{ color: 'var(--cs-accent)' }} /> Company (shared)</h2>
                <p style={{ fontSize: 12, color: muted, margin: '0 0 16px' }}>Company-wide figures shown on the overview / details pages (kept separate from each building).</p>
                {PORTFOLIO_COMPANY_ROWGROUPS.map(group => (
                  <RowGroupEditor key={group.key} group={group} rows={data[group.key] || []} onChange={rows => setField(group.key, rows)} theme={{ panel, border, text, muted, inputStyle }} />
                ))}
              </div>
            )}
            {activeId === 'sales' && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 8 }}><Handshake size={18} style={{ color: 'var(--cs-accent)' }} /> Sales &amp; Contact</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 22 }}>
                  {imgCard('Contact-page photo', data.sales_photo || '', () => triggerUpload({ key: 'sales_photo' }), () => setField('sales_photo', ''))}
                </div>
                {textBlock(PORTFOLIO_SALES_TEXT, k => data[k], (k, v) => setField(k, v))}
              </div>
            )}
            {activeAssetIdx >= 0 && data.assets[activeAssetIdx] && (() => {
              const a = data.assets[activeAssetIdx]
              const idx = activeAssetIdx
              const photos = Array.isArray(a.photos) ? a.photos : []
              return (
                <div>
                  <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 8 }}><Home size={18} style={{ color: 'var(--cs-accent)' }} /> {a.name || `Asset ${idx + 1}`}</h2>

                  {/* Building gallery */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>Gallery ({photos.length})</div>
                      <button onClick={() => triggerAssetGallery(idx)} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: 'var(--cs-accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add images</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                      {photos.map((url, pi) => (
                        <div key={`${url}-${pi}`} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: `1px solid ${border}`, background: panel }}>
                          <div style={{ width: '100%', height: 100, background: 'rgba(0,0,0,0.05)' }}>
                            {typeof url === 'string' && <AuthImg url={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                          </div>
                          <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}>
                            <button onClick={() => { if (pi === 0) return; const arr = [...photos];[arr[pi - 1], arr[pi]] = [arr[pi], arr[pi - 1]]; setAssetField(idx, 'photos', arr) }} disabled={pi === 0} title="Move left" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: pi === 0 ? 'not-allowed' : 'pointer', opacity: pi === 0 ? 0.35 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ArrowUp size={12} /></button>
                            <button onClick={() => { if (pi >= photos.length - 1) return; const arr = [...photos];[arr[pi + 1], arr[pi]] = [arr[pi], arr[pi + 1]]; setAssetField(idx, 'photos', arr) }} disabled={pi >= photos.length - 1} title="Move right" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: pi >= photos.length - 1 ? 'not-allowed' : 'pointer', opacity: pi >= photos.length - 1 ? 0.35 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ArrowDown size={12} /></button>
                            <button onClick={() => setAssetField(idx, 'photos', photos.filter((_, j) => j !== pi))} title="Remove" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(220,38,38,0.85)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
                          </div>
                        </div>
                      ))}
                      {photos.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', fontSize: 12, color: muted, border: `1px dashed ${border}`, borderRadius: 6 }}>No photos. Click "+ Add images".</div>}
                    </div>
                  </div>

                  {/* Per-building images */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>Images</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                      {PORTFOLIO_ASSET_IMAGES.map(([key, label]) => (
                        <div key={key}>{imgCard(label, a[key] || '', () => triggerUpload({ assetIndex: idx, key }), () => setAssetField(idx, key, ''))}</div>
                      ))}
                    </div>
                  </div>

                  {/* Per-building text */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>Details</div>
                    {textBlock(PORTFOLIO_ASSET_TEXT, k => a[k], (k, v) => setAssetField(idx, k, v))}
                  </div>

                  {/* Per-building row groups */}
                  {PORTFOLIO_ASSET_ROWGROUPS.map(group => (
                    <RowGroupEditor key={group.key} group={group} rows={a[group.key] || []} onChange={rows => setAssetField(idx, group.key, rows)} theme={{ panel, border, text, muted, inputStyle }} />
                  ))}
                </div>
              )
            })()}
          </div>
        </>
        ) : (
        <>
        {/* Section rail */}
        <div style={{ borderRight: `1px solid ${border}`, background: panel, overflowY: 'auto' }}>
          {SECTIONS.map(s => {
            const on = activeId === s.id
            const visible = data.section_visibility?.[s.id] !== false
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${border}` }}>
                <button onClick={() => setActiveId(s.id)} style={{ flex: 1, padding: '12px 14px', border: 'none', background: on ? 'var(--cs-accent-soft)' : 'transparent', color: on ? 'var(--cs-accent)' : text, fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', opacity: visible ? 1 : 0.35, color: on ? 'var(--cs-accent)' : 'var(--cs-text-sub)' }}><s.icon size={15} /></span>
                  <span style={{ opacity: visible ? 1 : 0.45, textDecoration: visible ? 'none' : 'line-through' }}>{s.label}</span>
                </button>
                <label style={{ padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title={visible ? 'Hide this page in the PDF' : 'Show this page in the PDF'}>
                  <input type="checkbox" checked={visible} onChange={e => setVis(s.id, e.target.checked)} style={{ accentColor: 'var(--cs-accent)' }} />
                </label>
              </div>
            )
          })}
        </div>

        {/* Editor pane */}
        <div style={{ overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 8 }}><section.icon size={18} style={{ color: 'var(--cs-accent)' }} /> {section.label}</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={visOn} onChange={e => setVis(activeId, e.target.checked)} style={{ accentColor: 'var(--cs-accent)' }} />
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
                        <button onClick={() => triggerUpload({ key })} style={{ flex: 1, padding: '6px 8px', borderRadius: 5, border: `1px solid ${border}`, background: 'transparent', color: 'var(--cs-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><ArrowUp size={12} /> Replace</button>
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
                <button onClick={() => galleryUploadRef.current?.click()} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: 'var(--cs-accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add images</button>
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
                        <button onClick={() => { if (i === 0) return; const arr = [...data[galleryListKey]]; [arr[i-1], arr[i]] = [arr[i], arr[i-1]]; setField(galleryListKey, arr) }} disabled={i === 0} title="Move left" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.35 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ArrowUp size={12} /></button>
                        <button onClick={() => { const arr = data[galleryListKey] || []; if (i >= arr.length - 1) return; const n = [...arr]; [n[i+1], n[i]] = [n[i], n[i+1]]; setField(galleryListKey, n) }} disabled={i >= (data[galleryListKey]?.length || 0) - 1} title="Move right" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: i >= (data[galleryListKey]?.length || 0) - 1 ? 'not-allowed' : 'pointer', opacity: i >= (data[galleryListKey]?.length || 0) - 1 ? 0.35 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ArrowDown size={12} /></button>
                        <button onClick={() => { const arr = data[galleryListKey].filter((_, idx) => idx !== i); setField(galleryListKey, arr) }} title="Remove from list" style={{ width: 22, height: 22, borderRadius: 3, border: 'none', background: 'rgba(220,38,38,0.85)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
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
        </>
        )}

        {/* PDF preview pane */}
        <div style={{ borderLeft: `1px solid ${border}`, background: panel, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>Preview</div>
            <button onClick={() => downloadAsset(`/api/download/${jobId}`, `${shortId || 'teaser'}.pdf`).catch(e => toast(e.message, 'error'))} style={{ fontSize: 11, color: 'var(--cs-accent)', textDecoration: 'none', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={12} /> Download PDF</button>
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
        <button onClick={addRow} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${border}`, background: panel, color: 'var(--cs-accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add row</button>
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
                <button onClick={() => moveRow(i, -1)} disabled={i === 0} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: i === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center' }}><ArrowUp size={11} /></button>
                <button onClick={() => moveRow(i, 1)} disabled={i === safeRows.length - 1} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: i === safeRows.length - 1 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center' }}><ArrowDown size={11} /></button>
              </div>
              <button onClick={() => removeRow(i)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><X size={12} /></button>
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
