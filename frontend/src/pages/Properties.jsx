import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useBrands } from '../contexts/BrandContext'
import { useGeneration } from '../contexts/GenerationContext'
import { useToast } from '../contexts/ToastContext'
import { apiFetch } from '../utils/apiFetch'
import {
  Building2, Hotel, Factory, Stethoscope, Pill, Car, GraduationCap,
  ShoppingBag, HardHat, Dumbbell, Trees, Home, ClipboardList, Sparkles,
  Info, Phone, Satellite, Map as MapIcon, FileText, FolderOpen, Images, Camera,
  Users, RefreshCw, Plus, ChevronUp, ChevronDown,
} from 'lucide-react'

// ── Asset type icons ──────────────────────────────────────────────────────────
const ASSET_ICONS = {
  hotel: Hotel, clinic: Stethoscope, building: Building2, office: Building2,
  warehouse: Factory, logistics: Factory, resort: Trees, pharmacy: Pill,
  gym: Dumbbell, fitness: Dumbbell, parking: Car, student: GraduationCap,
  senior: Home, retail: ShoppingBag, residential: Home, mixed: Building2,
  land: HardHat, industrial: Factory,
}

// Render an asset-type icon by key, falling back to a generic building.
function AssetIcon({ type, size = 20, color }) {
  const Icon = ASSET_ICONS[type] || Building2
  return <Icon size={size} color={color} />
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
function PropertyCard({ prop, onGenerate, onEvaluate, onLongTeaser, onBuyers, dark, selected, onToggleSelect }) {
  return (
    <div style={{
      background: dark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `1px solid ${selected ? 'var(--cs-accent)' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      transition: 'border-color 0.2s',
    }}
    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--cs-gold)' }}
    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(prop.odoo_id)}
          onClick={e => e.stopPropagation()}
          style={{ accentColor: 'var(--cs-accent)', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
        />
        <span style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--cs-accent)' }}><AssetIcon type={prop.asset_type} size={28} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--cs-gold)' }}>
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
        {prop.price && <span style={{ fontWeight: 600, color: 'var(--cs-accent)' }}>{prop.price}</span>}
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
          border: '1px solid var(--cs-gold-soft)', background: 'var(--cs-gold-soft)',
          color: 'var(--cs-gold)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'all 0.2s', minWidth: 70,
        }}
        onMouseEnter={e => { e.target.style.background = 'var(--cs-hover)' }}
        onMouseLeave={e => { e.target.style.background = 'var(--cs-gold-soft)' }}
        >Teaser</button>
        <button onClick={() => onLongTeaser(prop)} style={{
          flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--cs-accent-line)', background: 'var(--cs-accent-soft)',
          color: 'var(--cs-accent)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'all 0.2s', minWidth: 70,
        }}
        onMouseEnter={e => { e.target.style.background = 'var(--cs-hover)' }}
        onMouseLeave={e => { e.target.style.background = 'var(--cs-accent-soft)' }}
        >Long Teaser</button>
        <button onClick={() => onEvaluate(prop)} style={{
          flex: 1, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--cs-accent-line)', background: 'var(--cs-accent-soft)',
          color: 'var(--cs-accent)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => { e.target.style.background = 'var(--cs-accent-soft)' }}
        onMouseLeave={e => { e.target.style.background = 'var(--cs-accent-soft)' }}
        >Evaluate</button>
        <button onClick={() => onBuyers(prop)} title="Buyer shortlist (applicants from Odoo)" style={{
          flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid rgba(16,150,90,0.4)', background: 'rgba(16,150,90,0.08)',
          color: '#0a7a43', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'all 0.2s', minWidth: 70,
        }}
        onMouseEnter={e => { e.target.style.background = 'rgba(16,150,90,0.18)' }}
        onMouseLeave={e => { e.target.style.background = 'rgba(16,150,90,0.08)' }}
        >Buyers</button>
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
  const border = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)'

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
          <span style={{ display: 'inline-flex', color: 'var(--cs-accent)' }}><AssetIcon type={prop.asset_type} size={28} /></span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{prop.title}</div>
            <div style={{ fontSize: 12, color: 'var(--cs-gold)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                background: selectedFields.includes(f.key) ? 'var(--cs-gold-soft)' : 'transparent',
                border: `1px solid ${selectedFields.includes(f.key) ? 'var(--cs-gold)' : border}`,
                color: text, transition: 'all 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={selectedFields.includes(f.key)}
                  onChange={() => toggle(f.key)}
                  style={{ accentColor: 'var(--cs-gold)' }}
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
            background: loading ? 'var(--cs-accent-line)' : 'var(--cs-accent)',
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
  const border = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)'

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
          <span style={{ display: 'inline-flex', color: 'var(--cs-accent)' }}><ClipboardList size={28} /></span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: text }}>Generate Portfolio</div>
            <div style={{ fontSize: 12, color: 'var(--cs-accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
              border: `1px solid ${mode === 'all' ? 'var(--cs-accent)' : border}`,
              background: mode === 'all' ? 'var(--cs-accent-soft)' : 'transparent',
              color: mode === 'all' ? 'var(--cs-accent)' : text,
            }}>
              All Properties ({properties.length})
            </button>
            <button onClick={() => setMode('selected')} disabled={selectedIds.length === 0} style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              border: `1px solid ${mode === 'selected' ? 'var(--cs-accent)' : border}`,
              background: mode === 'selected' ? 'var(--cs-accent-soft)' : 'transparent',
              color: mode === 'selected' ? 'var(--cs-accent)' : text,
              opacity: selectedIds.length === 0 ? 0.4 : 1,
            }}>
              Selected ({selectedIds.length})
            </button>
          </div>
        </div>

        {/* Type breakdown preview */}
        <div style={{
          marginBottom: 18, padding: 14, borderRadius: 8,
          background: dark ? 'rgba(255,255,255,0.03)' : 'var(--cs-surface2)',
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
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  background: dark ? 'rgba(255,255,255,0.06)' : 'var(--cs-accent-soft)',
                  color: text,
                }}>
                  <AssetIcon type={t} size={14} color="var(--cs-accent)" /> {ASSET_LABELS[t] || t} ({typeGroups[t].length})
                </span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--cs-accent)' }}>
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
            background: loading ? 'var(--cs-accent-line)' : 'var(--cs-accent)',
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
const LONG_TEASER_AGENTS = [
  { id: 'sandra',  name: 'Sandra Charan', email: 'sandra.charan@rodschinson.com', phone: '+32 480 205 004', role: 'Investment Portfolio Manager' },
  { id: 'bea',     name: 'Bea Neetens',   email: 'bea.neetens@rodschinson.com',   phone: '+32 480 20 50 07', role: 'Investment Portfolio Manager' },
]

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
  const [mapImage] = useState('')
  // Per-role page images + gallery photo categories
  const [coverImage, setCoverImage] = useState('')       // first page (cover)
  const [salesImage, setSalesImage] = useState('')       // last contact page
  const [aerialImage, setAerialImage] = useState('')     // aerial view page
  const [cadastralImage, setCadastralImage] = useState('') // cadastral parcel / map page
  const [photoCats, setPhotoCats] = useState([])         // parallel to photos
  const [documents, setDocuments] = useState([])
  const [agentId, setAgentId] = useState(LONG_TEASER_AGENTS[0].id)

  // AI edit bar — free-text instruction that rewrites one or more form fields
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiFeedback, setAiFeedback] = useState(null) // { kind: 'ok'|'err', text }

  const FIELD_SETTERS = {
    address: setAddress,
    paymentTerms: setPaymentTerms,
    sharepointUrl: setSharepointUrl,
    expertiseUrl: setExpertiseUrl,
    surfaces: setSurfaces,
  }

  const handleAiEdit = async () => {
    const instruction = aiPrompt.trim()
    if (!instruction || aiBusy) return
    setAiBusy(true)
    setAiFeedback(null)
    try {
      const res = await apiFetch('/api/long-teaser/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: instruction,
          fields: { address, paymentTerms, sharepointUrl, expertiseUrl, surfaces },
          context: { property_title: prop?.title || '', asset_type: prop?.asset_type || '', language },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `AI edit failed (${res.status})`)
      }
      const { fields: updated = {}, summary = '' } = await res.json()
      const changedKeys = Object.keys(updated)
      changedKeys.forEach(k => {
        const setter = FIELD_SETTERS[k]
        if (setter) setter(updated[k])
      })
      if (changedKeys.length === 0) {
        setAiFeedback({ kind: 'err', text: summary || 'No changes applied — try rephrasing.' })
      } else {
        setAiFeedback({ kind: 'ok', text: `${summary} (updated: ${changedKeys.join(', ')})` })
        setAiPrompt('')
      }
    } catch (e) {
      setAiFeedback({ kind: 'err', text: e.message })
    } finally {
      setAiBusy(false)
    }
  }

  const bg = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)'
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${border}`, background: bg, color: text }

  const addSurface = () => setSurfaces(prev => [...prev, { floor: '', area: '' }])
  const removeSurface = (i) => setSurfaces(prev => prev.filter((_, idx) => idx !== i))
  const updateSurface = (i, key, val) => setSurfaces(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s))

  const handlePlanFiles = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        // Tag PDFs with a marker so we render them differently in the UI
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        setPlans(prev => [...prev, isPdf ? { type: 'pdf', name: file.name, data: reader.result } : reader.result])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }


  // Single-image role uploader (cover / contact / aerial / cadastral)
  const handleSingleFile = (e, setter) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setter(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Gallery photos keep a parallel category (exterior / interior / general)
  const PHOTO_CATS = ['Exterieur', 'Interieur', 'Algemeen']
  const handlePhotoFiles = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        setPhotos(prev => [...prev, reader.result])
        setPhotoCats(prev => [...prev, 'Exterieur'])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }
  const removePhoto = (i) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPhotoCats(prev => prev.filter((_, idx) => idx !== i))
  }
  const setPhotoCat = (i, val) => setPhotoCats(prev => prev.map((c, idx) => idx === i ? val : c))

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
    const agent = LONG_TEASER_AGENTS.find(a => a.id === agentId) || LONG_TEASER_AGENTS[0]
    await onGenerate({ prop, brand, language, photos, plans, mapImage, documents, coverImage, salesImage, aerialImage, cadastralImage, photoCats, fields: { address, paymentTerms, sharepointUrl, expertiseUrl, surfaces, agent } })
    setLoading(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: bg, borderRadius: 16, padding: 24, maxWidth: 640, width: '92%', border: `1px solid ${border}`, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ display: 'inline-flex', color: 'var(--cs-accent)' }}><AssetIcon type={prop.asset_type} size={24} /></span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{prop.title}</div>
            <div style={{ fontSize: 11, color: 'var(--cs-accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Long Teaser — Detailed PDF</div>
          </div>
        </div>

        {/* AI edit bar — ask Claude to change any field by describing it */}
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: `1px solid ${dark ? 'var(--cs-accent-line)' : 'var(--cs-accent-line)'}`, background: dark ? 'var(--cs-accent-soft)' : 'var(--cs-accent-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cs-accent)', marginBottom: 6 }}>
            <Sparkles size={12} color="var(--cs-gold)" /> Ask AI to change a field
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiEdit() } }}
              placeholder='e.g. "set address to Rue Belliard 33, 1040 Etterbeek" or "add ground floor 220 m²"'
              disabled={aiBusy}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleAiEdit}
              disabled={aiBusy || !aiPrompt.trim()}
              style={{ padding: '0 14px', borderRadius: 6, border: 'none', cursor: aiBusy || !aiPrompt.trim() ? 'not-allowed' : 'pointer', background: aiBusy || !aiPrompt.trim() ? 'var(--cs-accent-line)' : 'var(--cs-accent)', color: '#fff', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              {aiBusy ? 'Thinking…' : 'Apply'}
            </button>
          </div>
          {aiFeedback && (
            <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: aiFeedback.kind === 'ok' ? '#0a8f4a' : '#c0392b' }}>
              {aiFeedback.text}
            </div>
          )}
        </div>

        {/* How-to instructions */}
        <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 8, border: `1px solid ${border}`, background: dark ? 'var(--cs-accent-soft)' : 'var(--cs-accent-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--cs-accent)', marginBottom: 6 }}>
            <Info size={12} /> How to add photos &amp; request changes
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.55, color: text }}>
            <li><b>Page images:</b> pick the exact picture for the <i>cover</i>, the <i>contact</i> page, the <i>aerial view</i> and the <i>cadastral parcel</i> under <i>Page images</i>. Leave empty to auto-pick from the gallery.</li>
            <li><b>Gallery photos:</b> add them under <i>Gallery photos</i> and tag each <i>Exterieur / Interieur</i> — the gallery is organised by category.</li>
            <li><b>Floor plans:</b> drop images or a multi-page PDF in <i>Floor Plans</i>; each page becomes a plan slide.</li>
            <li><b>Source docs (PDF / Word):</b> drop dossiers under <i>Source Documents</i>; the AI extracts price, yield, surfaces, leases, etc. into empty fields.</li>
            <li><b>Apply changes later:</b> reopen this form, edit / re-upload, then regenerate — fields you leave empty fall back to AI extraction.</li>
          </ul>
        </div>

        {/* Page images — choose which picture goes on each key page */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>
            Page images <span style={{ textTransform: 'none', color: 'var(--cs-accent)', fontWeight: 500 }}>(optional — pick a picture per page)</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              [Home, 'Cover (first page)', coverImage, setCoverImage],
              [Phone, 'Contact (last page)', salesImage, setSalesImage],
              [Satellite, 'Aerial view', aerialImage, setAerialImage],
              [MapIcon, 'Cadastral parcel', cadastralImage, setCadastralImage],
            ].map(([LabelIcon, label, val, setter], idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 600, color: muted, marginBottom: 3 }}><LabelIcon size={12} /> {label}</div>
                {val ? (
                  <div style={{ position: 'relative', width: '100%', height: 56, borderRadius: 4, overflow: 'hidden', border: `1px solid ${border}` }}>
                    <img src={val} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => setter('')} style={{ position: 'absolute', top: 1, right: 1, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '14px' }}>x</button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 56, borderRadius: 4, border: `2px dashed ${border}`, cursor: 'pointer', fontSize: 11, color: muted }}>
                    + Upload
                    <input type="file" accept="image/*" onChange={e => handleSingleFile(e, setter)} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Photos upload — gallery, each tagged exterior / interior / general */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>
            Gallery photos <span style={{ textTransform: 'none', color: 'var(--cs-accent)', fontWeight: 500 }}>(tag each as exterior / interior to organise the gallery)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
            {photos.map((p, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 72 }}>
                <div style={{ position: 'relative', width: 72, height: 52, borderRadius: 4, overflow: 'hidden', border: `1px solid ${border}` }}>
                  <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removePhoto(i)} style={{ position: 'absolute', top: 1, right: 1, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '14px' }}>x</button>
                </div>
                <select value={photoCats[i] || 'Exterieur'} onChange={e => setPhotoCat(i, e.target.value)} style={{ width: '100%', fontSize: 9.5, padding: '2px 3px', borderRadius: 3, border: `1px solid ${border}`, background: bg, color: text }}>
                  {PHOTO_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
            <label style={{ width: 72, height: 52, borderRadius: 4, border: `2px dashed ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: muted }}>
              +
              <input type="file" accept="image/*" multiple onChange={handlePhotoFiles} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Plans upload (images or PDF — PDF pages auto-extracted) */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>
            Floor Plans <span style={{ textTransform: 'none', color: 'var(--cs-accent)', fontWeight: 500 }}>(images or PDF — each page becomes a plan)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {plans.map((p, i) => {
              const isPdfPlan = typeof p === 'object' && p?.type === 'pdf'
              return (
                <div key={i} style={{ position: 'relative', width: isPdfPlan ? 110 : 64, height: 48, borderRadius: 4, overflow: 'hidden', border: `1px solid ${border}`, background: isPdfPlan ? 'rgba(220,38,38,0.08)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: isPdfPlan ? '0 8px' : 0 }}>
                  {isPdfPlan ? (
                    <>
                      <FileText size={18} color="#dc2626" />
                      <span style={{ fontSize: 9, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    </>
                  ) : (
                    <img src={p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <button onClick={() => removeFile(setPlans, i)} style={{ position: 'absolute', top: 1, right: 1, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '14px' }}>x</button>
                </div>
              )
            })}
            <label style={{ width: 64, height: 48, borderRadius: 4, border: `2px dashed ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, color: muted }}>
              +
              <input type="file" accept="image/*,application/pdf" multiple onChange={handlePlanFiles} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Source documents upload (optional AI extraction) */}
        <div style={{ marginBottom: 14, padding: 10, borderRadius: 6, border: `1px dashed ${border}`, background: 'var(--cs-accent-soft)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>
            Source Documents <span style={{ textTransform: 'none', color: 'var(--cs-accent)', fontWeight: 500 }}>(optional — AI will extract missing info)</span>
          </div>
          <div style={{ fontSize: 10, color: muted, marginBottom: 8, lineHeight: 1.5 }}>
            Upload PDFs, Word docs, or images. AI will extract address, surfaces, and other details only for fields you leave empty.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {documents.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 4, background: dark ? 'rgba(255,255,255,0.04)' : 'var(--cs-accent-soft)', fontSize: 11, color: text, maxWidth: 220 }}>
                <FileText size={14} color="var(--cs-text-sub)" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.name}</span>
                <button onClick={() => removeFile(setDocuments, i)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
              </div>
            ))}
            <label style={{ padding: '6px 12px', borderRadius: 4, border: `1px dashed ${border}`, cursor: 'pointer', fontSize: 11, color: 'var(--cs-accent)', fontWeight: 600 }}>
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
            <button onClick={addSurface} style={{ padding: '3px 10px', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: 'var(--cs-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>+ Add Floor</button>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Brand</div>
            <select value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>Language</div>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle}>{LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </div>
        </div>

        {/* Agent — shown on the sales conditions page */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 4 }}>
            Contact Agent <span style={{ textTransform: 'none', color: 'var(--cs-accent)', fontWeight: 500 }}>(appears on the sales conditions page)</span>
          </div>
          <select value={agentId} onChange={e => setAgentId(e.target.value)} style={inputStyle}>
            {LONG_TEASER_AGENTS.map(a => (
              <option key={a.id} value={a.id}>{a.name} — {a.email} — {a.phone}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: muted, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleGenerate} disabled={loading} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: loading ? 'var(--cs-accent-line)' : 'var(--cs-accent)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
            {loading ? 'Generating...' : 'Generate Long Teaser'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New Long Teaser modal (single property OR multiple assets) ────────────────
// Single: a flat gallery + one address.
// Multiple: ONE folder with a subfolder per building; each subfolder's images
// become that building's gallery, and each building gets its own address (→ its
// own aerial view + cadastral parcel) and location page. Optional shared
// documents feed the AI extraction that fills financials per building.
const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i
function PortfolioTeaserModal({ brands, properties = [], onClose, onGenerate, dark }) {
  const { toast } = useToast()
  const [mode, setMode] = useState('single')      // 'single' | 'multiple'
  const [brand, setBrand] = useState(brands[0]?.id || 'rodschinson')
  const [language, setLanguage] = useState('FR')
  const [title, setTitle] = useState('')
  const [address, setAddress] = useState('')      // single mode
  const [photos, setPhotos] = useState([])        // single mode flat gallery [dataURI]
  const [assets, setAssets] = useState([])        // multiple mode [{ name, address, photos:[dataURI] }]
  const [documents, setDocuments] = useState([])
  const [reading, setReading] = useState(false)
  const [loading, setLoading] = useState(false)
  // Ref callback that turns a plain file input into a FOLDER picker the instant it
  // mounts. Setting webkitdirectory/directory via the DOM node is reliable, whereas
  // the JSX attribute is sometimes dropped by React (→ folder dialog never opens).
  const asFolderInput = (el) => { if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', '') } }
  // Shared deal details (same as the single-property form)
  const [odooId, setOdooId] = useState('')        // optional: seed company-wide data from an Odoo property
  const [sharepointUrl, setSharepointUrl] = useState('')
  const [expertiseUrl, setExpertiseUrl] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [agentId, setAgentId] = useState(LONG_TEASER_AGENTS[0].id)

  const bg = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)'
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${border}`, background: bg, color: text }

  const readAsDataUrl = (file) => new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => resolve(null)
    r.readAsDataURL(file)
  })

  // Downscale a photo in the browser (longest edge 2000px, JPEG) BEFORE upload.
  // Keeps payloads small/reliable and normalises format. Returns null if the
  // browser can't decode the file (e.g. HEIC in Chrome) so we can flag it.
  const downscaleToDataUrl = (file, maxEdge = 2000, quality = 0.82) => new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const out = canvas.toDataURL('image/jpeg', quality)
        URL.revokeObjectURL(url)
        resolve(out && out.length > 40 ? out : null)
      } catch { URL.revokeObjectURL(url); resolve(null) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })

  // A folder pick gives files with webkitRelativePath like "Root/Building A/img.jpg".
  // Group by the FIRST subfolder under the root → one asset per subfolder.
  const handleFolderPick = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) { toast('No files were selected from the folder.', 'error'); return }
    setReading(true)
    try {
      const imgs = files.filter(f => IMG_RE.test(f.name))
      if (!imgs.length) { toast(`Folder has ${files.length} file(s) but no images (jpg/png/webp).`, 'error'); return }
      const groups = new Map()  // subfolder name → [File]
      for (const f of imgs) {
        const rel = f.webkitRelativePath || f.name
        const parts = rel.split('/').filter(Boolean)
        // parts[0] is the chosen folder; parts[1] is the per-asset subfolder.
        // A flat folder (no subfolders) → a single building.
        const sub = parts.length >= 3 ? parts[1] : (parts.length === 2 ? parts[0] : (parts[0] || 'Building 1'))
        if (!groups.has(sub)) groups.set(sub, [])
        groups.get(sub).push(f)
      }
      const next = []
      let skipped = 0
      const emptyBuildings = []  // subfolders whose images all failed to decode
      for (const [name, groupFiles] of groups) {
        groupFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        const results = await Promise.all(groupFiles.map(f => downscaleToDataUrl(f)))
        const ph = results.filter(Boolean)
        skipped += results.length - ph.length
        // Keep the building even if none of its images could be decoded — the
        // subfolder was detected, so it must show up (user can re-add photos in
        // the editor). Silently dropping it here made "6 folders" read as "5".
        if (!ph.length) emptyBuildings.push(name)
        next.push({ name, address: '', photos: ph })
      }
      next.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      setAssets(next)
      const totalPh = next.reduce((s, a) => s + a.photos.length, 0)
      if (next.length) toast(`Loaded ${next.length} building(s), ${totalPh} photo(s).`, 'success')
      if (emptyBuildings.length) toast(`No readable photo for: ${emptyBuildings.join(', ')} — likely HEIC (iPhone). Export as JPEG/PNG and re-add.`, 'error')
      else if (skipped) toast(`${skipped} image(s) couldn't be read (often HEIC) — export as JPEG/PNG.`, 'error')
      if (!next.length) toast(`Found ${imgs.length} image(s) but none could be read — likely HEIC (iPhone). Export the folder as JPEG/PNG and retry.`, 'error')
    } catch (err) {
      toast(`Folder read failed: ${err?.message || err}`, 'error')
    } finally {
      setReading(false)
    }
  }

  // Single mode: flat gallery from a folder or selected images.
  const handlePhotoPick = async (e) => {
    const files = Array.from(e.target.files || []).filter(f => IMG_RE.test(f.name))
    e.target.value = ''
    if (!files.length) return
    setReading(true)
    try {
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      const results = await Promise.all(files.map(f => downscaleToDataUrl(f)))
      const ph = results.filter(Boolean)
      setPhotos(prev => [...prev, ...ph])
      const skipped = results.length - ph.length
      if (skipped) toast(`${skipped} photo(s) couldn't be read (e.g. HEIC). Export them as JPEG/PNG.`, 'error')
    } finally {
      setReading(false)
    }
  }

  const handleDocFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      const data = await readAsDataUrl(file)
      if (data) setDocuments(prev => [...prev, { name: file.name, type: file.type, data }])
    }
  }

  const setAssetField = (i, key, val) => setAssets(prev => prev.map((a, idx) => idx === i ? { ...a, [key]: val } : a))
  const removeAsset = (i) => setAssets(prev => prev.filter((_, idx) => idx !== i))
  const moveAsset = (i, dir) => setAssets(prev => {
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n
  })

  const totalPhotos = assets.reduce((s, a) => s + a.photos.length, 0)
  const canGenerate = !loading && !reading && (
    mode === 'multiple'
      ? assets.length > 0 && assets.every(a => a.name.trim())
      : photos.length > 0
  )

  const odooProp = odooId ? properties.find(p => String(p.odoo_id) === String(odooId)) : null
  // Picking an Odoo property seeds the title/address if the user hasn't typed them.
  const pickOdoo = (id) => {
    setOdooId(id)
    const p = id ? properties.find(x => String(x.odoo_id) === String(id)) : null
    if (p) {
      if (!title.trim()) setTitle(p.title || '')
      if (mode === 'single' && !address.trim() && p.address) setAddress(p.address)
    }
  }

  const handleSubmit = async () => {
    if (!canGenerate) return
    setLoading(true)
    try {
      const agent = LONG_TEASER_AGENTS.find(a => a.id === agentId) || LONG_TEASER_AGENTS[0]
      await onGenerate({
        mode, title, address, brand, language,
        folderAssets: assets, photos, documents,
        odooProp,
        sharepointUrl, expertiseUrl, paymentTerms, agent,
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const Tab = ({ id, label, sub }) => {
    const on = mode === id
    return (
      <button onClick={() => setMode(id)} style={{
        flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
        border: `1px solid ${on ? 'var(--cs-accent)' : border}`,
        background: on ? 'var(--cs-accent-soft)' : 'transparent',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--cs-accent)' : text }}>{label}</div>
        <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{sub}</div>
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: bg, borderRadius: 16, padding: 24, maxWidth: 640, width: '92%', border: `1px solid ${border}`, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ display: 'inline-flex', color: 'var(--cs-accent)' }}><FolderOpen size={24} /></span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>New Long Teaser</div>
            <div style={{ fontSize: 11, color: 'var(--cs-accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Single property or multiple assets</div>
          </div>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <Tab id="single"   label="Single property"  sub="One gallery + one address" />
          <Tab id="multiple" label="Multiple assets"  sub="One folder, a subfolder per building" />
        </div>

        {mode === 'multiple' ? (
          <>
            <p style={{ fontSize: 12, color: muted, margin: '0 0 12px', lineHeight: 1.5 }}>
              Pick one folder containing a <b>subfolder per building</b>. Each subfolder’s images become that building’s gallery; give each its address so it gets its own location + aerial view.
            </p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: `1px dashed ${border}`, cursor: 'pointer', color: 'var(--cs-accent)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              <FolderOpen size={15} /> {reading ? 'Reading folder…' : 'Choose folder…'}
              <input ref={asFolderInput} type="file" multiple onChange={handleFolderPick} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }} />
            </label>
            {assets.length > 0 && (
              <div style={{ fontSize: 11, color: muted, marginBottom: 10 }}>{assets.length} asset(s) · {totalPhotos} photo(s) detected</div>
            )}
            {assets.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                {assets.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, border: `1px solid ${border}`, borderRadius: 8, padding: 8 }}>
                    <span style={{ fontSize: 11, color: muted, width: 18, textAlign: 'center', paddingTop: 8 }}>{i + 1}</span>
                    <div style={{ flex: 1, display: 'grid', gap: 6 }}>
                      <input value={a.name} onChange={e => setAssetField(i, 'name', e.target.value)} placeholder="Building name" style={inputStyle} />
                      <input value={a.address} onChange={e => setAssetField(i, 'address', e.target.value)} placeholder="Address (street, postal code, city) — drives the aerial view" style={inputStyle} />
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: muted, whiteSpace: 'nowrap', paddingTop: 8 }}>{a.photos.length} <Camera size={12} /></span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
                      <button onClick={() => moveAsset(i, -1)} disabled={i === 0} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: bg, color: muted, cursor: i === 0 ? 'not-allowed' : 'pointer' }}><ChevronUp size={12} /></button>
                      <button onClick={() => moveAsset(i, 1)} disabled={i === assets.length - 1} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 6px', borderRadius: 3, border: `1px solid ${border}`, background: bg, color: muted, cursor: i === assets.length - 1 ? 'not-allowed' : 'pointer' }}><ChevronDown size={12} /></button>
                    </div>
                    <button onClick={() => removeAsset(i)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer', marginTop: 4 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Address <span style={{ fontWeight: 500 }}>(drives the location + aerial view)</span></label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, postal code, city" style={inputStyle} />
            </div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Gallery</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: photos.length ? 8 : 16 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: `1px dashed ${border}`, cursor: 'pointer', color: 'var(--cs-accent)', fontSize: 13, fontWeight: 600 }}>
                <Images size={15} /> Add images
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoPick} />
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: `1px dashed ${border}`, cursor: 'pointer', color: muted, fontSize: 13, fontWeight: 600 }}>
                <FolderOpen size={15} /> From folder
                <input ref={asFolderInput} type="file" multiple onChange={handlePhotoPick} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }} />
              </label>
            </div>
            {photos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, fontSize: 12, color: muted }}>
                {reading ? 'Reading…' : `${photos.length} photo(s)`}
                <button onClick={() => setPhotos([])} style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid rgba(220,38,38,0.3)`, background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>Clear</button>
              </div>
            )}
          </>
        )}

        {/* Shared documents */}
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Documents <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional — financials, leases…)</span></label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, border: `1px dashed ${border}`, cursor: 'pointer', color: muted, fontSize: 12, marginBottom: documents.length ? 6 : 16 }}>
          + Add documents
          <input type="file" accept=".pdf,.doc,.docx,.txt,image/*" multiple style={{ display: 'none' }} onChange={handleDocFiles} />
        </label>
        {documents.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {documents.map((d, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: text, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 6, padding: '4px 8px' }}>
                <FileText size={13} color="var(--cs-text-sub)" /> {d.name}
                <button onClick={() => setDocuments(prev => prev.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* Pull data from Odoo (optional) */}
        {properties.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted, marginBottom: 6 }}>Pull data from Odoo <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional — title, price, reference, contact)</span></label>
            <select value={odooId} onChange={e => pickOdoo(e.target.value)} style={inputStyle}>
              <option value="">— None (manual) —</option>
              {properties.map(p => (
                <option key={p.odoo_id} value={p.odoo_id}>{p.title}{p.reference ? ` · ${p.reference}` : ''}{p.price ? ` · ${p.price}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* Deal links */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>SharePoint dossier URL</label>
            <input value={sharepointUrl} onChange={e => setSharepointUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Expertise PDF URL</label>
            <input value={expertiseUrl} onChange={e => setExpertiseUrl(e.target.value)} placeholder="https://…" style={inputStyle} />
          </div>
        </div>

        {/* Payment terms */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Payment terms <span style={{ fontWeight: 500 }}>(optional)</span></label>
          <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="e.g. crédit vendeur sur 24 mois" style={inputStyle} />
        </div>

        {/* Contact agent */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Contact agent <span style={{ fontWeight: 500 }}>(appears on the sales conditions page)</span></label>
          <select value={agentId} onChange={e => setAgentId(e.target.value)} style={inputStyle}>
            {LONG_TEASER_AGENTS.map(a => <option key={a.id} value={a.id}>{a.name} — {a.email} — {a.phone}</option>)}
          </select>
        </div>

        {/* Title + brand + language */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>{mode === 'multiple' ? 'Portfolio title' : 'Title'}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={mode === 'multiple' ? 'e.g. Patrimonial company — 3 buildings' : 'e.g. Office building — Avenue Louise'} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Brand</label>
            <select value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Language</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle}>{LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!canGenerate} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', cursor: canGenerate ? 'pointer' : 'not-allowed', background: canGenerate ? 'var(--cs-accent)' : 'var(--cs-accent-line)', color: '#fff', fontSize: 13, fontWeight: 700 }}>
            {loading ? 'Starting…' : (mode === 'multiple' ? 'Generate Portfolio Teaser' : 'Generate Long Teaser')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Buyer shortlist modal ────────────────────────────────────────────────────
function BuyersModal({ prop, brands, onClose, onGenerate, dark }) {
  const [brand, setBrand] = useState(brands[0]?.id || 'rodschinson')
  const [language, setLanguage] = useState('FR')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [buyers, setBuyers] = useState([])
  const [stageFilter, setStageFilter] = useState([])   // selected stages; empty = all

  const bg = dark ? '#1a1a1a' : '#fff'
  const border = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)'
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 12, border: `1px solid ${border}`, background: bg, color: text }

  useEffect(() => {
    let alive = true
    apiFetch(`/api/properties/${prop.odoo_id}/buyers`)
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `Failed (${r.status})`); return r.json() })
      .then(d => { if (alive) { setBuyers(d.buyers || []) } })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setFetching(false) })
    return () => { alive = false }
  }, [prop.odoo_id])

  const stages = [...new Set(buyers.map(b => b.stage).filter(Boolean))]
  const shown = stageFilter.length ? buyers.filter(b => stageFilter.includes(b.stage)) : buyers
  const toggleStage = (s) => setStageFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const handleGenerate = async () => {
    setLoading(true)
    await onGenerate({ prop, brand, language, stages: stageFilter })
    setLoading(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: bg, borderRadius: 16, padding: 24, maxWidth: 720, width: '94%', border: `1px solid ${border}`, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ display: 'inline-flex', color: '#0a7a43' }}><Users size={22} /></span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text }}>{prop.title}</div>
            <div style={{ fontSize: 11, color: '#0a7a43', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Buyer shortlist — applicants from Odoo</div>
          </div>
        </div>

        {fetching && <div style={{ padding: 24, textAlign: 'center', color: muted, fontSize: 13 }}>Loading buyers from Odoo…</div>}
        {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626', fontSize: 13, margin: '8px 0' }}>{error}</div>}

        {!fetching && !error && (
          <>
            <div style={{ fontSize: 12, color: muted, margin: '8px 0 10px' }}>
              <b style={{ color: text }}>{buyers.length}</b> buyer(s) linked to this asset{stageFilter.length ? ` · ${shown.length} shown` : ''}.
            </div>

            {stages.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: muted, alignSelf: 'center' }}>Filter stage:</span>
                {stages.map(s => (
                  <button key={s} onClick={() => toggleStage(s)} style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                    border: `1px solid ${stageFilter.includes(s) ? '#0a7a43' : border}`,
                    background: stageFilter.includes(s) ? 'rgba(16,150,90,0.12)' : 'transparent',
                    color: stageFilter.includes(s) ? '#0a7a43' : muted, fontWeight: 600,
                  }}>{s}</button>
                ))}
              </div>
            )}

            <div style={{ border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
              {shown.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: muted }}>No buyers{buyers.length ? ' match this filter' : ' for this asset'}.</div>
              ) : shown.map((b, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: i < shown.length - 1 ? `1px solid ${border}` : 'none', fontSize: 12 }}>
                  <span style={{ color: muted, width: 18, fontSize: 11 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.company || b.contact || '—'}</div>
                    <div style={{ color: muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[b.contact, b.email].filter(Boolean).join(' · ')}</div>
                  </div>
                  {b.stage && <span style={{ fontSize: 10, fontWeight: 600, color: '#0a7a43', background: 'rgba(16,150,90,0.1)', borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>{b.stage}</span>}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Brand</label>
                <select value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Language</label>
                <select value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle}>{LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: `1px solid ${border}`, background: 'transparent', color: muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleGenerate} disabled={loading || fetching || shown.length === 0} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', cursor: (loading || fetching || shown.length === 0) ? 'not-allowed' : 'pointer', background: (loading || fetching || shown.length === 0) ? 'var(--cs-accent-line)' : 'var(--cs-accent)', color: '#fff', fontSize: 13, fontWeight: 700 }}>
            {loading ? 'Starting…' : 'Generate Shortlist PDF'}
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
  const border = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'
  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.58)'

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
          <span style={{ display: 'inline-flex', color: 'var(--cs-accent)' }}><AssetIcon type={prop.asset_type} size={28} /></span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: text }}>{prop.title}</div>
            <div style={{ fontSize: 12, color: 'var(--cs-accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              AI Valuation Report
            </div>
          </div>
        </div>

        {/* Property info */}
        <div style={{
          padding: 14, borderRadius: 8, marginBottom: 18,
          background: dark ? 'rgba(255,255,255,0.03)' : 'var(--cs-surface2)',
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
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cs-accent)' }}>{prop.reference}</span>
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
                background: 'var(--cs-accent-soft)', border: '1px solid var(--cs-accent-soft)',
                color: 'var(--cs-accent)',
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
            background: loading ? 'var(--cs-accent-line)' : 'var(--cs-accent)',
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [sectorFilter, setSectorFilter] = useState('all')
  const [brandFilter, setBrandFilter] = useState('all')
  const [modalProp, setModalProp] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [showPortfolio, setShowPortfolio] = useState(false)
  const [showFolderTeaser, setShowFolderTeaser] = useState(false)
  const [valuationProp, setValuationProp] = useState(null)
  const [longTeaserProp, setLongTeaserProp] = useState(null)
  const [buyersProp, setBuyersProp] = useState(null)

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
  const handleGenerateLongTeaser = async ({ prop, brand, language, photos, plans, mapImage, documents, coverImage, salesImage, aerialImage, cadastralImage, photoCats, fields }) => {
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
        map_image: mapImage || '',
        cover_image: coverImage || '',
        sales_image: salesImage || '',
        aerial_image: aerialImage || '',
        cadastral_image: cadastralImage || '',
        photo_categories: photoCats || [],
        documents: documents || [],
        long_teaser_fields: {
          address: fields.address,
          payment_terms: fields.paymentTerms,
          sharepoint_url: fields.sharepointUrl,
          expertise_url: fields.expertiseUrl,
          surfaces: fields.surfaces,
          agent_name: fields.agent?.name || '',
          agent_email: fields.agent?.email || '',
          agent_phone: fields.agent?.phone || '',
          agent_role: fields.agent?.role || '',
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

  // Generate a branded buyer-shortlist PDF for an asset (buyers pulled from Odoo)
  const handleGenerateBuyers = async ({ prop, brand, language, stages }) => {
    try {
      const payload = {
        subject: `Buyers: ${prop.title || ''}`.trim(),
        brand,
        language,
        contentType: 'property_buyers',
        platforms: ['email'],
        property_data: prop,
        buyer_stages: stages && stages.length ? stages : null,
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      const res = await apiFetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Buyer shortlist generation failed')
      }
      const { job_id } = await res.json()
      trackJob(job_id, { title: `Buyers: ${prop.title}`, contentType: 'property_buyers' })
      toast('Buyer shortlist generation started', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Generate a long teaser created from scratch — single property OR multiple
  // assets (one subfolder per building, each with its own address + gallery).
  const handleGenerateFolderTeaser = async ({ mode, title, address, brand, language, folderAssets, photos, documents, odooProp, sharepointUrl, expertiseUrl, paymentTerms, agent }) => {
    try {
      const isMulti = mode === 'multiple'
      // Company-wide data: an Odoo property seeds title/price/reference; manual title wins.
      const property_data = {
        ...(odooProp || {}),
        title: title || odooProp?.title || (isMulti ? 'Portfolio Teaser' : 'Long Teaser'),
      }
      const payload = {
        subject: property_data.title,
        brand,
        language,
        contentType: 'property_long_teaser',
        template: 'teaser_long',
        platforms: ['email'],
        property_data,
        documents: documents || [],
        // Multiple → one asset per subfolder (name + address + gallery).
        // Single → a flat gallery + one address.
        ...(isMulti
          ? { folder_assets: folderAssets.map(a => ({ name: a.name, address: a.address || '', photos: a.photos })) }
          : { photos: photos || [] }),
        long_teaser_fields: {
          ...(isMulti ? {} : { address: address || '' }),
          sharepoint_url: sharepointUrl || '',
          expertise_url: expertiseUrl || '',
          payment_terms: paymentTerms || '',
          agent_name: agent?.name || '',
          agent_email: agent?.email || '',
          agent_phone: agent?.phone || '',
          agent_role: agent?.role || '',
        },
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      const res = await apiFetch('/api/generate', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Portfolio teaser generation failed')
      }
      const { job_id } = await res.json()
      trackJob(job_id, { title: `${mode === 'multiple' ? 'Portfolio' : 'Long'} Teaser: ${title || ''}`.trim(), contentType: 'property_long_teaser' })
      toast('Teaser generation started', 'success')
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  // Filtered list
  const assetTypes = [...new Set(properties.map(p => p.asset_type).filter(Boolean))]
  const statusOpts = [...new Set(properties.map(p => p.status).filter(Boolean))].sort()
  // Sectors / brands come as comma-separated strings from Odoo → split into a set.
  const splitList = (v) => String(v || '').split(/\s*[,;/]\s*/).map(s => s.trim()).filter(Boolean)
  const sectorOpts = [...new Set(properties.flatMap(p => splitList(p.sectors)))].sort()
  const brandOpts  = [...new Set(properties.flatMap(p => splitList(p.brands)))].sort()
  const filtered = properties.filter(p => {
    if (typeFilter !== 'all' && p.asset_type !== typeFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (sectorFilter !== 'all' && !splitList(p.sectors).includes(sectorFilter)) return false
    if (brandFilter !== 'all' && !splitList(p.brands).includes(brandFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      // Fields can be arrays (Odoo many2one like responsable = [id, name]) or
      // non-strings — coerce everything to text before matching.
      const asText = (x) => Array.isArray(x) ? x.join(' ') : String(x ?? '')
      const hay = [p.title, p.reference, p.description, p.agent, p.asset_label, p.sectors, p.brands]
        .map(asText).join(' ').toLowerCase()
      return hay.includes(q)
    }
    return true
  })

  const text = dark ? '#fff' : '#0D1F3C'
  const muted = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'
  const border = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'

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
          <button onClick={() => setShowFolderTeaser(true)} style={{
            padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--cs-accent-line)', background: 'var(--cs-accent-soft)',
            color: 'var(--cs-accent)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }} title="Create a long teaser from scratch — single property or multiple assets (one subfolder per building)">
            <Plus size={15} /> New Long Teaser
          </button>
          {properties.length > 0 && (
            <button onClick={() => setShowPortfolio(true)} style={{
              padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--cs-accent-line)', background: 'var(--cs-accent-soft)',
              color: 'var(--cs-accent)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <ClipboardList size={15} /> Portfolio {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </button>
          )}
          <button onClick={handleSync} disabled={syncing} style={{
            padding: '9px 20px', borderRadius: 8, cursor: syncing ? 'wait' : 'pointer',
            border: '1px solid var(--cs-accent-line)', background: 'var(--cs-accent-soft)',
            color: 'var(--cs-accent)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {syncing ? (
              <>
                <span style={{ width: 14, height: 14, border: '2px solid var(--cs-accent-line)', borderTopColor: 'var(--cs-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                Syncing...
              </>
            ) : (<><RefreshCw size={15} /> Sync from Odoo</>)}
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
        {(() => {
          const selStyle = { padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.04)' : '#fff', color: text, fontSize: 13 }
          return (
            <>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle} title="Filter by stage / status">
                <option value="all">All stages</option>
                {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selStyle} title="Filter by asset type">
                <option value="all">All types</option>
                {assetTypes.map(t => <option key={t} value={t}>{ASSET_LABELS[t] || t}</option>)}
              </select>
              {sectorOpts.length > 0 && (
                <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)} style={selStyle} title="Filter by sector">
                  <option value="all">All sectors</option>
                  {sectorOpts.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {brandOpts.length > 0 && (
                <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} style={selStyle} title="Filter by brand">
                  <option value="all">All brands</option>
                  {brandOpts.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              {(statusFilter !== 'all' || typeFilter !== 'all' || sectorFilter !== 'all' || brandFilter !== 'all' || search) && (
                <button onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setSectorFilter('all'); setBrandFilter('all'); setSearch('') }} style={{ ...selStyle, cursor: 'pointer', color: muted }}>Clear</button>
              )}
            </>
          )
        })()}
        {filtered.length > 0 && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            fontSize: 12, color: muted, marginLeft: 4,
          }}>
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every(p => selectedIds.includes(p.odoo_id))}
              onChange={selectAll}
              style={{ accentColor: 'var(--cs-accent)' }}
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
          <span style={{ width: 28, height: 28, border: '3px solid var(--cs-accent-soft)', borderTopColor: 'var(--cs-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
          <div style={{ marginTop: 12, fontSize: 13 }}>Loading properties...</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && properties.length === 0 && !error && (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          border: `2px dashed ${border}`, borderRadius: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--cs-text-muted)' }}><Building2 size={48} strokeWidth={1.5} /></div>
          <div style={{ fontSize: 16, fontWeight: 600, color: text, marginBottom: 8 }}>No properties yet</div>
          <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
            Sync properties from your Odoo CRM to get started
          </div>
          <button onClick={handleSync} disabled={syncing} style={{
            padding: '10px 24px', borderRadius: 8, cursor: 'pointer',
            border: 'none', background: 'var(--cs-accent)',
            color: '#fff', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <RefreshCw size={16} /> Sync from Odoo
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
              onBuyers={() => setBuyersProp(prop)}
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

      {/* Buyer shortlist modal */}
      {buyersProp && (
        <BuyersModal
          prop={buyersProp}
          brands={brands}
          dark={dark}
          onClose={() => setBuyersProp(null)}
          onGenerate={handleGenerateBuyers}
        />
      )}

      {/* Portfolio Teaser (folder) modal */}
      {showFolderTeaser && (
        <PortfolioTeaserModal
          brands={brands}
          properties={properties}
          dark={dark}
          onClose={() => setShowFolderTeaser(false)}
          onGenerate={handleGenerateFolderTeaser}
        />
      )}
    </div>
  )
}
