import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { Plus, Trash2, Code2, Info, Check } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMATS = [
  { id: '16:9', label: '16:9 — Video',        sub: '1920×1080 · LinkedIn, YouTube, Facebook', w: 1920, h: 1080, fps: 24, formats: ['video'] },
  { id: '9:16', label: '9:16 — Reel / Story', sub: '1080×1920 · Instagram, TikTok, Shorts',   w: 1080, h: 1920, fps: 30, formats: ['reel', 'story'] },
  { id: '1:1',  label: '1:1 — Square Post',   sub: '1080×1080 · Instagram, LinkedIn post',     w: 1080, h: 1080, fps: 24, formats: ['carousel', 'image_post'] },
]

const ALL_SCENE_TYPES = [
  { id: 'title_card',    label: 'Title Card',    icon: '🎬', desc: 'Opening screen — main headline, subtitle, eyebrow label' },
  { id: 'big_number',    label: 'Big Number',    icon: '📊', desc: 'Large stat/metric — value, unit, one-line context' },
  { id: 'text_bullets',  label: 'Text Bullets',  icon: '📋', desc: 'Bullet list — heading + 3-4 key points' },
  { id: 'bar_chart',     label: 'Bar Chart',     icon: '📈', desc: 'Horizontal bars — title, series data, source' },
  { id: 'process_steps', label: 'Process Steps', icon: '🔢', desc: 'Numbered flow — title + up to 5 steps' },
  { id: 'split_screen',  label: 'Split Screen',  icon: '⚖️',  desc: 'Two-column layout — comparison or contrast' },
  { id: 'quote_card',    label: 'Quote Card',    icon: '💬', desc: 'Full quote — text, author, organisation' },
  { id: 'cta_screen',    label: 'CTA Screen',    icon: '🎯', desc: 'Closing call-to-action — headline, body, button, URL' },
]

const FORMAT_ICONS = { '16:9': '🖥️', '9:16': '📱', '1:1': '⬛' }

const STYLE_PRESETS = [
  { label: 'Dark Navy + Gold',    accent: '#C8A96E', gradient: 'linear-gradient(135deg,#08316F,#041d45)',  desc: 'Institutional · premium · investment' },
  { label: 'Dark + Cyan Data',    accent: '#00B6FF', gradient: 'linear-gradient(135deg,#031520,#0a2a3d)',  desc: 'Bloomberg terminal · data-heavy' },
  { label: 'Black + Red Bold',    accent: '#FF4444', gradient: 'linear-gradient(135deg,#0a0a0a,#1a0000)',  desc: 'Breaking news · high energy · viral' },
  { label: 'Light Editorial',     accent: '#08316F', gradient: 'linear-gradient(135deg,#F8F5F0,#e8e4dc)',  desc: 'Clean whitespace · thought leadership' },
  { label: 'Purple Gradient',     accent: '#9b6dff', gradient: 'linear-gradient(135deg,#1a0a2e,#08316F)',  desc: 'Modern social-native · Gen-Z audience' },
  { label: 'Teal CRE Terminal',   accent: '#00E5C8', gradient: 'linear-gradient(135deg,#080E1A,#0C1628)',  desc: 'CRE & real estate · investor grade' },
  { label: 'Custom',              accent: '#00B6FF', gradient: 'linear-gradient(135deg,#08316F,#00B6FF)',  desc: 'Choose your own colors' },
]

// ─── HTML starter template ────────────────────────────────────────────────────

