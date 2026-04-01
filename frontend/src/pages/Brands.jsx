import { useState, useRef } from 'react'
import { useBrands } from '../contexts/BrandContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { Plus, Pencil, Trash2, Upload, Globe, Tag } from 'lucide-react'

// ─── Color swatch picker ──────────────────────────────────────────────────────
function ColorField({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--cs-border)', cursor: 'pointer', padding: 2, background: 'var(--cs-input-bg)' }} />
        </div>
        <input value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 6, padding: '6px 10px', color: 'var(--cs-text)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
      </div>
    </div>
  )
}

// ─── Logo uploader ────────────────────────────────────────────────────────────
function LogoUploader({ brandId, currentLogoUrl, shortName, primaryColor, onUploaded }) {
  const fileRef = useRef()
  const [preview, setPreview] = useState(currentLogoUrl ? `${currentLogoUrl}?t=${Date.now()}` : null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    onUploaded(file)
  }

  return (
    <div>
      <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Logo</div>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
        style={{
          width: 96, height: 96, borderRadius: 12, cursor: 'pointer',
          border: `2px dashed ${dragging ? '#00B6FF' : 'var(--cs-border)'}`,
          background: dragging ? 'rgba(0,182,255,0.06)' : 'var(--cs-hover)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', transition: 'all 0.15s', position: 'relative',
        }}
      >
        {preview ? (
          <img src={preview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>{shortName}</div>
            <Upload size={12} color="var(--cs-text-muted)" />
          </div>
        )}
      </div>
      <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, marginTop: 5 }}>Click or drag PNG/JPG</div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
    </div>
  )
}

