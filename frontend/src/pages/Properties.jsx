import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useBrands } from '../contexts/BrandContext'
import { useGeneration } from '../contexts/GenerationContext'
import { useToast } from '../contexts/ToastContext'
import { apiFetch } from '../utils/apiFetch'

// ── Asset type icons ──────────────────────────────────────────────────────────
const ASSET_ICONS = {
  hotel: '🏨', clinic: '🏥', building: '🏢', office: '🏢',
  warehouse: '🏭', logistics: '🏭', resort: '🏖️', pharmacy: '💊',
  gym: '🏋️', fitness: '🏋️', parking: '🅿️', student: '🎓',
  senior: '🏡', retail: '🛍️', residential: '🏠', mixed: '🏢',
  land: '🏗️', industrial: '🏭',
}

const ASSET_LABELS = {
  hotel: 'Hotel', clinic: 'Clinic / Medical', building: 'Office Building', office: 'Office Building',
  warehouse: 'Warehouse', logistics: 'Logistics', resort: 'Resort', pharmacy: 'Pharmacy',
  gym: 'Gym / Fitness', fitness: 'Fitness', parking: 'Parking', student: 'Student Housing',
  senior: 'Senior Housing', retail: 'Retail', residential: 'Residential', mixed: 'Mixed-Use',
  land: 'Land', industrial: 'Industrial',
}

const VALUATION_METHODS = {
  hotel: ['Income Capitalization', 'DCF', 'Price per Room', 'RevPAR'],
  clinic: ['Income Capitalization', 'DCF', 'Replacement Cost'],
  pharmacy: ['Income Capitalization', 'DCF', 'Replacement Cost'],
  building: ['Income Cap.', 'Comparables', 'Cost Approach', 'Price/m\u00b2'],
  office: ['Income Cap.', 'Comparables', 'Cost Approach', 'Price/m\u00b2'],
  warehouse: ['Income Cap.', 'Price/m\u00b2', 'Replacement Cost'],
  logistics: ['Income Cap.', 'Price/m\u00b2', 'Replacement Cost'],
  industrial: ['Income Cap.', 'Price/m\u00b2', 'Replacement Cost'],
  retail: ['Income Cap.', 'Sales Comparison', 'Gross Rent Multiplier'],
  residential: ['Comparables', 'Income Approach', 'Cost Approach', 'Price/Unit'],
  student: ['Comparables', 'Income Approach', 'Cost Approach', 'Price/Unit'],
  senior: ['Comparables', 'Income Approach', 'Cost Approach', 'Price/Unit'],
  land: ['Comparables', 'Residual Land Value', 'Development Potential'],
  resort: ['DCF', 'Income Cap.', 'Price per Room'],
  parking: ['Income Cap.', 'Price per Space'],
  gym: ['Income Cap.', 'DCF'],
  fitness: ['Income Cap.', 'DCF'],
  mixed: ['Income Cap.', 'Comparables', 'Weighted Multi-Method'],
}

const LANGUAGES = [
  { value: 'EN', label: 'English' },
  { value: 'FR', label: 'French' },
  { value: 'NL', label: 'Dutch' },
]

const FIELD_OPTIONS = [
  { key: 'title',       label: 'Property Name',  default: true  },
  { key: 'price',       label: 'Price',           default: true  },
  { key: 'description', label: 'Description',     default: true  },
  { key: 'asset_type',  label: 'Asset Type',      default: true  },
  { key: 'reference',   label: 'Reference Code',  default: false },
  { key: 'agent',       label: 'Responsible Agent',default: false },
  { key: 'sectors',     label: 'Sectors',          default: false },
  { key: 'nda',         label: 'NDA Info',         default: false },
  { key: 'status',      label: 'Status',           default: false },
]

