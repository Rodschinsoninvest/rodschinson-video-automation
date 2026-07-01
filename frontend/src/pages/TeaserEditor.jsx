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
// Shared (portfolio-level) pages whose visibility can be toggled. Keys must match
// `currentSection` in teaser_long.html (overview = the building list, company =
// the shared financials page).
const PORTFOLIO_PAGES = [
  ['cover',        '⬛ Cover'],
  ['overview',     '📋 Portfolio overview'],
  ['company',      '📊 Company financials'],
  ['localisation', '📍 Location'],
  ['plans',        '📐 Plans'],
  ['sales',        '🤝 Sales & contact'],
]
// Per-building sub-pages that can be hidden individually (keys read by the
// renderer from each asset's section_visibility).
const PORTFOLIO_ASSET_SUBSECTIONS = [
  ['presentation', 'Presentation'],
  ['details',      'Details'],
  ['aerial',       'Aerial'],
  ['gallery',      'Gallery'],
]
// "Photos per page" choices — Auto keeps the adaptive grid; a fixed N renders a
// clean uniform grid so wide photos aren't cropped by a denser auto layout.
const PHOTO_LAYOUT_OPTIONS = [['', 'Auto'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]

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
  const locationUploadRef = useRef(null)
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
  // Toggle a per-building sub-page (presentation / details / aerial / gallery).
  const setAssetVis = (idx, key, on) => {
    setData(prev => {
      const assets = [...(prev.assets || [])]
      const a = { ...assets[idx] }
      a.section_visibility = { ...(a.section_visibility || {}), [key]: !!on }
      assets[idx] = a
      return { ...prev, assets }
    })
    setDirty(true)
  }
  // Per-photo crop focus (object-position), keyed by the photo url. [x,y] 0..100.
  const setAssetPhotoFocus = (idx, url, xy) => {
    setData(prev => {
      const assets = [...(prev.assets || [])]
      const a = { ...assets[idx] }
      a.photo_focus = { ...(a.photo_focus || {}), [url]: xy }
      assets[idx] = a
      return { ...prev, assets }
    })
    setDirty(true)
  }
  const setPhotoFocus = (url, xy) => {
    setData(prev => ({ ...prev, photo_focus: { ...(prev.photo_focus || {}), [url]: xy } }))
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
      if (uploadTarget.locIndex != null) {
        // Replace one cadastral / location image in-place (keeps its caption etc.)
        setData(prev => {
          const arr = Array.isArray(prev.location_images) ? [...prev.location_images] : []
          const cur = typeof arr[uploadTarget.locIndex] === 'string' ? { url: arr[uploadTarget.locIndex] } : { ...(arr[uploadTarget.locIndex] || {}) }
          cur.url = asset.url
          arr[uploadTarget.locIndex] = cur
          return { ...prev, location_images: arr }
        })
        setDirty(true)
      } else if (uploadTarget.assetIndex != null) {
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

  // ── Cadastral / location images (shared Location page, portfolio mode) ──────
  // Stored as data.location_images = [{ url, caption, address, maps }, ...].
  const locImages = Array.isArray(data?.location_images) ? data.location_images : []
  const normLoc = (it) => (typeof it === 'string' ? { url: it } : (it && typeof it === 'object' ? it : { url: '' }))
  const setLocImages = (arr) => setField('location_images', arr)
  const setLocField = (i, key, val) => {
    const arr = locImages.map((it, j) => (j === i ? { ...normLoc(it), [key]: val } : it))
    setLocImages(arr)
  }
  const removeLocImage = (i) => setLocImages(locImages.filter((_, j) => j !== i))
  const moveLocImage = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= locImages.length) return
    const arr = [...locImages]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setLocImages(arr)
  }
  const handleLocationUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const added = []
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await apiFetch(`/api/long-teaser/${jobId}/assets`, { method: 'POST', body: fd })
        if (!res.ok) continue
        const asset = await res.json()
        setAssets(prev => [...prev, { name: asset.name, size: asset.size, url: asset.url }])
        added.push({ url: asset.url })
      } catch {/* noop, continue */}
    }
    if (added.length) {
      setLocImages([...locImages, ...added])
      toast(`Added ${added.length} cadastral image(s)`, 'success')
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
      {/* Hidden multi-uploader for the shared cadastral / location images */}
      <input ref={locationUploadRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleLocationUpload} />

      {/* Main 3-pane */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr 460px', minHeight: 0 }}>
        {isPortfolio ? (
        <>
          {/* Portfolio rail: Cover · Company · one entry per building · Sales */}
          <div style={{ borderRight: `1px solid ${border}`, background: panel, overflowY: 'auto' }}>
            {[['pages', 'Pages', FileText], ['cover', 'Cover', Square], ['company', 'Company', Building2], ['location', 'Location', MapPin]].map(([id, label, Icon]) => (
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
            {activeId === 'pages' && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: text }}>📄 Pages</h2>
                <p style={{ fontSize: 12, color: muted, margin: '0 0 16px' }}>Show or hide the shared pages of this dossier. Unchecked pages are dropped from the PDF. (Each building's own pages are toggled inside that building.)</p>
                <div style={{ border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden' }}>
                  {PORTFOLIO_PAGES.map(([id, label]) => {
                    const on = data.section_visibility?.[id] !== false
                    return (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${border}`, cursor: 'pointer', background: panel }}>
                        <input type="checkbox" checked={on} onChange={e => setVis(id, e.target.checked)} style={{ accentColor: 'var(--cs-accent)' }} />
                        <span style={{ fontSize: 13, color: text, opacity: on ? 1 : 0.5, textDecoration: on ? 'none' : 'line-through' }}>{label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
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
            {activeId === 'location' && (
              <div>
                <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: text }}>📍 Location (shared)</h2>
                <p style={{ fontSize: 12, color: muted, margin: '0 0 16px' }}>Cadastral / location photos shown on the shared Location page. These are auto-derived from each building's address — replace, add, reorder or recaption them here.</p>

                {/* Cadastral / location images */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>Cadastral images ({locImages.length})</div>
                    <button onClick={() => locationUploadRef.current?.click()} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: 'var(--cs-accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add images</button>
                  </div>
                  {locImages.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: muted, border: `1px dashed ${border}`, borderRadius: 6 }}>No cadastral images. Click "+ Add images".</div>
                  )}
                  <div style={{ display: 'grid', gap: 10 }}>
                    {locImages.map((it, i) => {
                      const item = normLoc(it)
                      return (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${border}`, borderRadius: 8, padding: 10, background: panel }}>
                          <div style={{ width: 120, height: 90, flex: '0 0 auto', borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.05)' }}>
                            {item.url ? <AuthImg url={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%' }} />}
                          </div>
                          <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                            <input value={item.caption || ''} onChange={e => setLocField(i, 'caption', e.target.value)} placeholder="Caption (optional)" style={inputStyle} />
                            <input value={item.address || ''} onChange={e => setLocField(i, 'address', e.target.value)} placeholder="Address (used for the Maps link)" style={inputStyle} />
                            <input value={item.maps || ''} onChange={e => setLocField(i, 'maps', e.target.value)} placeholder="Google Maps URL (optional — overrides address)" style={inputStyle} />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => triggerUpload({ key: '__loc__', locIndex: i })} style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${border}`, background: 'transparent', color: 'var(--cs-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↑ Replace</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <button onClick={() => moveLocImage(i, -1)} disabled={i === 0} style={{ padding: '2px 8px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: i === 0 ? 'not-allowed' : 'pointer', fontSize: 11 }}>↑</button>
                            <button onClick={() => moveLocImage(i, 1)} disabled={i === locImages.length - 1} style={{ padding: '2px 8px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: i === locImages.length - 1 ? 'not-allowed' : 'pointer', fontSize: 11 }}>↓</button>
                            <button onClick={() => removeLocImage(i)} style={{ padding: '2px 8px', borderRadius: 3, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>×</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Fallback street map + map link settings */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>Map fallback &amp; link</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                    {imgCard('Street map photo (used if no cadastral images)', data.street_map || '', () => triggerUpload({ key: 'street_map' }), () => setField('street_map', ''))}
                  </div>
                  {textBlock([['google_maps_url', 'Google Maps link (https://)'], ['map_link_text', '"View on Maps" link text'], ['boundary_caption', 'Boundary caption']], k => data[k], (k, v) => setField(k, v))}
                </div>
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
                  <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: text, display: 'flex', alignItems: 'center', gap: 8 }}><Home size={18} style={{ color: 'var(--cs-accent)' }} /> {a.name || `Asset ${idx + 1}`}</h2>

                  {/* Per-building page toggles */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '10px 12px', marginBottom: 18, border: `1px solid ${border}`, borderRadius: 8, background: panel }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>Pages</span>
                    {PORTFOLIO_ASSET_SUBSECTIONS.map(([key, label]) => {
                      const on = a.section_visibility?.[key] !== false
                      return (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: text, opacity: on ? 1 : 0.5, cursor: 'pointer' }}>
                          <input type="checkbox" checked={on} onChange={e => setAssetVis(idx, key, e.target.checked)} style={{ accentColor: 'var(--cs-accent)' }} />
                          {label}
                        </label>
                      )
                    })}
                  </div>

                  {/* Building gallery */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>Gallery ({photos.length})</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: muted }} title="How many photos per page (Auto avoids cropping by adapting the grid)">
                          Photos / page
                          <select value={a.photo_layout || ''} onChange={e => setAssetField(idx, 'photo_layout', e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '4px 8px' }}>
                            {PHOTO_LAYOUT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </label>
                        <button onClick={() => triggerAssetGallery(idx)} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: 'var(--cs-accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add images</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: muted, marginBottom: 6 }}>Tip: click a photo to set its crop focus (the dot) so it isn't cut off badly.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                      {photos.map((url, pi) => (
                        <div key={`${url}-${pi}`} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: `1px solid ${border}`, background: panel }}>
                          <div style={{ width: '100%', height: 100, background: 'rgba(0,0,0,0.05)' }}>
                            {typeof url === 'string' && <FocusThumb url={url} focus={a.photo_focus?.[url]} onFocus={xy => setAssetPhotoFocus(idx, url, xy)} AuthImg={AuthImg} />}
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

                  {/* Aerial view + editable red parcel outline */}
                  <div style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>Aerial view &amp; parcel outline</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                      {imgCard('Aerial image (overrides auto)', a.aerial_view || '', () => triggerUpload({ assetIndex: idx, key: 'aerial_view' }), () => setAssetField(idx, 'aerial_view', ''))}
                    </div>
                    <BoundaryEditor imgUrl={a.aerial_view || ''} points={a.boundary} onChange={pts => setAssetField(idx, 'boundary', pts)} AuthImg={AuthImg} theme={{ border, text, muted, panel }} />
                    <div style={{ marginTop: 12 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Google Maps link (aerial)</label>
                      <input value={a.google_maps_url || ''} onChange={e => setAssetField(idx, 'google_maps_url', e.target.value)} placeholder="https://… (defaults to a search on the address)" style={inputStyle} />
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

                  {/* Custom multi-column table (e.g. sale price per unit) */}
                  <UnitTableEditor value={a.unit_table} onChange={t => setAssetField(idx, 'unit_table', t)} theme={{ panel, border, text, muted, inputStyle }} />
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

          {/* Aerial parcel-outline editor (single-asset aerial section) */}
          {activeId === 'aerial' && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>Parcel outline (red)</div>
              <BoundaryEditor imgUrl={data.aerial_view || ''} points={data.boundary} onChange={pts => setField('boundary', pts)} AuthImg={AuthImg} theme={{ border, text, muted, panel }} />
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
                        {typeof url === 'string' && (galleryListKey === 'photos'
                          ? <FocusThumb url={url} focus={data.photo_focus?.[url]} onFocus={xy => setPhotoFocus(url, xy)} AuthImg={AuthImg} />
                          : <AuthImg url={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)}
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

// ── Per-photo crop-focus thumbnail ──────────────────────────────────────────
// Click anywhere on the photo to set what stays centred when it's cropped to
// fill a teaser cell. Stores [x,y] in 0..100; the thumb previews the crop live.
function FocusThumb({ url, focus, onFocus, AuthImg }) {
  const ref = useRef(null)
  const f = Array.isArray(focus) && focus.length >= 2 ? focus : [50, 50]
  const set = (e) => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)))
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)))
    onFocus([x, y])
  }
  return (
    <div ref={ref} onClick={set} title="Click to set the crop focus" style={{ width: '100%', height: '100%', position: 'relative', cursor: 'crosshair' }}>
      <AuthImg url={url} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${f[0]}% ${f[1]}%` }} />
      <div style={{ position: 'absolute', left: `${f[0]}%`, top: `${f[1]}%`, width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: '50%', border: '2px solid var(--cs-accent)', background: 'rgba(255,255,255,0.85)', boxShadow: '0 0 0 1px rgba(0,0,0,0.35)', pointerEvents: 'none' }} />
    </div>
  )
}

// ── Aerial parcel-outline editor ────────────────────────────────────────────
// Points are [x,y] in a 0..100 viewBox (top-left origin), exactly what the
// renderer draws. The editing box matches the render frame's aspect (≈723/584)
// with object-fit:cover, so the outline lines up with the final PDF.
function BoundaryEditor({ imgUrl, points, onChange, AuthImg, theme }) {
  const { border, muted, panel } = theme
  const pts = Array.isArray(points)
    ? points.filter(p => Array.isArray(p) && p.length >= 2).map(p => [Number(p[0]) || 0, Number(p[1]) || 0])
    : []
  const boxRef = useRef(null)
  const dragRef = useRef(-1)

  const toPct = (clientX, clientY) => {
    const r = boxRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))
    const y = Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100))
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100]
  }

  // Re-bind each render so the move handler closes over fresh pts/onChange.
  useEffect(() => {
    const onMove = (e) => {
      if (dragRef.current < 0 || !boxRef.current) return
      const [x, y] = toPct(e.clientX, e.clientY)
      onChange(pts.map((p, i) => (i === dragRef.current ? [x, y] : p)))
    }
    const onUp = () => { dragRef.current = -1 }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  })

  const addPoint = (e) => {
    if (dragRef.current >= 0) return
    const [x, y] = toPct(e.clientX, e.clientY)
    onChange([...pts, [x, y]])
  }
  const startDrag = (i, e) => { e.stopPropagation(); e.preventDefault(); dragRef.current = i }
  const delPoint  = (i, e) => { e.stopPropagation(); e.preventDefault(); onChange(pts.filter((_, j) => j !== i)) }
  const polyStr = pts.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')

  return (
    <div>
      <div
        ref={boxRef}
        onMouseDown={addPoint}
        style={{ position: 'relative', width: '100%', maxWidth: 560, aspectRatio: '723 / 584', borderRadius: 8, overflow: 'hidden', border: `1px solid ${border}`, background: '#101820', cursor: 'crosshair', userSelect: 'none' }}
      >
        {imgUrl
          ? <AuthImg url={imgUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Upload an aerial image first</div>}
        {pts.length >= 3 && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <polygon points={polyStr} fill="rgba(220,38,38,0.12)" stroke="#dc2626" strokeWidth="0.7" strokeDasharray="2.2 1.6" />
          </svg>
        )}
        {pts.map((p, i) => (
          <div
            key={i}
            onMouseDown={(e) => startDrag(i, e)}
            onDoubleClick={(e) => delPoint(i, e)}
            title={`Point ${i + 1} — drag to move, double-click to delete`}
            style={{ position: 'absolute', left: `${p[0]}%`, top: `${p[1]}%`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: '50%', background: '#fff', border: '2px solid #dc2626', boxShadow: '0 1px 3px rgba(0,0,0,0.5)', cursor: 'move' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: muted }}>{pts.length} point{pts.length === 1 ? '' : 's'} · click image to add · drag to move · double-click a point to delete{pts.length > 0 && pts.length < 3 ? ' · need ≥3 to show' : ''}</span>
        {pts.length > 0 && <button onClick={() => onChange([])} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid rgba(220,38,38,0.3)`, background: panel, color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Clear outline</button>}
      </div>
    </div>
  )
}

// ── Custom multi-column table editor (e.g. sale price per unit) ──────────────
// Saves to `asset.unit_table = { head, columns:[...], rows:[[...], ...] }`, which
// the renderer already lays out as a dense table. When present it replaces the
// standard rental-income rows on the building's details page.
function UnitTableEditor({ value, onChange, theme }) {
  const { border, text, muted, inputStyle, panel } = theme
  const t = value && typeof value === 'object' ? value : null
  const cols = t && Array.isArray(t.columns) ? t.columns : []
  const rows = t && Array.isArray(t.rows) ? t.rows : []

  const enable    = () => onChange({ head: 'Prix de vente par unité', columns: ['Unité', 'Surface', 'Prix de vente'], rows: [['', '', '']] })
  const disable   = () => onChange(null)
  const setHead   = (v) => onChange({ ...t, head: v })
  const setColName= (ci, v) => { const c = [...cols]; c[ci] = v; onChange({ ...t, columns: c }) }
  const addCol    = () => onChange({ ...t, columns: [...cols, `Colonne ${cols.length + 1}`], rows: rows.map(r => [...r, '']) })
  const removeCol = (ci) => onChange({ ...t, columns: cols.filter((_, i) => i !== ci), rows: rows.map(r => r.filter((_, i) => i !== ci)) })
  const setCell   = (ri, ci, v) => { const r = rows.map(x => [...x]); while (r[ri].length < cols.length) r[ri].push(''); r[ri][ci] = v; onChange({ ...t, rows: r }) }
  const addRow    = () => onChange({ ...t, rows: [...rows, cols.map(() => '')] })
  const removeRow = (ri) => onChange({ ...t, rows: rows.filter((_, i) => i !== ri) })
  const moveRow   = (ri, dir) => { const j = ri + dir; if (j < 0 || j >= rows.length) return; const r = [...rows]; [r[ri], r[j]] = [r[j], r[ri]]; onChange({ ...t, rows: r }) }

  if (!t) {
    return (
      <div style={{ marginBottom: 20, border: `1px dashed ${border}`, borderRadius: 8, padding: 14, background: panel }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: text, marginBottom: 6 }}>Custom table (price per unit, rent roll…)</div>
        <div style={{ fontSize: 11, color: muted, marginBottom: 10, lineHeight: 1.5 }}>Define your own columns (e.g. Unit · Surface · Sale price). It replaces the standard rental-income rows on this building's details page — for special cases that previously needed Canva.</div>
        <button onClick={enable} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: 'var(--cs-accent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add custom table</button>
      </div>
    )
  }

  const cellStyle = { ...inputStyle, padding: '6px 8px', fontSize: 11 }
  return (
    <div style={{ marginBottom: 20, border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(0,0,0,0.02)', borderBottom: `1px solid ${border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: text }}>Custom table <span style={{ color: muted, fontWeight: 500 }}>({rows.length} row{rows.length === 1 ? '' : 's'})</span></div>
        <button onClick={disable} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Remove table</button>
      </div>
      <div style={{ padding: 10 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Table title</label>
        <input value={t.head || ''} onChange={e => setHead(e.target.value)} placeholder="e.g. Sale price per unit" style={{ ...inputStyle, marginBottom: 12 }} />

        {/* Column headers */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: muted }}>Columns</span>
          <button onClick={addCol} style={{ padding: '3px 9px', borderRadius: 4, border: `1px solid ${border}`, background: panel, color: 'var(--cs-accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Column</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {cols.map((c, ci) => (
            <div key={ci} style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'center' }}>
              <input value={c} onChange={e => setColName(ci, e.target.value)} placeholder={`Col ${ci + 1}`} style={{ ...cellStyle, fontWeight: 700 }} />
              {cols.length > 1 && <button onClick={() => removeCol(ci)} title="Remove column" style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}>×</button>}
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            {cols.map((_, ci) => (
              <input key={ci} value={String(row?.[ci] ?? '')} onChange={e => setCell(ri, ci, e.target.value)} style={{ ...cellStyle, flex: 1 }} />
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button onClick={() => moveRow(ri, -1)} disabled={ri === 0} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: ri === 0 ? 'not-allowed' : 'pointer', fontSize: 10 }}>↑</button>
              <button onClick={() => moveRow(ri, 1)} disabled={ri === rows.length - 1} style={{ padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: panel, color: muted, cursor: ri === rows.length - 1 ? 'not-allowed' : 'pointer', fontSize: 10 }}>↓</button>
            </div>
            <button onClick={() => removeRow(ri)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <button onClick={addRow} style={{ marginTop: 4, padding: '5px 12px', borderRadius: 4, border: `1px solid ${border}`, background: panel, color: 'var(--cs-accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Add row</button>
      </div>
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