// ─── Brand form modal ─────────────────────────────────────────────────────────
function BrandModal({ brand, onClose, onSaved }) {
  const { success, error } = useToast()
  const isEdit = !!brand?.id
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [form, setForm] = useState({
    name:         brand?.name         || '',
    shortName:    brand?.shortName    || '',
    primaryColor: brand?.primaryColor || '#08316F',
    accentColor:  brand?.accentColor  || '#C8A96E',
    textColor:    brand?.textColor    || '#FFFFFF',
    website:      brand?.website      || '',
    tagline:      brand?.tagline      || '',
    context:      brand?.context      || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill shortName from name
  const handleName = (v) => {
    set('name', v)
    if (!isEdit || !brand?.shortName) {
      const words = v.trim().split(/\s+/)
      set('shortName', words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : v.slice(0, 2).toUpperCase())
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) return error('Brand name is required')
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('data', JSON.stringify({ ...form, ...(isEdit ? {} : { id: form.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32) }) }))
      if (logoFile) fd.append('logo', logoFile)

      const url    = isEdit ? `/api/brands/${brand.id}` : '/api/brands'
      const method = isEdit ? 'PUT' : 'POST'
      const res    = await fetch(url, { method, body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${res.status}`)
      }
      success(isEdit ? 'Brand updated' : 'Brand created')
      onSaved()
      onClose()
    } catch (e) {
      error(e.message || 'Failed to save brand')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 14, width: 480, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', animation: 'scalein 0.18s ease' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--cs-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'var(--cs-text)', fontWeight: 700, fontSize: 15 }}>{isEdit ? 'Edit brand' : 'New brand'}</div>
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 12, marginTop: 2 }}>{isEdit ? `Editing ${brand.name}` : 'Add a brand identity to your workspace'}</div>
          </div>
          {/* Live preview badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: form.primaryColor + '18', border: `1px solid ${form.primaryColor}40` }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: `linear-gradient(135deg, ${form.primaryColor}, ${form.accentColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: form.textColor, fontSize: 9, fontWeight: 800 }}>{form.shortName || '??'}</div>
            <span style={{ color: form.primaryColor, fontSize: 11, fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.name || 'Preview'}</span>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Logo + name row */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
            <LogoUploader
              brandId={brand?.id}
              currentLogoUrl={brand?.logoUrl}
              shortName={form.shortName || '?'}
              primaryColor={form.primaryColor}
              onUploaded={setLogoFile}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Brand name *</label>
                <input value={form.name} onChange={e => handleName(e.target.value)} placeholder="e.g. Rodschinson Investment"
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '8px 12px', color: 'var(--cs-text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Initials</label>
                  <input value={form.shortName} onChange={e => set('shortName', e.target.value.toUpperCase().slice(0, 3))} placeholder="RI"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '8px 12px', color: 'var(--cs-text)', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Website</label>
                  <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="rodschinson.com"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '8px 12px', color: 'var(--cs-text)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div>
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Brand colors</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <ColorField label="Primary" value={form.primaryColor} onChange={v => set('primaryColor', v)} />
              <ColorField label="Accent"  value={form.accentColor}  onChange={v => set('accentColor', v)} />
              <ColorField label="Text"    value={form.textColor}    onChange={v => set('textColor', v)} />
            </div>
          </div>

          {/* Tagline */}
          <div>
            <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Tagline</label>
            <input value={form.tagline} onChange={e => set('tagline', e.target.value)} placeholder="Premium CRE & M&A Advisory"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '8px 12px', color: 'var(--cs-text)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
          </div>

          {/* Context for AI */}
          <div>
            <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>AI context <span style={{ color: 'rgba(0,182,255,0.7)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— used in content generation prompts</span></label>
            <textarea value={form.context} onChange={e => set('context', e.target.value)} rows={2}
              placeholder="e.g. Premium CRE & M&A advisory firm based in Brussels, Dubai and Casablanca. Targets HNW investors and family offices."
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '8px 12px', color: 'var(--cs-text)', fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--cs-border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: saving ? 'var(--cs-hover)' : 'linear-gradient(135deg,#08316F,#00B6FF)', color: saving ? 'var(--cs-text-muted)' : '#fff', fontSize: 12, fontWeight: 600, transition: 'opacity 0.15s', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create brand'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Brand card ───────────────────────────────────────────────────────────────
function BrandCard({ brand, onEdit, onDelete }) {
  const [hov, setHov] = useState(false)
  const logoSrc = brand.logoUrl ? `${brand.logoUrl}?t=${Date.now()}` : null

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--cs-surface)', border: `1px solid ${hov ? brand.primaryColor + '50' : 'var(--cs-border)'}`,
        borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hov ? `0 4px 24px ${brand.primaryColor}20` : 'none',
      }}
    >
      {/* Color band */}
      <div style={{ height: 6, background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.accentColor})` }} />

      <div style={{ padding: '18px 20px' }}>
        {/* Logo + identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.accentColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: `0 2px 10px ${brand.primaryColor}40` }}>
            {logoSrc
              ? <img src={logoSrc} alt={brand.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
              : <span style={{ color: brand.textColor || '#fff', fontWeight: 800, fontSize: 16 }}>{brand.shortName}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--cs-text)', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</div>
            {brand.tagline && <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.tagline}</div>}
          </div>
        </div>

        {/* Color swatches */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[brand.primaryColor, brand.accentColor, brand.textColor].map((c, i) => (
            <div key={i} title={c} style={{ width: 20, height: 20, borderRadius: 5, background: c, border: '1px solid var(--cs-border)', flexShrink: 0 }} />
          ))}
          <span style={{ color: 'var(--cs-text-muted)', fontSize: 10, marginLeft: 4, alignSelf: 'center', fontFamily: 'monospace' }}>{brand.primaryColor}</span>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {brand.website && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, background: 'var(--cs-hover)', color: 'var(--cs-text-sub)', fontSize: 11 }}>
              <Globe size={10} /> {brand.website}
            </div>
          )}
          {brand.context && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, background: 'rgba(0,182,255,0.07)', color: '#00B6FF', fontSize: 10 }}>
              <Tag size={9} /> AI context set
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onEdit(brand)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 0', borderRadius: 6, border: '1px solid var(--cs-border)', background: 'var(--cs-hover)', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer', transition: 'all 0.12s' }}>
            <Pencil size={12} /> Edit
          </button>
          <button onClick={() => onDelete(brand)} style={{ width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', cursor: 'pointer', transition: 'all 0.12s' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ brand, onClose, onDeleted }) {
  const { success, error } = useToast()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/brands/${brand.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(`Error ${res.status}`)
      success(`"${brand.name}" deleted`)
      onDeleted()
      onClose()
    } catch {
      error('Failed to delete brand')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, width: 360, padding: '24px', animation: 'scalein 0.15s ease' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🗑️</div>
        <div style={{ color: 'var(--cs-text)', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Delete "{brand.name}"?</div>
        <div style={{ color: 'var(--cs-text-sub)', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>This will remove the brand and its logo. Content already generated won't be affected.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Brands() {
  useTheme()
  const { brands, reload } = useBrands()
  const [modal, setModal]     = useState(null)   // null | { type: 'create' | 'edit' | 'delete', brand?: {} }

  return (
    <div style={{ maxWidth: 900 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: 'var(--cs-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Brands</h1>
          <p style={{ color: 'var(--cs-text-muted)', fontSize: 13, margin: 0 }}>
            Manage your brand identities — logo, colors, and AI context used during content generation.
          </p>
        </div>
        <button onClick={() => setModal({ type: 'create' })} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#08316F,#00B6FF)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 12px rgba(0,182,255,0.25)' }}>
          <Plus size={15} /> New brand
        </button>
      </div>

      {/* Grid */}
      {brands.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--cs-text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 14 }}>No brands yet — create your first one</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {brands.map(b => (
            <BrandCard
              key={b.id} brand={b}
              onEdit={brand => setModal({ type: 'edit', brand })}
              onDelete={brand => setModal({ type: 'delete', brand })}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'create' && (
        <BrandModal onClose={() => setModal(null)} onSaved={reload} />
      )}
      {modal?.type === 'edit' && (
        <BrandModal brand={modal.brand} onClose={() => setModal(null)} onSaved={reload} />
      )}
      {modal?.type === 'delete' && (
        <DeleteConfirm brand={modal.brand} onClose={() => setModal(null)} onDeleted={reload} />
      )}
    </div>
  )
}