// ── Property card ─────────────────────────────────────────────────────────────
function PropertyCard({ prop, onGenerate, onEvaluate, onLongTeaser, dark, selected, onToggleSelect }) {
  const icon = ASSET_ICONS[prop.asset_type] || '🏢'
  return (
    <div style={{
      background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `1px solid ${selected ? '#00B6FF' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      transition: 'border-color 0.2s',
    }}
    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = '#C8A96E' }}
    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(prop.odoo_id)}
          onClick={e => e.stopPropagation()}
          style={{ accentColor: '#00B6FF', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ fontSize: 28 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#C8A96E' }}>
            {prop.asset_label || prop.asset_type}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: dark ? '#fff' : '#0D1F3C', lineHeight: 1.3, marginTop: 2 }}>
            {prop.title || 'Unnamed Property'}
          </div>
        </div>
        {/* Status badge */}
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
          background: prop.status === 'Sale' ? 'rgba(22,163,74,0.1)' : prop.status === 'Reserved' ? 'rgba(180,83,9,0.1)' : 'rgba(0,0,0,0.06)',
          color: prop.status === 'Sale' ? '#16a34a' : prop.status === 'Reserved' ? '#b45309' : '#666',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>{prop.status || 'Sale'}</span>
      </div>

      {/* Details */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)' }}>
        {prop.price && <span style={{ fontWeight: 600, color: '#08316F' }}>{prop.price}</span>}
        {prop.reference && <span>Ref: {prop.reference}</span>}
        {prop.agent && <span>{prop.agent}</span>}
      </div>

      {prop.description && (
        <div style={{
          fontSize: 12, lineHeight: 1.6, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>{prop.description}</div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={() => onGenerate(prop)} style={{
          flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid rgba(200,169,110,0.4)', background: 'rgba(200,169,110,0.08)',
          color: '#C8A96E', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'all 0.2s', minWidth: 70,
        }}
        onMouseEnter={e => { e.target.style.background = 'rgba(200,169,110,0.18)' }}
        onMouseLeave={e => { e.target.style.background = 'rgba(200,169,110,0.08)' }}
        >Teaser</button>
        <button onClick={() => onLongTeaser(prop)} style={{
          flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid rgba(8,49,111,0.3)', background: 'rgba(8,49,111,0.06)',
          color: '#08316F', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'all 0.2s', minWidth: 70,
        }}
        onMouseEnter={e => { e.target.style.background = 'rgba(8,49,111,0.12)' }}
        onMouseLeave={e => { e.target.style.background = 'rgba(8,49,111,0.06)' }}
        >Long Teaser</button>
        <button onClick={() => onEvaluate(prop)} style={{
          flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid rgba(0,182,255,0.4)', background: 'rgba(0,182,255,0.08)',
          color: '#00B6FF', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.target.style.background = 'rgba(0,182,255,0.18)' }}
        onMouseLeave={e => { e.target.style.background = 'rgba(0,182,255,0.08)' }}
        >Evaluate</button>
      </div>
    </div>
  )
}

// ── Generate modal ────────────────────────────────────────────────────────────
function GenerateModal({ prop, brands, onClose, onGenerate, dark }) {
  const [selectedFields, setSelectedFields] = useState(
    FIELD_OPTIONS.filter(f => f.default).map(f => f.key)
  )
  const [brand, setBrand] = useState(brands[0]?.id || 'rodschinson')
  const [language, setLanguage] = useState('EN')
  const [loading, setLoading] = useState(false)

  const toggle = (key) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const handleGenerate = async () => {
    setLoading(true)
    await onGenerate({ prop, selectedFields, brand, language })
    setLoading(false)
    onClose()
  }

  const bg = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: bg, borderRadius: 16, padding: 28, maxWidth: 520, width: '90%',
        border: `1px solid ${border}`, maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 28 }}>{ASSET_ICONS[prop.asset_type] || '🏢'}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{prop.title}</div>
            <div style={{ fontSize: 12, color: '#C8A96E', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {prop.asset_label || prop.asset_type} — Generate Teaser
            </div>
          </div>
        </div>

        {/* Field selection */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 10 }}>
            Select fields to include
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {FIELD_OPTIONS.map(f => (
              <label key={f.key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
                background: selectedFields.includes(f.key) ? 'rgba(200,169,110,0.1)' : 'transparent',
                border: `1px solid ${selectedFields.includes(f.key) ? 'rgba(200,169,110,0.3)' : border}`,
                color: text, transition: 'all 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={selectedFields.includes(f.key)}
                  onChange={() => toggle(f.key)}
                  style={{ accentColor: '#C8A96E' }}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        {/* Brand + Language */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Brand</div>
            <select value={brand} onChange={e => setBrand(e.target.value)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
              border: `1px solid ${border}`, background: bg, color: text,
            }}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Language</div>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
              border: `1px solid ${border}`, background: bg, color: text,
            }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: `1px solid ${border}`,
            background: 'transparent', color: muted, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleGenerate} disabled={loading || selectedFields.length === 0} style={{
            padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: loading ? 'rgba(200,169,110,0.3)' : 'linear-gradient(135deg,#08316F,#0a4a9a)',
            color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
            opacity: selectedFields.length === 0 ? 0.4 : 1,
          }}>
            {loading ? 'Generating...' : 'Generate Teaser'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Portfolio modal ───────────────────────────────────────────────────────────
function PortfolioModal({ properties, selectedIds, brands, onClose, onGenerate, dark }) {
  const [brand, setBrand] = useState(brands[0]?.id || 'rodschinson')
  const [language, setLanguage] = useState('EN')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState(selectedIds.length > 0 ? 'selected' : 'all')

  const bg = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  // Group by type for preview
  const targetProps = mode === 'selected'
    ? properties.filter(p => selectedIds.includes(p.odoo_id))
    : properties
  const typeGroups = {}
  targetProps.forEach(p => {
    const t = p.asset_type || 'other'
    if (!typeGroups[t]) typeGroups[t] = []
    typeGroups[t].push(p)
  })
  const sortedTypes = Object.keys(typeGroups).sort()

  const handleGenerate = async () => {
    setLoading(true)
    await onGenerate({ brand, language, propertyIds: mode === 'selected' ? selectedIds : null })
    setLoading(false)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: bg, borderRadius: 16, padding: 28, maxWidth: 580, width: '90%',
        border: `1px solid ${border}`, maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 28 }}>📋</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: text }}>Generate Portfolio</div>
            <div style={{ fontSize: 12, color: '#00B6FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Multi-page PDF — Properties by Asset Type
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>
            Properties to include
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('all')} style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${mode === 'all' ? '#00B6FF' : border}`,
              background: mode === 'all' ? 'rgba(0,182,255,0.1)' : 'transparent',
              color: mode === 'all' ? '#00B6FF' : text,
            }}>
              All Properties ({properties.length})
            </button>
            <button onClick={() => setMode('selected')} disabled={selectedIds.length === 0} style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${mode === 'selected' ? '#00B6FF' : border}`,
              background: mode === 'selected' ? 'rgba(0,182,255,0.1)' : 'transparent',
              color: mode === 'selected' ? '#00B6FF' : text,
              opacity: selectedIds.length === 0 ? 0.4 : 1,
            }}>
              Selected ({selectedIds.length})
            </button>
          </div>
        </div>

        {/* Type breakdown preview */}
        <div style={{
          marginBottom: 18, padding: 14, borderRadius: 8,
          background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(8,49,111,0.02)',
          border: `1px solid ${border}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 10 }}>
            Portfolio breakdown
          </div>
          {sortedTypes.length === 0 ? (
            <div style={{ fontSize: 12, color: muted }}>No properties selected</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sortedTypes.map(t => (
                <span key={t} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(8,49,111,0.05)',
                  color: text,
                }}>
                  {ASSET_ICONS[t] || '🏢'} {ASSET_LABELS[t] || t} ({typeGroups[t].length})
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: '#00B6FF' }}>
            {targetProps.length} properties — ~{Math.ceil(targetProps.length / 4) + 3} pages
          </div>
        </div>

        {/* Brand + Language */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Brand</div>
            <select value={brand} onChange={e => setBrand(e.target.value)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
              border: `1px solid ${border}`, background: bg, color: text,
            }}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Language</div>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
              border: `1px solid ${border}`, background: bg, color: text,
            }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: `1px solid ${border}`,
            background: 'transparent', color: muted, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleGenerate} disabled={loading || targetProps.length === 0} style={{
            padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: loading ? 'rgba(0,182,255,0.3)' : 'linear-gradient(135deg,#08316F,#0a4a9a)',
            color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
            opacity: targetProps.length === 0 ? 0.4 : 1,
          }}>
            {loading ? 'Generating...' : `Generate Portfolio (${targetProps.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Long Teaser modal ────────────────────────────────────────────────────────
function LongTeaserModal({ prop, brands, onClose, onGenerate, dark }) {
  const [brand, setBrand] = useState(brands[0]?.id || 'rodschinson')
  const [language, setLanguage] = useState('FR')
  const [loading, setLoading] = useState(false)
  const [address, setAddress] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [sharepointUrl, setSharepointUrl] = useState('')
  const [expertiseUrl, setExpertiseUrl] = useState('')
  const [surfaces, setSurfaces] = useState([])
  const [photos, setPhotos] = useState([])
  const [plans, setPlans] = useState([])
  const [documents, setDocuments] = useState([])

  const bg = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${border}`, background: bg, color: text }

  const addSurface = () => setSurfaces(prev => [...prev, { floor: '', area: '' }])
  const removeSurface = (i) => setSurfaces(prev => prev.filter((_, idx) => idx !== i))
  const updateSurface = (i, key, val) => setSurfaces(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s))

  const handleFiles = (e, setter) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => setter(prev => [...prev, reader.result])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const handleDocFiles = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => setDocuments(prev => [...prev, { name: file.name, type: file.type, data: reader.result }])
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeFile = (setter, i) => setter(prev => prev.filter((_, idx) => idx !== i))

  const handleGenerate = async () => {
    setLoading(true)
    await onGenerate({ prop, brand, language, photos, plans, documents, fields: { address, paymentTerms, sharepointUrl, expertiseUrl, surfaces } })
    setLoading(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: bg, borderRadius: 16, padding: 24, maxWidth: 640, width: '92%', border: `1px solid ${border}`, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span style={{ fontSize: 24 }}>{ASSET_ICONS[prop.asset_type] || '🏢'}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{prop.title}</div>
            <div style={{ fontSize: 11, color: '#08316F', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Long Teaser — Detailed PDF</div>
          </div>
        </div>

        {/* Photos upload */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Photos (exterior + interior)</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ position: 'relative', width: 64, height: 48, borderRadius: 4, overflow: 'hidden', border: `1px solid ${border}` }}>
                <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removeFile(setPhotos, i)} style={{ position: 'absolute', top: 1, right: 1, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '14px' }}>x</button>
              </div>
            ))}
            <label style={{ width: 64, height: 48, borderRadius: 4, border: `2px dashed ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: muted }}>
              +
              <input type="file" accept="image/*" multiple onChange={e => handleFiles(e, setPhotos)} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Plans upload */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Floor Plans</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {plans.map((p, i) => (
              <div key={i} style={{ position: 'relative', width: 64, height: 48, borderRadius: 4, overflow: 'hidden', border: `1px solid ${border}` }}>
                <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removeFile(setPlans, i)} style={{ position: 'absolute', top: 1, right: 1, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '14px' }}>x</button>
              </div>
            ))}
            <label style={{ width: 64, height: 48, borderRadius: 4, border: `2px dashed ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: muted }}>
              +
              <input type="file" accept="image/*" multiple onChange={e => handleFiles(e, setPlans)} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Source documents upload (optional AI extraction) */}
        <div style={{ marginBottom: 14, padding: 10, borderRadius: 6, border: `1px dashed ${border}`, background: 'rgba(0,182,255,0.03)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>
            Source Documents <span style={{ textTransform: 'none', color: '#00B6FF', fontWeight: 500 }}>(optional — AI will extract missing info)</span>
          </div>
          <div style={{ fontSize: 10, color: muted, marginBottom: 8, lineHeight: 1.5 }}>
            Upload PDFs, Word docs, or images. AI will extract address, surfaces, and other details only for fields you leave empty.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {documents.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 4, background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(8,49,111,0.04)', fontSize: 11, color: text, maxWidth: 220 }}>
                <span style={{ fontSize: 14 }}>📄</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.name}</span>
                <button onClick={() => removeFile(setDocuments, i)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <label style={{ padding: '6px 12px', borderRadius: 4, border: `1px dashed ${border}`, cursor: 'pointer', fontSize: 11, color: '#00B6FF', fontWeight: 600 }}>
              + Add document
              <input type="file" accept=".pdf,.doc,.docx,.txt,image/*" multiple onChange={handleDocFiles} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Address */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Full Address</div>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, Postal Code, City" style={inputStyle} />
        </div>

        {/* Surface table */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>Surface Details</div>
            <button onClick={addSurface} style={{ padding: '3px 10px', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: '#00B6FF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Add Floor</button>
          </div>
          {surfaces.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input value={s.floor} onChange={e => updateSurface(i, 'floor', e.target.value)} placeholder="Floor name" style={{ ...inputStyle, flex: 1 }} />
              <input value={s.area} onChange={e => updateSurface(i, 'area', e.target.value)} placeholder="Area (m2)" style={{ ...inputStyle, width: 100 }} />
              <button onClick={() => removeSurface(i)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>x</button>
            </div>
          ))}
        </div>

        {/* Links */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>SharePoint Dossier URL</div>
            <input value={sharepointUrl} onChange={e => setSharepointUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Expertise PDF URL</div>
            <input value={expertiseUrl} onChange={e => setExpertiseUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
          </div>
        </div>

        {/* Payment terms */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Payment Terms (optional)</div>
          <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. credit vendeur sur 24 mois" style={inputStyle} />
        </div>

        {/* Brand + Language */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Brand</div>
            <select value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Language</div>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle}>{LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: muted, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleGenerate} disabled={loading} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: loading ? 'rgba(8,49,111,0.3)' : 'linear-gradient(135deg,#08316F,#0a4a9a)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
            {loading ? 'Generating...' : 'Generate Long Teaser'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Valuation modal ──────────────────────────────────────────────────────────
function ValuationModal({ prop, brands, onClose, onGenerate, dark }) {
  const [brand, setBrand] = useState(brands[0]?.id || 'rodschinson')
  const [language, setLanguage] = useState('EN')
  const [loading, setLoading] = useState(false)

  const methods = VALUATION_METHODS[prop.asset_type] || VALUATION_METHODS.building
  const bg = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  const handleGenerate = async () => {
    setLoading(true)
    await onGenerate({ prop, brand, language })
    setLoading(false)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: bg, borderRadius: 16, padding: 28, maxWidth: 520, width: '90%',
        border: `1px solid ${border}`, maxHeight: '85vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 28 }}>{ASSET_ICONS[prop.asset_type] || '🏢'}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{prop.title}</div>
            <div style={{ fontSize: 12, color: '#00B6FF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              AI Valuation Report
            </div>
          </div>
        </div>

        {/* Property info */}
        <div style={{
          padding: 14, borderRadius: 8, marginBottom: 18,
          background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(8,49,111,0.02)',
          border: `1px solid ${border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: muted }}>Asset Type</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: text }}>{prop.asset_label || prop.asset_type}</span>
          </div>
          {prop.price && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: muted }}>Asking Price</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: text }}>{prop.price}</span>
            </div>
          )}
          {prop.reference && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: muted }}>Reference</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#00B6FF' }}>{prop.reference}</span>
            </div>
          )}
        </div>

        {/* Valuation methods */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 8 }}>
            Valuation methods (AI-powered)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {methods.map(m => (
              <span key={m} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: 'rgba(0,182,255,0.08)', border: '1px solid rgba(0,182,255,0.15)',
                color: '#00B6FF',
              }}>{m}</span>
            ))}
          </div>
        </div>

        {/* Brand + Language */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Brand</div>
            <select value={brand} onChange={e => setBrand(e.target.value)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
              border: `1px solid ${border}`, background: bg, color: text,
            }}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Language</div>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
              border: `1px solid ${border}`, background: bg, color: text,
            }}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', borderRadius: 8, border: `1px solid ${border}`,
            background: 'transparent', color: muted, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleGenerate} disabled={loading} style={{
            padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: loading ? 'rgba(0,182,255,0.3)' : 'linear-gradient(135deg,#08316F,#0a4a9a)',
            color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
          }}>
            {loading ? 'Analyzing...' : 'Generate Valuation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Properties() {
  const { dark } = useTheme()
  const { brands } = useBrands()
  const { trackJob } = useGeneration()
  const { toast } = useToast()

  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalProp, setModalProp] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [showPortfolio, setShowPortfolio] = useState(false)
  const [valuationProp, setValuationProp] = useState(null)
  const [longTeaserProp, setLongTeaserProp] = useState(null)

  // Load cached properties
  const loadProperties = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/properties')
      if (res.ok) {
        setProperties(await res.json())
      } else {
        setProperties([])
      }
    } catch {
      setError('Could not load properties')
      setProperties([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProperties() }, [loadProperties])

  // Sync from Odoo
  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      const res = await apiFetch('/api/odoo/sync-properties', { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Sync failed (${res.status})`)
      }
      const data = await res.json()
      setProperties(data.properties || [])
      toast(`Synced ${data.synced} properties from Odoo`, 'success')
    } catch (e) {
      setError(e.message)
      toast(e.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  // Generate teaser
  const handleGenerate = async ({ prop, selectedFields, brand, language }) => {
    try {
      const payload = {
        subject: prop.title || 'Property Teaser',
        brand,
        language,
        contentType: 'property_teaser',
        template: prop.template || 'teaser_building',
        platforms: ['email', 'linkedin'],
        property_data: prop,
        selected_fields: selectedFields,
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      const res = await apiFetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Generation failed')
      }
      const { job_id } = await res.json()
      trackJob(job_id, { title: prop.title, contentType: 'property_teaser' })
      toast('Teaser generation started', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Toggle property selection for portfolio
  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    const allIds = filtered.map(p => p.odoo_id)
    setSelectedIds(prev => {
      const allSelected = allIds.every(id => prev.includes(id))
      if (allSelected) return prev.filter(id => !allIds.includes(id))
      return [...new Set([...prev, ...allIds])]
    })
  }

  // Generate portfolio
  const handleGeneratePortfolio = async ({ brand, language, propertyIds }) => {
    try {
      const payload = {
        subject: 'Property Portfolio',
        brand,
        language,
        contentType: 'property_portfolio',
        template: 'portfolio',
        platforms: ['email'],
        selected_property_ids: propertyIds,
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      const res = await apiFetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Portfolio generation failed')
      }
      const { job_id } = await res.json()
      trackJob(job_id, { title: 'Property Portfolio', contentType: 'property_portfolio' })
      toast('Portfolio generation started', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Generate valuation
  const handleGenerateValuation = async ({ prop, brand, language }) => {
    try {
      const payload = {
        subject: prop.title || 'Property Valuation',
        brand,
        language,
        contentType: 'property_valuation',
        template: 'valuation',
        platforms: ['email'],
        property_data: prop,
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      const res = await apiFetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Valuation generation failed')
      }
      const { job_id } = await res.json()
      trackJob(job_id, { title: `Valuation: ${prop.title}`, contentType: 'property_valuation' })
      toast('Valuation analysis started', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Generate long teaser
  const handleGenerateLongTeaser = async ({ prop, brand, language, photos, plans, documents, fields }) => {
    try {
      const payload = {
        subject: prop.title || 'Property Long Teaser',
        brand,
        language,
        contentType: 'property_long_teaser',
        template: 'teaser_long',
        platforms: ['email'],
        property_data: prop,
        photos,
        plans,
        documents: documents || [],
        long_teaser_fields: {
          address: fields.address,
          payment_terms: fields.paymentTerms,
          sharepoint_url: fields.sharepointUrl,
          expertise_url: fields.expertiseUrl,
          surfaces: fields.surfaces,
        },
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      const res = await apiFetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Long teaser generation failed')
      }
      const { job_id } = await res.json()
      trackJob(job_id, { title: `Long Teaser: ${prop.title}`, contentType: 'property_long_teaser' })
      toast('Long teaser generation started', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Filtered list
  const assetTypes = [...new Set(properties.map(p => p.asset_type).filter(Boolean))]
  const filtered = properties.filter(p => {
    if (typeFilter !== 'all' && p.asset_type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (p.title || '').toLowerCase().includes(q) ||
             (p.reference || '').toLowerCase().includes(q) ||
             (p.description || '').toLowerCase().includes(q) ||
             (p.agent || '').toLowerCase().includes(q)
    }
    return true
  })

  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: text, margin: 0 }}>Properties</h1>
          <p style={{ fontSize: 13, color: muted, margin: '4px 0 0' }}>
            {properties.length} properties from Odoo — generate PDF teasers
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {properties.length > 0 && (
            <button onClick={() => setShowPortfolio(true)} style={{
              padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid rgba(8,49,111,0.3)', background: 'rgba(8,49,111,0.06)',
              color: '#08316F', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              📋 Portfolio {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </button>
          )}
          <button onClick={handleSync} disabled={syncing} style={{
            padding: '9px 20px', borderRadius: 8, cursor: syncing ? 'wait' : 'pointer',
            border: '1px solid rgba(0,182,255,0.3)', background: 'rgba(0,182,255,0.08)',
            color: '#00B6FF', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {syncing ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid rgba(0,182,255,0.3)', borderTopColor: '#00B6FF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                Syncing...
              </>
            ) : '🔄 Sync from Odoo'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 8, border: `1px solid ${border}`,
            background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
            color: text, fontSize: 13, width: 240, outline: 'none',
          }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`,
            background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
            color: text, fontSize: 13,
          }}
        >
          <option value="all">All Types</option>
          {assetTypes.map(t => (
            <option key={t} value={t}>{ASSET_ICONS[t] || '🏢'} {t}</option>
          ))}
        </select>
        {filtered.length > 0 && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            fontSize: 12, color: muted, marginLeft: 4,
          }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every(p => selectedIds.includes(p.odoo_id))}
              onChange={selectAll}
              style={{ accentColor: '#00B6FF' }}
            />
            Select all
          </label>
        )}
        {selectedIds.length > 0 && (
          <button onClick={() => setSelectedIds([])} style={{
            padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.06)',
            color: '#dc2626', fontSize: 11, fontWeight: 600,
          }}>
            Clear ({selectedIds.length})
          </button>
        )}
        <span style={{ fontSize: 12, color: muted }}>{filtered.length} shown</span>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
          color: '#dc2626', fontSize: 13,
        }}>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: muted }}>
          <span style={{ width: 28, height: 28, border: '3px solid rgba(0,182,255,0.2)', borderTopColor: '#00B6FF', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
          <div style={{ marginTop: 12, fontSize: 13 }}>Loading properties...</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && properties.length === 0 && !error && (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          border: `2px dashed ${border}`, borderRadius: 16,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏢</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: text, marginBottom: 8 }}>No properties yet</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
            Sync properties from your Odoo CRM to get started
          </div>
          <button onClick={handleSync} disabled={syncing} style={{
            padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
            border: 'none', background: 'linear-gradient(135deg,#08316F,#0a4a9a)',
            color: '#fff', fontSize: 14, fontWeight: 600,
          }}>
            🔄 Sync from Odoo
          </button>
        </div>
      )}

      {/* Cards grid */}
      {!loading && filtered.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 16,
        }}>
          {filtered.map(prop => (
            <PropertyCard
              key={prop.odoo_id}
              prop={prop}
              dark={dark}
              selected={selectedIds.includes(prop.odoo_id)}
              onToggleSelect={toggleSelect}
              onGenerate={() => setModalProp(prop)}
              onEvaluate={() => setValuationProp(prop)}
              onLongTeaser={() => setLongTeaserProp(prop)}
            />
          ))}
        </div>
      )}

      {/* Generate teaser modal */}
      {modalProp && (
        <GenerateModal
          prop={modalProp}
          brands={brands}
          dark={dark}
          onClose={() => setModalProp(null)}
          onGenerate={handleGenerate}
        />
      )}

      {/* Portfolio modal */}
      {showPortfolio && (
        <PortfolioModal
          properties={properties}
          selectedIds={selectedIds}
          brands={brands}
          dark={dark}
          onClose={() => setShowPortfolio(false)}
          onGenerate={handleGeneratePortfolio}
        />
      )}

      {/* Valuation modal */}
      {valuationProp && (
        <ValuationModal
          prop={valuationProp}
          brands={brands}
          dark={dark}
          onClose={() => setValuationProp(null)}
          onGenerate={handleGenerateValuation}
        />
      )}

      {/* Long Teaser modal */}
      {longTeaserProp && (
        <LongTeaserModal
          prop={longTeaserProp}
          brands={brands}
          dark={dark}
          onClose={() => setLongTeaserProp(null)}
          onGenerate={handleGenerateLongTeaser}
        />
      )}
    </div>
  )
}