function buildStarterHTML(scenes, ratio, accent, bg) {
  const isPortrait = ratio === '9:16'
  const w = ratio === '9:16' ? 1080 : 1920
  const h = ratio === '9:16' ? 1920 : ratio === '1:1' ? 1080 : 1080
  const sceneBuilders = scenes.map(type => {
    switch (type) {
      case 'title_card': return `
  title_card: (v) => \`
    <div class="scene title-card">
      <div class="eyebrow">\${v.eyebrow || ''}</div>
      <h1>\${v.titre_principal || ''}</h1>
      <p class="subtitle">\${v.sous_titre || ''}</p>
    </div>\`,`
      case 'big_number': return `
  big_number: (v) => \`
    <div class="scene big-number">
      <div class="eyebrow">\${v.eyebrow || ''}</div>
      <div class="number">\${v.valeur || '0'}<span class="unit">\${v.unite || ''}</span></div>
      <p class="context">\${v.contexte || ''}</p>
    </div>\`,`
      case 'text_bullets': return `
  text_bullets: (v) => \`
    <div class="scene bullets">
      <h2>\${v.titre || ''}</h2>
      <ul>\${(v.items||[]).map(i => \`<li>\${i}</li>\`).join('')}</ul>
    </div>\`,`
      case 'bar_chart': return `
  bar_chart: (v) => {
    const max = Math.max(...(v.series||[]).map(s => s.valeur), 1);
    return \`<div class="scene chart">
      <h2>\${v.titre || ''}</h2>
      \${(v.series||[]).map(s => \`
        <div class="bar-row">
          <span class="bar-label">\${s.label}</span>
          <div class="bar-track"><div class="bar-fill" style="width:\${(s.valeur/max*100).toFixed(1)}%"></div></div>
          <span class="bar-val">\${s.valeur}\${v.unite||''}</span>
        </div>\`).join('')}
      <div class="source">\${v.source||''}</div>
    </div>\`;
  },`
      case 'process_steps': return `
  process_steps: (v) => \`
    <div class="scene">
      <h2>\${v.titre || ''}</h2>
      <ol class="steps">\${(v.etapes||[]).map(s => \`<li>\${s}</li>\`).join('')}</ol>
    </div>\`,`
      case 'split_screen': return `
  split_screen: (v) => \`
    <div class="scene">
      <h2>\${v.titre || ''}</h2>
      <div class="split">
        <div class="split-col">
          <h3>\${v.colonne_gauche?.titre || ''}</h3>
          <ul>\${(v.colonne_gauche?.items||[]).map(i => \`<li>\${i}</li>\`).join('')}</ul>
        </div>
        <div class="split-col">
          <h3>\${v.colonne_droite?.titre || ''}</h3>
          <ul>\${(v.colonne_droite?.items||[]).map(i => \`<li>\${i}</li>\`).join('')}</ul>
        </div>
      </div>
    </div>\`,`
      case 'quote_card': return `
  quote_card: (v) => \`
    <div class="scene">
      <blockquote>
        "\${v.citation || ''}"
        <cite>— \${v.auteur || ''}\${v.source ? ', ' + v.source : ''}</cite>
      </blockquote>
    </div>\`,`
      case 'cta_screen': return `
  cta_screen: (v) => \`
    <div class="scene">
      <div class="eyebrow">\${v.eyebrow || ''}</div>
      <h1>\${v.headline || ''}</h1>
      <p>\${v.body || ''}</p>
      <a class="cta-btn">\${v.cta_text || 'Learn more'}</a>
    </div>\`,`
      default: return `
  ${type}: (v) => \`<div class="scene">\${JSON.stringify(v)}</div>\`,`
    }
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${w}, height=${h}">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${w}px; height: ${h}px; overflow: hidden;
  background: ${bg || '#08316F'};
  font-family: 'Space Grotesk', system-ui, sans-serif;
  color: #fff;
}
#scene-container {
  width: 100%; height: 100%;
}
.scene {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: ${isPortrait ? '80px 60px' : '80px 120px'};
  gap: 24px; text-align: center;
}
.eyebrow { font-size: ${isPortrait ? '22px' : '18px'}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; color: ${accent || '#C8A96E'}; }
h1 { font-size: ${isPortrait ? '64px' : '72px'}; font-weight: 800; line-height: 1.1; letter-spacing: -2px; }
h2 { font-size: ${isPortrait ? '48px' : '56px'}; font-weight: 700; }
.subtitle, p { font-size: 28px; opacity: 0.75; line-height: 1.4; }
.number { font-size: ${isPortrait ? '140px' : '160px'}; font-weight: 900; line-height: 1; color: ${accent || '#C8A96E'}; }
.unit { font-size: 0.4em; vertical-align: top; margin-top: 0.2em; }
ul { list-style: none; width: 100%; max-width: 800px; }
li { padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: ${isPortrait ? '30px' : '32px'}; text-align: left; }
li::before { content: '→  '; color: ${accent || '#C8A96E'}; }
.bar-row { display: flex; align-items: center; gap: 16px; margin: 8px 0; width: 100%; max-width: 900px; }
.bar-label { width: 200px; text-align: right; font-size: 24px; }
.bar-track { flex: 1; height: 32px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; background: ${accent || '#C8A96E'}; border-radius: 4px; }
.bar-val { width: 80px; font-size: 24px; font-weight: 700; }
.source { font-size: 18px; opacity: 0.4; margin-top: 16px; }
.cta-btn { margin-top: 16px; padding: 20px 48px; border-radius: 50px; background: ${accent || '#C8A96E'}; color: #000; font-size: 28px; font-weight: 700; text-decoration: none; display: inline-block; }
.context { opacity: 0.7; max-width: 700px; }
.split { display: flex; gap: 40px; width: 100%; max-width: 1400px; }
.split-col { flex: 1; }
.split-col h3 { font-size: 32px; margin-bottom: 16px; color: ${accent || '#C8A96E'}; }
.steps { list-style: none; counter-reset: step; width: 100%; max-width: 900px; }
.steps li { counter-increment: step; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 30px; text-align: left; display: flex; align-items: center; gap: 20px; }
.steps li::before { content: counter(step); width: 44px; height: 44px; border-radius: 50%; background: ${accent || '#C8A96E'}; color: #000; font-weight: 800; font-size: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
blockquote { font-size: 40px; font-style: italic; line-height: 1.4; max-width: 1100px; border-left: 6px solid ${accent || '#C8A96E'}; padding-left: 40px; text-align: left; }
cite { display: block; margin-top: 20px; font-size: 22px; font-style: normal; opacity: 0.6; }
</style>
</head>
<body>
<div id="scene-container"></div>
<script>
const SCENE_BUILDERS = {${sceneBuilders}
};

// ── Required interface for renderer.js ───────────────────────────────────────
window.loadScene = function(sceneData) {
  const container = document.getElementById('scene-container');
  const type = sceneData.type_visuel;
  const v = sceneData.visuel || {};
  const builder = SCENE_BUILDERS[type];
  if (!builder) {
    console.error('Unknown scene type:', type);
    return false;
  }
  container.innerHTML = typeof builder === 'function' ? builder(v) : String(builder);
  return true;
};

window.animateScene = function() {
  const scene = document.querySelector('.scene');
  if (scene) {
    scene.style.opacity = '0';
    scene.style.transform = 'translateY(12px)';
    requestAnimationFrame(() => {
      scene.style.transition = 'opacity 0.4s, transform 0.4s';
      scene.style.opacity = '1';
      scene.style.transform = 'none';
    });
  }
};

window.isAnimationComplete = function(minDuration) {
  return new Promise(resolve => setTimeout(resolve, minDuration || 800));
};
</script>
</body>
</html>`
}

// ─── Template card ────────────────────────────────────────────────────────────
function TemplateCard({ tmpl, onDelete }) {
  const [hov, setHov] = useState(false)
  const isCustom = !tmpl.builtin

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--cs-surface)', borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${hov ? tmpl.accent + '50' : 'var(--cs-border)'}`,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hov ? `0 4px 24px ${tmpl.accent}18` : 'none',
      }}
    >
      {/* Visual preview band */}
      <div style={{ height: 72, background: tmpl.gradient, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 28 }}>{FORMAT_ICONS[tmpl.ratio] || '🖥️'}</span>
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 5 }}>
          {tmpl.builtin
            ? <span style={{ padding: '2px 7px', borderRadius: 4, background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: 600, letterSpacing: '0.08em' }}>BUILT-IN</span>
            : <span style={{ padding: '2px 7px', borderRadius: 4, background: tmpl.accent + '40', color: tmpl.accent, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em' }}>CUSTOM</span>
          }
        </div>
        <div style={{ position: 'absolute', bottom: 8, left: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tmpl.accent }} />
          <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: 600 }}>{tmpl.ratio}</span>
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* Name + canvas */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ color: 'var(--cs-text)', fontWeight: 700, fontSize: 14 }}>{tmpl.label}</span>
          <span style={{ color: 'var(--cs-text-muted)', fontSize: 10 }}>{tmpl.w}×{tmpl.h}</span>
        </div>
        <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginBottom: 10, lineHeight: 1.4 }}>{tmpl.style}</div>

        {/* Scene type badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: isCustom ? 12 : 0 }}>
          {(tmpl.scenes || []).map(s => {
            const st = ALL_SCENE_TYPES.find(x => x.id === s)
            return (
              <span key={s} style={{ padding: '2px 7px', borderRadius: 4, background: `${tmpl.accent}14`, color: tmpl.accent, fontSize: 10, fontWeight: 600 }}>
                {st?.icon} {st?.label || s}
              </span>
            )
          })}
        </div>

        {/* Delete (custom only) */}
        {isCustom && (
          <button onClick={() => onDelete(tmpl)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 0', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>
            <Trash2 size={11} /> Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Add template modal ───────────────────────────────────────────────────────
function AddTemplateModal({ onClose, onSaved }) {
  const { success, error } = useToast()
  const fileRef = useRef()
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)   // 1: config, 2: HTML
  const [htmlMode, setHtmlMode] = useState('generate')  // 'generate' | 'upload' | 'paste'
  const [pastedHtml, setPastedHtml] = useState('')
  const [uploadedFile, setUploadedFile] = useState(null)

  const [form, setForm] = useState({
    label:    '',
    ratio:    '16:9',
    scenes:   ['title_card', 'text_bullets', 'cta_screen'],
    stylePresetIdx: 0,
    accent:   '#C8A96E',
    gradient: 'linear-gradient(135deg,#08316F,#041d45)',
    bg:       '#08316F',
    style:    '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleScene = (id) => {
    setForm(f => ({
      ...f,
      scenes: f.scenes.includes(id) ? f.scenes.filter(s => s !== id) : [...f.scenes, id]
    }))
  }

  const applyPreset = (idx) => {
    const p = STYLE_PRESETS[idx]
    set('stylePresetIdx', idx)
    if (idx < STYLE_PRESETS.length - 1) {
      setForm(f => ({ ...f, stylePresetIdx: idx, accent: p.accent, gradient: p.gradient, style: p.desc }))
    }
  }

  const handleSave = async () => {
    if (!form.label.trim()) return error('Template name is required')
    if (form.scenes.length === 0) return error('Select at least one scene type')

    setSaving(true)
    try {
      const fd = new FormData()
      const payload = {
        label:    form.label.trim(),
        ratio:    form.ratio,
        scenes:   form.scenes,
        accent:   form.accent,
        gradient: form.gradient,
        style:    form.style || form.label,
        formats:  FORMATS.find(f => f.id === form.ratio)?.formats || ['video'],
      }
      fd.append('data', JSON.stringify(payload))

      // Determine HTML source
      if (htmlMode === 'generate') {
        const fmtMeta = FORMATS.find(f => f.id === form.ratio)
        const html = buildStarterHTML(form.scenes, form.ratio, form.accent, form.bg)
        const blob = new Blob([html], { type: 'text/html' })
        fd.append('html_file', blob, `${form.label.toLowerCase().replace(/\s+/g,'_')}.html`)
      } else if (htmlMode === 'upload' && uploadedFile) {
        fd.append('html_file', uploadedFile)
      } else if (htmlMode === 'paste' && pastedHtml.trim()) {
        const blob = new Blob([pastedHtml], { type: 'text/html' })
        fd.append('html_file', blob, 'template.html')
      }

      const res = await fetch('/api/templates', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${res.status}`)
      }
      success('Template created')
      onSaved()
      onClose()
    } catch (e) {
      error(e.message || 'Failed to create template')
    } finally { setSaving(false) }
  }

  const fmt = FORMATS.find(f => f.id === form.ratio)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 14, width: 620, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', animation: 'scalein 0.18s ease' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--cs-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: 'var(--cs-text)', fontWeight: 700, fontSize: 15 }}>New template</div>
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 12, marginTop: 2 }}>Configure then generate or upload your template HTML</div>
          </div>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2].map(s => (
              <div key={s} onClick={() => setStep(s)} style={{ width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, border: `1px solid ${step === s ? '#00B6FF' : 'var(--cs-border)'}`, background: step === s ? 'rgba(0,182,255,0.12)' : 'transparent', color: step === s ? '#00B6FF' : 'var(--cs-text-muted)' }}>{s}</div>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Name */}
            <div>
              <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Template name *</label>
              <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="e.g. Executive Dark"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '9px 12px', color: 'var(--cs-text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            </div>

            {/* Canvas / Format */}
            <div>
              <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Canvas format</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {FORMATS.map(f => (
                  <div key={f.id} onClick={() => set('ratio', f.id)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${form.ratio === f.id ? '#00B6FF' : 'var(--cs-border)'}`, background: form.ratio === f.id ? 'rgba(0,182,255,0.08)' : 'var(--cs-hover)', transition: 'all 0.12s', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{FORMAT_ICONS[f.id]}</div>
                    <div style={{ color: form.ratio === f.id ? '#00B6FF' : 'var(--cs-text)', fontWeight: 600, fontSize: 12 }}>{f.id}</div>
                    <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, marginTop: 2 }}>{f.w}×{f.h}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 6 }}>{FORMAT_ICONS[form.ratio]} {fmt?.sub}</div>
            </div>

            {/* Scene types */}
            <div>
              <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Scene types <span style={{ color: form.scenes.length > 0 ? '#4ade80' : '#f87171', fontWeight: 400, fontSize: 10 }}>({form.scenes.length} selected)</span></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {ALL_SCENE_TYPES.map(st => {
                  const on = form.scenes.includes(st.id)
                  return (
                    <div key={st.id} onClick={() => toggleScene(st.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${on ? '#00B6FF40' : 'var(--cs-border)'}`, background: on ? 'rgba(0,182,255,0.06)' : 'var(--cs-hover)', transition: 'all 0.12s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1, border: `1px solid ${on ? '#00B6FF' : 'var(--cs-border)'}`, background: on ? '#00B6FF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {on && <Check size={10} color="#fff" />}
                      </div>
                      <div>
                        <div style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 600 }}>{st.icon} {st.label}</div>
                        <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, marginTop: 1 }}>{st.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Style preset */}
            <div>
              <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Visual style</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STYLE_PRESETS.map((p, i) => (
                  <div key={i} onClick={() => applyPreset(i)} style={{ padding: '6px 12px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${form.stylePresetIdx === i ? p.accent + '80' : 'var(--cs-border)'}`, background: form.stylePresetIdx === i ? `${p.accent}14` : 'var(--cs-hover)', transition: 'all 0.12s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: p.gradient, flexShrink: 0 }} />
                      <span style={{ color: form.stylePresetIdx === i ? p.accent : 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600 }}>{p.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              {form.stylePresetIdx === STYLE_PRESETS.length - 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div>
                    <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 4 }}>Accent color</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={form.accent} onChange={e => set('accent', e.target.value)} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid var(--cs-border)', cursor: 'pointer', padding: 2 }} />
                      <input value={form.accent} onChange={e => set('accent', e.target.value)} style={{ flex: 1, background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--cs-text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 4 }}>Background color</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={form.bg} onChange={e => set('bg', e.target.value)} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid var(--cs-border)', cursor: 'pointer', padding: 2 }} />
                      <input value={form.bg} onChange={e => set('bg', e.target.value)} style={{ flex: 1, background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 6, padding: '5px 8px', color: 'var(--cs-text)', fontSize: 11, fontFamily: 'monospace', outline: 'none' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(0,182,255,0.06)', border: '1px solid rgba(0,182,255,0.2)' }}>
              <div style={{ color: '#00B6FF', fontWeight: 600, fontSize: 12, marginBottom: 4 }}>How templates work</div>
              <div style={{ color: 'var(--cs-text-sub)', fontSize: 12, lineHeight: 1.5 }}>
                The template HTML must have a <code style={{ background: 'var(--cs-hover)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>{'<div id="scene-container">'}</code> and expose <code style={{ background: 'var(--cs-hover)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>window.loadScene(sceneData)</code> returning <code style={{ background: 'var(--cs-hover)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>true</code> on success. Define a <code style={{ background: 'var(--cs-hover)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>SCENE_BUILDERS</code> object with a function per scene type — auto-generate creates this for you.
              </div>
            </div>

            {/* Mode selector */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[['generate','✨ Auto-generate starter'], ['upload','📁 Upload HTML file'], ['paste','✏️ Paste HTML code']].map(([id, lbl]) => (
                <button key={id} onClick={() => setHtmlMode(id)} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: `1px solid ${htmlMode === id ? '#00B6FF' : 'var(--cs-border)'}`, background: htmlMode === id ? 'rgba(0,182,255,0.08)' : 'var(--cs-hover)', color: htmlMode === id ? '#00B6FF' : 'var(--cs-text-sub)', fontSize: 11, fontWeight: htmlMode === id ? 600 : 400, cursor: 'pointer' }}>
                  {lbl}
                </button>
              ))}
            </div>

            {htmlMode === 'generate' && (
              <div style={{ padding: '14px', borderRadius: 8, background: 'var(--cs-surface2)', border: '1px solid var(--cs-border)' }}>
                <div style={{ color: 'var(--cs-text)', fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Starter HTML will be generated for:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {form.scenes.map(s => {
                    const st = ALL_SCENE_TYPES.find(x => x.id === s)
                    return <span key={s} style={{ padding: '3px 9px', borderRadius: 5, background: `${form.accent}18`, color: form.accent, fontSize: 11, fontWeight: 600 }}>{st?.icon} {st?.label || s}</span>
                  })}
                </div>
                <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
                  A working HTML file with your scene types and colors will be created automatically. You can download it afterward from the Templates page and customize it further.
                </div>
              </div>
            )}

            {htmlMode === 'upload' && (
              <div>
                <div onClick={() => fileRef.current?.click()} style={{ padding: '32px', borderRadius: 8, border: '2px dashed var(--cs-border)', background: 'var(--cs-hover)', cursor: 'pointer', textAlign: 'center' }}>
                  {uploadedFile
                    ? <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 13 }}><Code2 size={18} style={{ display: 'inline', marginRight: 6 }} />{uploadedFile.name}</div>
                    : <div style={{ color: 'var(--cs-text-muted)', fontSize: 13 }}><Code2 size={18} style={{ display: 'inline', marginRight: 6 }} />Click to select .html file</div>
                  }
                </div>
                <input ref={fileRef} type="file" accept=".html,text/html" style={{ display: 'none' }} onChange={e => setUploadedFile(e.target.files[0])} />
              </div>
            )}

            {htmlMode === 'paste' && (
              <div>
                <label style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Paste your HTML</label>
                <textarea value={pastedHtml} onChange={e => setPastedHtml(e.target.value)} rows={12} placeholder={'<!DOCTYPE html>\n<html>\n...\n<body>\n<div id="scene-container"></div>\n<script>\nconst SCENE_BUILDERS = { title_card: (v) => `...`, ... };\nwindow.loadScene = function(sceneData) {\n  const type = sceneData.type_visuel;\n  const v = sceneData.visuel || {};\n  const builder = SCENE_BUILDERS[type];\n  if (!builder) return false;\n  document.getElementById("scene-container").innerHTML = builder(v);\n  return true;\n};\n</script>\n</body>\n</html>'}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)', borderRadius: 7, padding: '10px 12px', color: 'var(--cs-text)', fontSize: 11, fontFamily: 'monospace', resize: 'vertical', outline: 'none', lineHeight: 1.6 }} />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--cs-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {step === 2 && <button onClick={() => setStep(1)} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer' }}>← Back</button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'transparent', color: 'var(--cs-text-sub)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            {step === 1
              ? <button onClick={() => setStep(2)} disabled={!form.label || form.scenes.length === 0} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', cursor: !form.label || form.scenes.length === 0 ? 'not-allowed' : 'pointer', background: !form.label || form.scenes.length === 0 ? 'var(--cs-hover)' : 'linear-gradient(135deg,#08316F,#00B6FF)', color: !form.label || form.scenes.length === 0 ? 'var(--cs-text-muted)' : '#fff', fontSize: 12, fontWeight: 600 }}>Next: HTML →</button>
              : <button onClick={handleSave} disabled={saving} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: saving ? 'var(--cs-hover)' : 'linear-gradient(135deg,#08316F,#00B6FF)', color: saving ? 'var(--cs-text-muted)' : '#fff', fontSize: 12, fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Creating…' : 'Create template'}
                </button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const RATIO_LABELS = { '16:9': 'Video (16:9)', '9:16': 'Reel / Story (9:16)', '1:1': 'Square (1:1)' }

export default function Templates() {
  useTheme()
  const { error } = useToast()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [deleting, setDeleting]   = useState(null)
  const [activeTab, setActiveTab] = useState('all')

  const load = async () => {
    try {
      const res = await fetch('/api/templates')
      if (!res.ok) throw new Error()
      setTemplates(await res.json())
    } catch { /* keep empty */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (tmpl) => {
    if (!window.confirm(`Remove template "${tmpl.label}"?`)) return
    setDeleting(tmpl.id)
    try {
      await fetch(`/api/templates/${tmpl.id}`, { method: 'DELETE' })
      setTemplates(t => t.filter(x => x.id !== tmpl.id))
    } catch { error('Failed to delete template') } finally { setDeleting(null) }
  }

  const grouped = templates.reduce((acc, t) => {
    const k = t.ratio || '16:9'
    if (!acc[k]) acc[k] = []
    acc[k].push(t)
    return acc
  }, {})

  const filtered = activeTab === 'all' ? templates : templates.filter(t => t.ratio === activeTab)

  return (
    <div style={{ maxWidth: 1060 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: 'var(--cs-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Templates</h1>
          <p style={{ color: 'var(--cs-text-muted)', fontSize: 13, margin: 0 }}>
            {templates.filter(t => t.builtin).length} built-in · {templates.filter(t => !t.builtin).length} custom
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#08316F,#00B6FF)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 12px rgba(0,182,255,0.25)' }}>
          <Plus size={15} /> New template
        </button>
      </div>

      {/* Info card */}
      <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 10, background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {ALL_SCENE_TYPES.map(st => (
          <div key={st.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{st.icon}</span>
            <div>
              <div style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 600 }}>{st.label}</div>
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, lineHeight: 1.4 }}>{st.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Format tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
        {[['all', '☰ All'], ...Object.keys(RATIO_LABELS).map(r => [r, `${FORMAT_ICONS[r]} ${RATIO_LABELS[r]}`])].map(([id, lbl]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: activeTab === id ? 'rgba(0,182,255,0.1)' : 'transparent', color: activeTab === id ? '#00B6FF' : 'var(--cs-text-sub)', fontWeight: activeTab === id ? 600 : 400, transition: 'all 0.12s' }}>{lbl}</button>
        ))}
      </div>

      {/* Template grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="cs-skeleton" style={{ height: 200, borderRadius: 12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--cs-text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎨</div>
          <div>No templates in this format yet</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {filtered.map(t => <TemplateCard key={t.id} tmpl={t} onDelete={handleDelete} />)}
        </div>
      )}

      {showAdd && <AddTemplateModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </div>
  )
}
