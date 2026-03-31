import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useGeneration } from '../contexts/GenerationContext'
import { CarouselSlidePreview } from '../components/CarouselPreview'

// ─── Content-type definitions ─────────────────────────────────────────────────
// Each type declares: which steps it goes through, which formats apply,
// which templates it supports, and what the pipeline looks like.

export const CONTENT_TYPES = [
  {
    id: 'video',
    label: 'Video',
    icon: '🎬',
    desc: 'Scripted video with voiceover, rendered scenes & music',
    formats: ['16:9', '1:1', '9:16'],
    defaultFormat: '16:9',
    platforms: ['linkedin', 'youtube', 'facebook'],
    templateGroup: 'video',
    steps: ['Script', 'Render', 'Audio', 'Assemble'],
    stepDesc: ['AI writes a script', 'Puppeteer renders branded scenes', 'ElevenLabs generates voiceover', 'FFmpeg assembles the final video'],
    showScriptPreview: true,
    showVoiceStyle: true,
    showWritingStyle: true,
    showTemplate: true,
    estimatedTime: '~60s',
  },
  {
    id: 'reel',
    label: 'Reel',
    icon: '🎞️',
    desc: 'Short vertical video for Instagram, TikTok & YouTube Shorts',
    formats: ['9:16'],
    defaultFormat: '9:16',
    platforms: ['instagram', 'tiktok', 'youtube'],
    templateGroup: 'reel',
    steps: ['Script', 'Render', 'Audio', 'Assemble'],
    stepDesc: ['Fast hook + 3 punchy scenes', 'Vertical template render', 'Short-form voiceover', 'FFmpeg vertical assembly'],
    showScriptPreview: true,
    showVoiceStyle: true,
    showWritingStyle: true,
    showTemplate: true,
    estimatedTime: '~45s',
  },
  {
    id: 'story',
    label: 'Story',
    icon: '⚡',
    desc: '15-second ephemeral vertical story',
    formats: ['9:16'],
    defaultFormat: '9:16',
    platforms: ['instagram', 'facebook'],
    templateGroup: 'story',
    steps: ['Script', 'Render', 'Audio', 'Assemble'],
    stepDesc: ['Single-message script', 'Story template render', 'Short voiceover', 'FFmpeg story assembly'],
    showScriptPreview: true,
    showVoiceStyle: false,
    showWritingStyle: false,
    showTemplate: true,
    estimatedTime: '~30s',
  },
  {
    id: 'carousel',
    label: 'Carousel',
    icon: '🖼️',
    desc: 'Multi-slide image carousel (PDF-ready, LinkedIn / Instagram)',
    formats: ['1:1', '4:5'],
    defaultFormat: '1:1',
    platforms: ['linkedin', 'instagram', 'facebook'],
    templateGroup: 'carousel',
    steps: ['Copy', 'Slides', 'Export'],
    stepDesc: ['AI writes each slide\'s copy', 'Puppeteer renders individual slides', 'Export as image set / PDF'],
    showScriptPreview: true,
    showVoiceStyle: false,
    showWritingStyle: true,
    showTemplate: true,
    estimatedTime: '~20s',
  },
  {
    id: 'image_post',
    label: 'Image Post',
    icon: '📸',
    desc: 'Single branded image with headline & key stat',
    formats: ['1:1', '4:5', '16:9'],
    defaultFormat: '1:1',
    platforms: ['linkedin', 'instagram', 'facebook', 'twitter'],
    templateGroup: 'image',
    steps: ['Copy', 'Render'],
    stepDesc: ['AI writes headline & body copy', 'Puppeteer renders branded image'],
    showScriptPreview: true,
    showVoiceStyle: false,
    showWritingStyle: true,
    showTemplate: true,
    estimatedTime: '~10s',
  },
  {
    id: 'text_only',
    label: 'Text Post',
    icon: '✍️',
    desc: 'Long-form text post — LinkedIn article, thread or newsletter',
    formats: ['text'],
    defaultFormat: 'text',
    platforms: ['linkedin', 'twitter', 'facebook'],
    templateGroup: 'text',
    steps: ['Outline', 'Write', 'Polish'],
    stepDesc: ['AI builds a structured outline', 'Full post drafted with hook, body & CTA', 'Final tone & style pass'],
    showScriptPreview: true,
    showVoiceStyle: false,
    showWritingStyle: true,
    showTemplate: false,
    estimatedTime: '~8s',
  },
]

// ─── Template groups ──────────────────────────────────────────────────────────
const TEMPLATE_GROUPS = {
  video: [
    { id: 'rodschinson_premium', label: 'Rodschinson Premium', gradient: 'linear-gradient(135deg,#08316F,#0a3d8a)', accent: '#C8A96E', desc: 'Dark blue · gold · institutional' },
    { id: 'cre',                 label: 'CRE Terminal',        gradient: 'linear-gradient(135deg,#080E1A,#0d1a30)', accent: '#00E5C8', desc: 'Dark · cyan · data terminal' },
    { id: 'tech_data',           label: 'Tech Data',           gradient: 'linear-gradient(135deg,#031520,#061e2e)', accent: '#00B6FF', desc: 'Bloomberg · chart-heavy' },
    { id: 'news_reel',           label: 'News Reel',           gradient: 'linear-gradient(135deg,#1a0505,#2d0f0f)', accent: '#FF4444', desc: 'Breaking news · urgent' },
    { id: 'corporate_minimal',   label: 'Corporate Minimal',   gradient: 'linear-gradient(135deg,#0a0a0a,#181818)', accent: '#ffffff', desc: 'Clean · editorial · white' },
  ],
  reel: [
    { id: 'reel_premium',  label: 'Premium',  gradient: 'linear-gradient(135deg,#08316F,#041d45)', accent: '#C8A96E', desc: 'Dark blue · gold · institutional' },
    { id: 'reel_data',     label: 'Data',     gradient: 'linear-gradient(135deg,#080E1A,#0d1a30)', accent: '#00E5C8', desc: 'Dark · cyan · data terminal' },
    { id: 'reel_bold',     label: 'Bold',     gradient: 'linear-gradient(135deg,#0a0a0a,#1a0505)', accent: '#FF4444', desc: 'Black · red · high-energy' },
    { id: 'reel_minimal',  label: 'Minimal',  gradient: 'linear-gradient(135deg,#F5F5F0,#e8e8e0)', accent: '#08316F', desc: 'White · editorial · clean' },
    { id: 'reel_gradient', label: 'Gradient', gradient: 'linear-gradient(135deg,#1a0a2e,#2d1454,#08316F)', accent: '#a855f7', desc: 'Purple · gold · modern' },
  ],
  story: [
    { id: 'reel_premium',  label: 'Premium',  gradient: 'linear-gradient(135deg,#08316F,#041d45)', accent: '#C8A96E', desc: 'Dark blue · gold · branded' },
    { id: 'reel_data',     label: 'Data',     gradient: 'linear-gradient(135deg,#080E1A,#0d1a30)', accent: '#00E5C8', desc: 'One stat · full screen · cyan' },
    { id: 'reel_bold',     label: 'Bold',     gradient: 'linear-gradient(135deg,#0a0a0a,#1a0505)', accent: '#FF4444', desc: 'Black · red · flash impact' },
    { id: 'reel_minimal',  label: 'Minimal',  gradient: 'linear-gradient(135deg,#F5F5F0,#e8e8e0)', accent: '#08316F', desc: 'White · clean · editorial' },
    { id: 'reel_gradient', label: 'Gradient', gradient: 'linear-gradient(135deg,#1a0a2e,#2d1454,#08316F)', accent: '#a855f7', desc: 'Purple gradient · social-native' },
  ],
  carousel: [
    { id: 'carousel_cre',        label: 'CRE Navy',            gradient: 'linear-gradient(135deg,#08316F,#0a4a9e)', accent: '#00B6FF', desc: 'Navy · sky blue · KPI + metrics' },
    { id: 'carousel_clean',      label: 'Clean Slides',        gradient: 'linear-gradient(135deg,#f8f9fa,#e9ecef)', accent: '#08316F', desc: 'Light · editorial · clean layout' },
    { id: 'carousel_bold',       label: 'Bold Deck',           gradient: 'linear-gradient(135deg,#08316F,#0a3d8a)', accent: '#C8A96E', desc: 'Dark navy · gold · premium' },
    { id: 'carousel_minimal',    label: 'Minimal',             gradient: 'linear-gradient(135deg,#0a0a0a,#181818)', accent: '#ffffff',  desc: 'Black · white · ultra-minimal' },
    { id: 'carousel_data',       label: 'Data Slides',         gradient: 'linear-gradient(135deg,#031520,#061e2e)', accent: '#00B6FF', desc: 'Deep dark · cyan · data-heavy' },
  ],
  image: [
    { id: 'image_stat',          label: 'Stat Card',           gradient: 'linear-gradient(135deg,#08316F,#0a3d8a)', accent: '#C8A96E'  },
    { id: 'image_quote',         label: 'Quote Card',          gradient: 'linear-gradient(135deg,#1a0a2e,#2d1454)', accent: '#a855f7'  },
    { id: 'image_news',          label: 'News Banner',         gradient: 'linear-gradient(135deg,#1a0505,#2d0f0f)', accent: '#FF4444'  },
    { id: 'image_clean',         label: 'Clean White',         gradient: 'linear-gradient(135deg,#f0f4f8,#dde8f0)', accent: '#08316F'  },
  ],
  text: [
    { id: 'text_linkedin',       label: 'LinkedIn Article',    gradient: 'linear-gradient(135deg,#0077B5,#005580)', accent: '#ffffff'   },
    { id: 'text_thread',         label: 'Thread',              gradient: 'linear-gradient(135deg,#1DA1F2,#0d8ecf)', accent: '#ffffff'   },
    { id: 'text_newsletter',     label: 'Newsletter',          gradient: 'linear-gradient(135deg,#C8A96E,#a8894e)', accent: '#ffffff'   },
  ],
}

// ─── Other static data ────────────────────────────────────────────────────────
const BRANDS = [
  { id: 'investment', name: 'Rodschinson Investment', initials: 'RI', color: '#C8A96E' },
  { id: 'rachid',     name: 'Rachid Chikhi',          initials: 'RC', color: '#00B6FF' },
]
const LANGUAGES = ['EN', 'FR', 'NL']
const STYLES = [
  { id: 'viral_hook',  label: 'Viral Hook'  },
  { id: 'educational', label: 'Educational' },
  { id: 'data_story',  label: 'Data Story'  },
  { id: 'personal',    label: 'Personal'    },
  { id: 'provocateur', label: 'Provocateur' },
  { id: 'thread',      label: 'Thread'      },
]
const VOICE_STYLES = [
  { id: 'professional', label: 'Professional' },
  { id: 'energetic',    label: 'Energetic'    },
  { id: 'calm',         label: 'Calm'         },
  { id: 'authoritative',label: 'Authoritative'},
]
const ALL_PLATFORMS = [
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0077B5' },
  { id: 'youtube',   label: 'YouTube',   color: '#FF0000' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C' },
  { id: 'tiktok',    label: 'TikTok',    color: '#00b4b4' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2' },
  { id: 'twitter',   label: 'Twitter/X', color: '#1DA1F2' },
]

const SLIDE_COUNTS = [4, 5, 6, 7, 8, 10]

const DURATIONS_BY_TYPE = {
  video: [
    { value: 60,  label: '1 min'  },
    { value: 120, label: '2 min'  },
    { value: 180, label: '3 min'  },
    { value: 300, label: '5 min'  },
    { value: 480, label: '8 min'  },
    { value: 600, label: '10 min' },
  ],
  reel: [
    { value: 15,  label: '15s'   },
    { value: 30,  label: '30s'   },
    { value: 45,  label: '45s'   },
    { value: 60,  label: '60s'   },
    { value: 90,  label: '90s'   },
  ],
  story: [
    { value: 7,   label: '7s'    },
    { value: 10,  label: '10s'   },
    { value: 15,  label: '15s'   },
    { value: 20,  label: '20s'   },
  ],
}
const VIDEO_DURATIONS = DURATIONS_BY_TYPE.video  // kept for summary row compat

const MUSIC_GENRES = [
  { id: 'corporate', label: 'Corporate' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'lofi',      label: 'Lo-Fi'     },
  { id: 'upbeat',    label: 'Upbeat'    },
]

const INITIAL_FORM = {
  subject: '', brand: 'investment', language: 'EN',
  contentType: 'video', format: '16:9',
  template: 'reel_premium', style: 'viral_hook',
  voiceStyle: 'professional', platforms: ['linkedin'], logo: null,
  slides: 6, duration: 60, canvaTemplateUrl: '',
  audioMode: 'voice', musicGenre: 'corporate',
}

function loadSavedTemplates() {
  try { return JSON.parse(localStorage.getItem('cs-brief-templates') || '[]') } catch { return [] }
}
function saveBriefTemplates(list) {
  localStorage.setItem('cs-brief-templates', JSON.stringify(list))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ active, children, onClick, color }) {
  return (
    <div onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 6, cursor: 'pointer', userSelect: 'none',
      border: active ? `1px solid ${color || '#00B6FF'}` : '1px solid var(--cs-border)',
      background: active ? (color ? `${color}14` : 'rgba(0,182,255,0.08)') : 'var(--cs-hover)',
      color: active ? (color || '#0099dd') : 'var(--cs-text-sub)',
      fontSize: 13, fontWeight: active ? 600 : 400,
      transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>{children}</div>
  )
}

function Section({ title, hint, children }) {
  return (
    <div style={{
      background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
      borderRadius: 10, padding: 20, marginBottom: 14,
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {title}
        </div>
        {hint && <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 3 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

// Content type picker card
function TypeCard({ type, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
      border: active ? '2px solid #00B6FF' : '1px solid var(--cs-border)',
      background: active ? 'rgba(0,182,255,0.06)' : 'var(--cs-surface)',
      transition: 'all 0.15s',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{type.icon}</span>
        <span style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? '#00B6FF' : 'var(--cs-text)' }}>
          {type.label}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--cs-text-muted)', lineHeight: 1.4 }}>{type.desc}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <span style={{
          padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
          background: active ? 'rgba(0,182,255,0.12)' : 'var(--cs-hover)',
          color: active ? '#00B6FF' : 'var(--cs-text-muted)',
        }}>{type.estimatedTime}</span>
        {type.steps.map((s, i) => (
          <span key={s} style={{ fontSize: 10, color: 'var(--cs-text-muted)' }}>
            {s}{i < type.steps.length - 1 ? ' →' : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

// Pipeline preview (shows the steps this content type will run)
function PipelinePreview({ typeDef }) {
  return (
    <div style={{
      background: 'var(--cs-surface2)', borderRadius: 8, padding: '12px 16px',
      border: '1px solid var(--cs-border)',
    }}>
      <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        Generation pipeline
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {typeDef.steps.map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(0,182,255,0.1)', border: '1px solid rgba(0,182,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#00B6FF', fontSize: 10, fontWeight: 700,
            }}>{i + 1}</div>
            <div>
              <div style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 600 }}>{step}</div>
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>{typeDef.stepDesc[i]}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--cs-text-muted)' }}>Estimated time:</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#00B6FF' }}>{typeDef.estimatedTime}</span>
      </div>
    </div>
  )
}

function TemplateCard({ tpl, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      cursor: 'pointer', borderRadius: 8, overflow: 'hidden', transition: 'all 0.15s',
      border: active ? `2px solid ${tpl.accent === '#ffffff' ? '#00B6FF' : tpl.accent}` : '2px solid var(--cs-border)',
      transform: active ? 'scale(1.02)' : 'scale(1)',
    }}>
      <div style={{ background: tpl.gradient, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 4, borderRadius: 2, background: tpl.accent, opacity: 0.9 }} />
      </div>
      <div style={{
        padding: '7px 10px', fontSize: 11, textAlign: 'center',
        background: active ? 'rgba(0,182,255,0.05)' : 'var(--cs-surface2)',
        color: active ? '#08316F' : 'var(--cs-text-sub)', fontWeight: active ? 600 : 400,
      }}>{tpl.label}</div>
    </div>
  )
}

function LogoUpload({ file, onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith('image/')) onFile(f)
  }, [onFile])
  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: dragging ? '2px dashed #00B6FF' : '2px dashed var(--cs-border)',
        borderRadius: 8, padding: '20px', textAlign: 'center', cursor: 'pointer',
        background: dragging ? 'rgba(0,182,255,0.04)' : 'transparent', transition: 'all 0.15s',
      }}
    >
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      {file ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <img src={URL.createObjectURL(file)} alt="logo" style={{ height: 32, objectFit: 'contain', borderRadius: 4 }} />
          <span style={{ color: 'var(--cs-text)', fontSize: 13 }}>{file.name}</span>
          <span style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>· click to replace</span>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 20, marginBottom: 6 }}>☁️</div>
          <div style={{ color: 'var(--cs-text-sub)', fontSize: 13 }}>
            Drop logo or <span style={{ color: '#00B6FF' }}>browse</span>
          </div>
          <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 3 }}>PNG, SVG, JPG</div>
        </>
      )}
    </div>
  )
}

function StepIndicator({ step, total = 3, labels }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
      {labels.map((label, i) => {
        const n     = i + 1
        const done  = step > n
        const cur   = step === n
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < total - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: done ? '#00B6FF' : cur ? 'rgba(0,182,255,0.1)' : 'var(--cs-hover)',
                color: done ? '#fff' : cur ? '#00B6FF' : 'var(--cs-text-muted)',
                border: cur ? '2px solid #00B6FF' : done ? 'none' : '1px solid var(--cs-border)',
                transition: 'all 0.2s',
              }}>
                {done ? '✓' : n}
              </div>
              <span style={{
                fontSize: 12, fontWeight: cur ? 600 : 400,
                color: cur ? 'var(--cs-text)' : done ? '#00B6FF' : 'var(--cs-text-muted)',
              }}>{label}</span>
            </div>
            {i < total - 1 && (
              <div style={{
                flex: 1, height: 1, margin: '0 10px',
                background: step > n ? 'rgba(0,182,255,0.4)' : 'var(--cs-border)',
                transition: 'background 0.2s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color: 'var(--cs-text-sub)', fontSize: 12, textAlign: 'right', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </span>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Canva Template Components ───────────────────────────────────────────────

function CanvaTemplateCard({ tpl, active, onClick, onDelete }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', transition: 'all 0.15s', position: 'relative',
        border: active ? '2px solid #00C4CC' : '2px solid var(--cs-border)',
        transform: active ? 'scale(1.02)' : 'scale(1)',
      }}>
      {/* Canva badge */}
      <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, background: '#00C4CC', borderRadius: 3, padding: '2px 6px', fontSize: 9, fontWeight: 700, color: '#fff' }}>CANVA</div>
      {onDelete && hover && (
        <button onClick={e => { e.stopPropagation(); onDelete(tpl.id) }} style={{
          position: 'absolute', top: 5, right: 5, zIndex: 2, width: 20, height: 20,
          borderRadius: '50%', background: 'rgba(239,68,68,0.9)', border: 'none',
          cursor: 'pointer', color: '#fff', fontSize: 11, lineHeight: 1,
        }}>×</button>
      )}
      <div style={{
        height: 56, background: tpl.thumbnail_url
          ? `url(${tpl.thumbnail_url}) center/cover`
          : 'linear-gradient(135deg,#00C4CC,#0097a7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {!tpl.thumbnail_url && <span style={{ fontSize: 20 }}>🎨</span>}
      </div>
      <div style={{
        padding: '7px 10px', fontSize: 11, textAlign: 'center',
        background: active ? 'rgba(0,196,204,0.05)' : 'var(--cs-surface2)',
        color: active ? '#0097a7' : 'var(--cs-text-sub)', fontWeight: active ? 600 : 400,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{tpl.name}</div>
    </div>
  )
}

function AddCanvaTemplateModal({ contentType, onAdded, onClose }) {
  const [name, setName]   = useState('')
  const [url, setUrl]     = useState('')
  const [thumb, setThumb] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState(null)

  const typeMap = { carousel: 'carousel', image_post: 'image', video: 'video', reel: 'video', story: 'video' }
  const canvaType = typeMap[contentType] || 'carousel'

  const save = async () => {
    if (!name.trim() || !url.trim()) { setErr('Name and Canva URL required.'); return }
    if (!url.includes('canva.com')) { setErr('Must be a canva.com share link.'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/canva-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), type: canvaType, thumbnail_url: thumb.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const tpl = await res.json()
      onAdded(tpl)
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 14, width: 460, maxWidth: '94vw', padding: 26, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', animation: 'fadein 0.15s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <h3 style={{ color: 'var(--cs-text)', fontSize: 15, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#00C4CC', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#fff', fontWeight: 700 }}>CANVA</span>
              Import Template
            </h3>
            <p style={{ color: 'var(--cs-text-muted)', fontSize: 12, margin: '4px 0 0' }}>Paste the share link from your Canva design</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text-muted)', fontSize: 22 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>TEMPLATE NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Carousel Blue Theme" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'var(--cs-input-bg)', color: 'var(--cs-text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div>
            <label style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>CANVA SHARE URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.canva.com/design/DAxxxxxx/view" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'var(--cs-input-bg)', color: 'var(--cs-text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 4 }}>In Canva: Share → Copy link</div>
          </div>
          <div>
            <label style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>THUMBNAIL URL <span style={{ fontWeight: 400, color: 'var(--cs-text-muted)' }}>(optional)</span></label>
            <input value={thumb} onChange={e => setThumb(e.target.value)} placeholder="https://..." style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'var(--cs-input-bg)', color: 'var(--cs-text)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          </div>

          <div style={{ background: 'rgba(0,196,204,0.06)', border: '1px solid rgba(0,196,204,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: 'var(--cs-text-muted)' }}>
            The Canva design will be used as a visual reference. Content is generated by AI and styled to match your template.
          </div>

          {err && <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 12 }}>{err}</div>}

          <button onClick={save} disabled={saving} style={{
            padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? 'var(--cs-hover)' : '#00C4CC',
            color: saving ? 'var(--cs-text-muted)' : '#fff', fontSize: 13, fontWeight: 700,
          }}>{saving ? 'Saving…' : '🎨 Import Template'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Variation Card ───────────────────────────────────────────────────────────
function VariationCard({ v, active, onClick, index }) {
  return (
    <div onClick={onClick} style={{
      padding: '16px 18px', borderRadius: 10, cursor: 'pointer',
      border: active ? '2px solid #00B6FF' : '1px solid var(--cs-border)',
      background: active ? 'rgba(0,182,255,0.06)' : 'var(--cs-surface)',
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: active ? 'rgba(0,182,255,0.15)' : 'var(--cs-hover)',
          border: active ? '1px solid rgba(0,182,255,0.4)' : '1px solid var(--cs-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: active ? '#00B6FF' : 'var(--cs-text-muted)', fontSize: 11, fontWeight: 700,
        }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: active ? '#00B6FF' : 'var(--cs-text)', marginBottom: 4, lineHeight: 1.3 }}>
            {v.title || v.angle || 'Concept ' + (index + 1)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cs-text-muted)', marginBottom: 6, fontStyle: 'italic' }}>
            {v.angle || ''}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--cs-text-sub)', lineHeight: 1.5,
            padding: '8px 10px', borderRadius: 6,
            background: active ? 'rgba(0,182,255,0.04)' : 'var(--cs-hover)',
            borderLeft: `2px solid ${active ? '#00B6FF' : 'var(--cs-border)'}`,
          }}>
            "{v.hook || ''}"
          </div>
          {v.scenes && v.scenes.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {v.scenes.slice(0, 3).map((s, i) => (
                <span key={i} style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 10,
                  background: 'var(--cs-hover)', color: 'var(--cs-text-muted)',
                  border: '1px solid var(--cs-border)',
                }}>{typeof s === 'string' ? s.replace(/^Scene \d+:\s*/i, '').slice(0, 40) : ''}</span>
              ))}
              {v.scenes.length > 3 && <span style={{ fontSize: 10, color: 'var(--cs-text-muted)' }}>+{v.scenes.length - 3} more</span>}
            </div>
          )}
          {v.slides && v.slides.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {v.slides.slice(0, 3).map((s, i) => (
                <span key={i} style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 10,
                  background: 'var(--cs-hover)', color: 'var(--cs-text-muted)',
                  border: '1px solid var(--cs-border)',
                }}>{s.headline ? s.headline.slice(0, 40) : `Slide ${i+1}`}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ─── Live Generation Progress Panel ──────────────────────────────────────────
function GenerationPanel({ job, typeDef, onDone, onReset }) {
  const navigate = useNavigate()
  const isDone     = job?.status === 'done'
  const isError    = job?.status === 'error'
  const isAborted  = job?.status === 'aborted'
  const isRunning  = job?.status === 'running' || job?.status === 'pending'
  const progress   = job?.progress || 0
  const step       = job?.step || 'Queued'
  const detail     = job?.detail || ''
  const [aborting, setAborting] = useState(false)

  async function handleAbort() {
    if (!job?.job_id || aborting) return
    setAborting(true)
    try {
      await fetch(`/api/jobs/${job.job_id}/abort`, { method: 'POST' })
    } catch { /* ignore */ } finally {
      setAborting(false)
    }
  }

  return (
    <div style={{ animation: 'fadein 0.2s ease' }}>
      <div style={{ background: 'var(--cs-surface)', border: `1px solid ${isError || isAborted ? 'rgba(239,68,68,0.3)' : isDone ? 'rgba(34,197,94,0.3)' : 'rgba(0,182,255,0.2)'}`, borderRadius: 12, padding: 28, marginBottom: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: isDone ? 'rgba(34,197,94,0.1)' : isError || isAborted ? 'rgba(239,68,68,0.1)' : 'rgba(0,182,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            {isDone ? '✅' : isError ? '❌' : isAborted ? '⛔' : typeDef.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--cs-text)', fontSize: 15, fontWeight: 700 }}>
              {isDone ? `${typeDef.label} ready!` : isError ? 'Generation failed' : isAborted ? 'Generation cancelled' : `Generating ${typeDef.label}…`}
            </div>
            <div style={{ color: 'var(--cs-text-muted)', fontSize: 12, marginTop: 2 }}>
              {isDone ? 'Your content has been added to the library.' : isError ? 'An error occurred during generation.' : isAborted ? 'Generation was stopped.' : `${step} · ${typeDef.estimatedTime} estimated`}
            </div>
          </div>
          {/* Abort button — visible only while running */}
          {isRunning && (
            <button onClick={handleAbort} disabled={aborting} style={{
              padding: '6px 14px', borderRadius: 7, cursor: aborting ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)',
              color: '#ef4444', fontSize: 12, fontWeight: 600, flexShrink: 0,
              opacity: aborting ? 0.6 : 1,
            }}>
              {aborting ? 'Stopping…' : '⛔ Abort'}
            </button>
          )}
          {/* Dismiss × — always visible so stuck jobs can always be cleared */}
          <button onClick={onReset} title="Dismiss" style={{
            width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--cs-border)',
            background: 'var(--cs-hover)', color: 'var(--cs-text-muted)', cursor: 'pointer',
            fontSize: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Progress bar */}
        {!isDone && !isError && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: 'var(--cs-text-sub)', fontSize: 12, fontWeight: 600 }}>{step}</span>
              <span style={{ color: '#00B6FF', fontSize: 12, fontWeight: 700 }}>{progress}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--cs-hover)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#00B6FF,#08316F)', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {/* Pipeline steps */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {typeDef.steps.map((s, i) => {
            const stepProgress = (i + 1) / typeDef.steps.length * 100
            const done    = progress >= stepProgress || isDone
            const current = !done && progress >= (i / typeDef.steps.length * 100)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: done ? 'rgba(34,197,94,0.1)' : current ? 'rgba(0,182,255,0.1)' : 'var(--cs-hover)',
                color: done ? '#16a34a' : current ? '#00B6FF' : 'var(--cs-text-muted)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.25)' : current ? 'rgba(0,182,255,0.25)' : 'var(--cs-border)'}`,
              }}>
                {done ? '✓' : current ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> : `${i+1}`} {s}
              </div>
            )
          })}
        </div>

        {/* Error detail */}
        {isError && detail && (
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#dc2626', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
            {detail}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isDone && (
            <button onClick={() => navigate('/library')} style={{
              flex: 1, padding: '12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#08316F,#00B6FF)', color: '#fff', fontSize: 13, fontWeight: 700,
            }}>View in Library →</button>
          )}
          {!isRunning && (
            <button onClick={onReset} style={{
              flex: isDone ? '0 0 auto' : 1, padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--cs-border)', background: 'var(--cs-surface)',
              color: 'var(--cs-text-sub)', fontSize: 13, fontWeight: 600,
            }}>
              {isDone ? '+ New Content' : (isError || isAborted) ? '↩ Edit & Retry' : '+ Create Another'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AI Template Generator Modal ─────────────────────────────────────────────
function GenerateTemplateModal({ contentType, onGenerated, onClose }) {
  const [name, setName]         = useState('')
  const [desc, setDesc]         = useState('')
  const [bgColor, setBgColor]   = useState('#08316F')
  const [accent, setAccent]     = useState('#C8A96E')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const templateType = ['carousel'].includes(contentType) ? 'carousel'
    : ['image_post'].includes(contentType) ? 'image' : 'video'

  const generate = async () => {
    if (!name.trim() || !desc.trim()) { setError('Name and description are required.'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/generate-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: desc.trim(), type: templateType, bg_color: bgColor, accent_color: accent }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg.includes('ANTHROPIC_API_KEY') ? 'ANTHROPIC_API_KEY not set in .env' : `Failed: ${res.status}`)
      }
      const tpl = await res.json()
      onGenerated(tpl)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
        borderRadius: 14, width: 480, maxWidth: '94vw', padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', animation: 'fadein 0.15s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ color: 'var(--cs-text)', fontSize: 16, fontWeight: 700, margin: 0 }}>✨ Generate Template with AI</h3>
            <p style={{ color: 'var(--cs-text-muted)', fontSize: 12, margin: '4px 0 0' }}>Claude will generate a branded HTML template for Puppeteer</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text-muted)', fontSize: 22 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>TEMPLATE NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dark Luxury" style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7,
              border: '1px solid var(--cs-border)', background: 'var(--cs-input-bg)',
              color: 'var(--cs-text)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }} />
          </div>

          <div>
            <label style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>VISUAL STYLE DESCRIPTION</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="e.g. Minimalist dark background with gold geometric lines, serif headlines, subtle grain texture, premium investment feel" style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7,
              border: '1px solid var(--cs-border)', background: 'var(--cs-input-bg)',
              color: 'var(--cs-text)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
            }} />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>BACKGROUND COLOR</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'var(--cs-input-bg)' }}>
                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                <span style={{ color: 'var(--cs-text-sub)', fontSize: 12, fontFamily: 'monospace' }}>{bgColor}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>ACCENT COLOR</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 7, border: '1px solid var(--cs-border)', background: 'var(--cs-input-bg)' }}>
                <input type="color" value={accent} onChange={e => setAccent(e.target.value)} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                <span style={{ color: 'var(--cs-text-sub)', fontSize: 12, fontFamily: 'monospace' }}>{accent}</span>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(0,182,255,0.05)', border: '1px solid rgba(0,182,255,0.15)', borderRadius: 7, padding: '8px 12px' }}>
            <span style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>Type: <strong style={{ color: '#00B6FF' }}>{templateType}</strong> · Claude Opus will generate the full HTML template (~10–20s)</span>
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 12 }}>{error}</div>}

          <button onClick={generate} disabled={loading} style={{
            padding: '12px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? 'var(--cs-hover)' : 'linear-gradient(135deg,#08316F,#00B6FF)',
            color: loading ? 'var(--cs-text-muted)' : '#fff', fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {loading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 0.8s linear infinite' }}>
                  <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--cs-border)" strokeWidth="1.5" />
                  <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="#00B6FF" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Generating…
              </>
            ) : '✨ Generate Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function NewContent() {
  useTheme()
  const navigate = useNavigate()
  const { trackJob, jobs } = useGeneration()

  const [step, setStep]   = useState(1)
  const [form, setForm]   = useState(() => {
    // Check if Library sent us a regeneration context
    const regen = sessionStorage.getItem('cs-regenerate')
    if (regen) {
      sessionStorage.removeItem('cs-regenerate')
      try { return { ...INITIAL_FORM, ...JSON.parse(regen) } } catch {}
    }
    return INITIAL_FORM
  })

  const [error, setError]             = useState(null)
  const [currentJobId, setCurrentJobId] = useState(null)
  // Script preview
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewScript, setPreviewScript]   = useState(null)
  const [editedScript, setEditedScript]     = useState('')
  // Variations (step 1 concept picker)
  const [variations, setVariations]           = useState([])
  const [variationsLoading, setVariationsLoading] = useState(false)
  const [selectedVariation, setSelectedVariation] = useState(null)
  // Carousel slide preview
  const [carouselSlides, setCarouselSlides]       = useState([])
  const [carouselSlidesLoading, setCarouselSlidesLoading] = useState(false)
  const [carouselActiveSlide, setCarouselActiveSlide] = useState(0)
  // Brief templates
  const [briefTemplates, setBriefTemplates] = useState(loadSavedTemplates)
  const [showTplMenu, setShowTplMenu]       = useState(false)
  const tplMenuRef = useRef()
  // AI template generator
  const [showGenTpl, setShowGenTpl]           = useState(false)
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs-custom-templates') || '[]') } catch { return [] }
  })
  // Canva templates
  const [showCanvaTpl, setShowCanvaTpl]       = useState(false)
  const [canvaTemplates, setCanvaTemplates]   = useState([])

  useEffect(() => {
    fetch('/api/canva-templates')
      .then(r => r.json())
      .then(d => setCanvaTemplates(d.templates || []))
      .catch(() => {})
  }, [])

  // Derived
  const typeDef    = CONTENT_TYPES.find(t => t.id === form.contentType) || CONTENT_TYPES[0]
  const baseTemplates = TEMPLATE_GROUPS[typeDef.templateGroup] || TEMPLATE_GROUPS.video
  const templates  = [...baseTemplates, ...customTemplates.filter(t => t.templateGroup === typeDef.templateGroup || t.type === typeDef.templateGroup)]
  const platforms  = ALL_PLATFORMS.filter(p => typeDef.platforms.includes(p.id))
  const stepLabels = ['Brief', 'Format & Style', 'Review']

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // When contentType changes, reset format and template to sensible defaults
  useEffect(() => {
    const newType = CONTENT_TYPES.find(t => t.id === form.contentType)
    if (!newType) return
    const validFormats = newType.formats
    const newFormat = validFormats.includes(form.format) ? form.format : newType.defaultFormat
    const newTemplates = TEMPLATE_GROUPS[newType.templateGroup] || []
    const templateIds = newTemplates.map(t => t.id)
    const newTemplate = templateIds.includes(form.template) ? form.template : (newTemplates[0]?.id || '')
    const validPlatforms = ALL_PLATFORMS.filter(p => newType.platforms.includes(p.id)).map(p => p.id)
    const newPlatforms = form.platforms.filter(p => validPlatforms.includes(p))

    const newDurations = DURATIONS_BY_TYPE[newType.id] || DURATIONS_BY_TYPE.video
    const newDuration = newDurations.find(d => d.value === form.duration) ? form.duration : newDurations[Math.floor(newDurations.length / 2)].value
    setForm(f => ({
      ...f,
      format: newFormat,
      template: newTemplate,
      platforms: newPlatforms.length ? newPlatforms : [validPlatforms[0]],
      duration: newDuration,
    }))
    setVariations([]); setSelectedVariation(null)
    setCarouselSlides([]); setCarouselActiveSlide(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contentType])

  // Close template menu on outside click
  useEffect(() => {
    function handler(e) {
      if (tplMenuRef.current && !tplMenuRef.current.contains(e.target)) setShowTplMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const togglePlatform = (id) =>
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(id)
        ? f.platforms.filter(p => p !== id)
        : [...f.platforms, id],
    }))

  // ── Variations (step 1 concept picker) ─────────────────────────────────────
  const handleGenerateVariations = async () => {
    if (!form.subject.trim()) { setError('Enter a brief first.'); return }
    setVariationsLoading(true); setError(null); setVariations([]); setSelectedVariation(null)
    try {
      const res = await fetch('/api/generate-variations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: form.subject, brand: form.brand, language: form.language,
          contentType: form.contentType, style: form.style, count: 5,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setVariations(data.variations || [])
    } catch (e) {
      setError('Could not generate ideas — ' + e.message)
    } finally { setVariationsLoading(false) }
  }

  const handlePickVariation = (v) => {
    setSelectedVariation(v)
    // Pre-fill subject with the chosen concept title
    set('subject', v.title || v.angle || form.subject)
  }

  // ── Carousel slide preview ──────────────────────────────────────────────────
  const handlePreviewCarouselSlides = async () => {
    if (!form.subject.trim()) return
    setCarouselSlidesLoading(true); setError(null); setCarouselSlides([])
    try {
      const res = await fetch('/api/preview-carousel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: form.subject, brand: form.brand, language: form.language,
          style: form.style, slides: form.slides,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setCarouselSlides(data.slides || [])
      setCarouselActiveSlide(0)
    } catch (e) {
      setError('Could not generate preview — ' + e.message)
    } finally { setCarouselSlidesLoading(false) }
  }

  // ── Script preview ──────────────────────────────────────────────────────────
  const handlePreviewScript = async () => {
    if (!form.subject.trim()) { setError('Enter a brief first.'); return }
    setPreviewLoading(true); setError(null)
    try {
      const res = await fetch('/api/preview-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: form.subject, brand: form.brand,
          language: form.language, format: form.format,
          contentType: form.contentType,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setPreviewScript(data)
      setEditedScript(JSON.stringify(data.script, null, 2))
    } catch {
      setError('Preview unavailable — API offline. You can generate directly.')
    } finally { setPreviewLoading(false) }
  }

  // ── Generate (fires & forgets — user can navigate away) ─────────────────────
  const handleGenerate = async (overrideSubject = null) => {
    const subject = overrideSubject || form.subject
    if (!subject.trim())             { setError('Enter a brief subject.'); return }
    if (form.platforms.length === 0) { setError('Select at least one platform.'); return }
    setError(null)

    const body = new FormData()
    body.append('payload', JSON.stringify({
      subject, brand: form.brand, language: form.language,
      contentType: form.contentType, format: form.format,
      template: form.template, style: form.style,
      voiceStyle: form.voiceStyle, platforms: form.platforms,
      slides: form.slides,
      duration: form.duration,
      audioMode: form.audioMode,
      musicGenre: form.musicGenre,
      ...(form.canvaTemplateUrl ? { canva_template_url: form.canvaTemplateUrl } : {}),
      ...(previewScript && editedScript && !overrideSubject ? { custom_script: editedScript } : {}),
    }))
    if (form.logo) body.append('logo', form.logo)

    try {
      const res = await fetch('/api/generate', { method: 'POST', body })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()

      trackJob(data.job_id, { title: subject.slice(0, 60), contentType: form.contentType })

      // Only set active job for single generates (not bulk)
      if (!overrideSubject) setCurrentJobId(data.job_id)

      return data.job_id
    } catch (e) {
      setError(e.message)
      return null
    }
  }

  // ── Bulk generate all variations at once ─────────────────────────────────────
  const [bulkLaunching, setBulkLaunching] = useState(false)
  const [bulkCount, setBulkCount]         = useState(0)

  const handleGenerateAll = async () => {
    if (variations.length === 0) return
    if (form.platforms.length === 0) { setError('Select at least one platform.'); return }
    setBulkLaunching(true); setBulkCount(0); setError(null)
    let launched = 0
    for (const v of variations) {
      const subject = v.title || v.angle || v.hook || form.subject
      const jobId = await handleGenerate(subject)
      if (jobId) { launched++; setBulkCount(launched) }
      // Small gap so Railway doesn't get hammered simultaneously
      await new Promise(r => setTimeout(r, 600))
    }
    setBulkLaunching(false)
    setError(null)
  }

  // ── Brief template helpers ──────────────────────────────────────────────────
  const handleSaveTemplate = () => {
    const name = prompt('Template name:', form.subject.slice(0, 40) || 'My template')
    if (!name) return
    const tpl = { id: Date.now(), name, form: { ...form, logo: null } }
    const updated = [tpl, ...briefTemplates.slice(0, 9)]
    setBriefTemplates(updated); saveBriefTemplates(updated)
  }

  const handleLoadTemplate = (tpl) => {
    setForm({ ...INITIAL_FORM, ...tpl.form }); setShowTplMenu(false); setStep(1)
  }

  const handleDeleteTemplate = (id) => {
    const updated = briefTemplates.filter(t => t.id !== id)
    setBriefTemplates(updated); saveBriefTemplates(updated)
  }

  const goNext = () => {
    if (step === 1 && !form.subject.trim()) { setError('Enter a brief before continuing.'); return }
    setError(null); setStep(s => s + 1)
  }

  // Find the live job from GenerationContext
  const currentJob = jobs.find(j => j.job_id === currentJobId) || null

  const handleReset = () => {
    setCurrentJobId(null)
    setForm(INITIAL_FORM)
    setStep(1)
    setPreviewScript(null)
    setEditedScript('')
    setError(null)
  }

  const handleTemplateGenerated = (tpl) => {
    const newTpl = {
      id: tpl.id,
      label: tpl.name,
      gradient: tpl.gradient,
      accent: tpl.accent,
      templateGroup: typeDef.templateGroup,
      type: tpl.type,
    }
    const updated = [newTpl, ...customTemplates.filter(t => t.id !== tpl.id)]
    setCustomTemplates(updated)
    localStorage.setItem('cs-custom-templates', JSON.stringify(updated))
    set('template', tpl.id)
    setShowGenTpl(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1080, animation: 'fadein 0.2s ease' }}>
      {showGenTpl && (
        <GenerateTemplateModal
          contentType={form.contentType}
          onGenerated={handleTemplateGenerated}
          onClose={() => setShowGenTpl(false)}
        />
      )}
      {showCanvaTpl && (
        <AddCanvaTemplateModal
          contentType={form.contentType}
          onAdded={(tpl) => { setCanvaTemplates(prev => [tpl, ...prev]); setShowCanvaTpl(false); set('canvaTemplateUrl', tpl.url); set('template', tpl.id) }}
          onClose={() => setShowCanvaTpl(false)}
        />
      )}

      {/* ── Generation in progress / done — replace the form ── */}
      {currentJobId && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ color: 'var(--cs-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
              {typeDef.icon} {typeDef.label}
            </h1>
            <p style={{ color: 'var(--cs-text-sub)', fontSize: 13, margin: 0 }}>
              {form.subject.slice(0, 80)}{form.subject.length > 80 ? '…' : ''}
            </p>
          </div>
          <GenerationPanel
            job={currentJob}
            typeDef={typeDef}
            onReset={handleReset}
          />
        </div>
      )}

      {/* ── Left: Form (hidden while job is running) ── */}
      {!currentJobId && <div style={{ flex: 1, minWidth: 0 }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ color: 'var(--cs-text)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>New Content</h1>
            <p style={{ color: 'var(--cs-text-sub)', fontSize: 13, margin: 0 }}>
              Generate and send to queue — you can start another while this one processes.
            </p>
          </div>
          {/* Brief templates dropdown */}
          <div ref={tplMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowTplMenu(s => !s)} style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
              color: 'var(--cs-text-sub)', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              📋 Saved Briefs {briefTemplates.length > 0 && `(${briefTemplates.length})`}
            </button>
            {showTplMenu && (
              <div style={{
                position: 'absolute', right: 0, top: 38, zIndex: 50, width: 280,
                background: 'var(--cs-surface)', border: '1px solid var(--cs-border)',
                borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden',
                animation: 'fadein 0.12s ease',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--cs-border)', color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Saved Briefs
                </div>
                {briefTemplates.length === 0 ? (
                  <div style={{ padding: '20px 14px', color: 'var(--cs-text-muted)', fontSize: 12, textAlign: 'center' }}>
                    No saved briefs yet.<br />Fill a brief and click "+ Save".
                  </div>
                ) : briefTemplates.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', borderBottom: '1px solid var(--cs-border-sub)', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{CONTENT_TYPES.find(ct => ct.id === t.form?.contentType)?.icon || '📄'}</span>
                    <button onClick={() => handleLoadTemplate(t)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text)', fontSize: 12, textAlign: 'left', padding: 0 }}>
                      {t.name}
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <StepIndicator step={step} total={3} labels={stepLabels} />

        {/* ── STEP 1: Content type + Brief ── */}
        {step === 1 && (
          <div style={{ animation: 'fadein 0.15s ease' }}>

            {/* Content type picker */}
            <Section title="What are you creating?" hint="Each type has its own pipeline and templates">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {CONTENT_TYPES.map(t => (
                  <TypeCard key={t.id} type={t} active={form.contentType === t.id} onClick={() => set('contentType', t.id)} />
                ))}
              </div>
            </Section>

            {/* Brief */}
            <Section title="Brief" hint="Describe the subject, key data points, and angle">
              <textarea
                value={form.subject}
                onChange={e => set('subject', e.target.value)}
                placeholder={
                  form.contentType === 'text_only'
                    ? 'e.g. 5 lessons from 20 years in M&A — share personal stories, include a strong opener and a CTA at the end'
                    : form.contentType === 'carousel'
                    ? 'e.g. Due diligence CRE: 10 key points — one point per slide, data-driven, professional tone'
                    : form.contentType === 'image_post'
                    ? 'e.g. Real estate up 12% in Q1 — bold headline, 1 stat, brand watermark bottom-right'
                    : 'e.g. Real estate investment up 12% in Q1 — 3 reasons why now is the time to act'
                }
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)',
                  borderRadius: 7, padding: '12px 14px',
                  color: 'var(--cs-text)', fontSize: 13, lineHeight: 1.6,
                  resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={handleSaveTemplate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text-muted)', fontSize: 11, padding: 0 }}>
                  + Save as template
                </button>
              </div>
            </Section>

            {/* AI concept generator */}
            <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 10, padding: 20, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: variations.length ? 14 : 0 }}>
                <div>
                  <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    ✨ Generate 5 Concepts
                  </div>
                  <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 2 }}>
                    {selectedVariation ? `"${(selectedVariation.title || selectedVariation.angle || '').slice(0, 50)}"` : 'Let AI propose 5 different angles — pick the best one'}
                  </div>
                </div>
                <button onClick={handleGenerateVariations} disabled={variationsLoading || !form.subject.trim()} style={{
                  padding: '8px 16px', borderRadius: 7, flexShrink: 0,
                  border: selectedVariation ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(0,182,255,0.4)',
                  background: selectedVariation ? 'rgba(34,197,94,0.06)' : 'rgba(0,182,255,0.08)',
                  color: selectedVariation ? '#16a34a' : '#00B6FF',
                  fontSize: 12, fontWeight: 600, cursor: variationsLoading || !form.subject.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {variationsLoading ? <><Spinner /> Thinking…</> : selectedVariation ? '↺ Regenerate' : '✨ Get Ideas'}
                </button>
              </div>
              {variations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {variations.map((v, i) => (
                    <VariationCard
                      key={i} v={v} index={i}
                      active={selectedVariation?.id === v.id || (selectedVariation === v)}
                      onClick={() => handlePickVariation(v)}
                    />
                  ))}
                </div>
              )}

              {/* Bulk launch — only for carousel and text */}
              {variations.length > 0 && (form.contentType === 'carousel' || form.contentType === 'text_only') && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,182,255,0.04)', border: '1px dashed rgba(0,182,255,0.2)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--cs-text)', fontSize: 12, fontWeight: 600 }}>
                      Launch all {variations.length} at once
                    </div>
                    <div style={{ color: 'var(--cs-text-muted)', fontSize: 11, marginTop: 2 }}>
                      {bulkLaunching
                        ? `Launching… ${bulkCount} / ${variations.length} queued`
                        : bulkCount > 0
                        ? `✓ ${bulkCount} jobs queued in Library — check progress there`
                        : 'Generates all 5 ideas in parallel using current settings'}
                    </div>
                  </div>
                  <button
                    onClick={handleGenerateAll}
                    disabled={bulkLaunching || form.platforms.length === 0}
                    style={{
                      padding: '8px 16px', borderRadius: 7, flexShrink: 0,
                      border: '1px solid rgba(0,182,255,0.4)',
                      background: bulkLaunching ? 'rgba(0,182,255,0.04)' : 'rgba(0,182,255,0.1)',
                      color: '#00B6FF', fontSize: 12, fontWeight: 700,
                      cursor: bulkLaunching || form.platforms.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                    {bulkLaunching ? <><Spinner /> Launching…</> : `⚡ Generate All ${variations.length}`}
                  </button>
                </div>
              )}
            </div>

            {/* Brand + Language */}
            <Section title="Brand">
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                {BRANDS.map(b => (
                  <div key={b.id} onClick={() => set('brand', b.id)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderRadius: 8, cursor: 'pointer',
                    border: form.brand === b.id ? `1px solid ${b.color}` : '1px solid var(--cs-border)',
                    background: form.brand === b.id
                      ? `rgba(${b.color === '#C8A96E' ? '200,169,110' : '0,182,255'},0.06)`
                      : 'var(--cs-input-bg)',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg,#08316F,${b.color})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11 }}>{b.initials}</div>
                    <span style={{ color: form.brand === b.id ? 'var(--cs-text)' : 'var(--cs-text-sub)', fontSize: 13, fontWeight: form.brand === b.id ? 600 : 400 }}>{b.name}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {LANGUAGES.map(l => (
                  <Chip key={l} active={form.language === l} onClick={() => set('language', l)}>{l}</Chip>
                ))}
              </div>
            </Section>

            {/* Pipeline preview for selected type */}
            <PipelinePreview typeDef={typeDef} />
          </div>
        )}

        {/* ── STEP 2: Format / Style / Templates ── */}
        {step === 2 && (
          <div style={{ animation: 'fadein 0.15s ease' }}>

            {/* Format — only shown for non-text types */}
            {form.contentType !== 'text_only' && (
              <Section title="Format" hint={typeDef.formats.length === 1 ? `${typeDef.label} only supports ${typeDef.formats[0]}` : 'Aspect ratio for this content'}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {typeDef.formats.map(f => (
                    <Chip key={f} active={form.format === f} onClick={() => set('format', f)}>{f}</Chip>
                  ))}
                </div>
              </Section>
            )}

            {/* Slide count — carousel only */}
            {form.contentType === 'carousel' && (
              <Section title="Number of Slides" hint="How many slides in your carousel?">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {SLIDE_COUNTS.map(n => (
                    <Chip key={n} active={form.slides === n} onClick={() => set('slides', n)}>{n} slides</Chip>
                  ))}
                </div>
              </Section>
            )}

            {/* Duration — video, reel & story */}
            {(form.contentType === 'video' || form.contentType === 'reel' || form.contentType === 'story') && (
              <Section title="Duration" hint="Target length of the video">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(DURATIONS_BY_TYPE[form.contentType] || DURATIONS_BY_TYPE.video).map(d => (
                    <Chip key={d.value} active={form.duration === d.value} onClick={() => set('duration', d.value)}>{d.label}</Chip>
                  ))}
                </div>
              </Section>
            )}

            {/* Templates — not shown for text_only */}
            {typeDef.showTemplate && (
              <Section title="Template" hint={`Templates designed for ${typeDef.label}`}>
                {/* Built-in + AI-generated templates */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10, marginBottom: 10 }}>
                  {templates.map(t => (
                    <TemplateCard key={t.id} tpl={t} active={form.template === t.id} onClick={() => set('template', t.id)} />
                  ))}
                </div>

                {/* Canva templates (filtered by type) */}
                {canvaTemplates.filter(t => {
                  if (form.contentType === 'carousel') return t.type === 'carousel'
                  if (form.contentType === 'image_post') return t.type === 'image'
                  return t.type === 'video'
                }).length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ background: '#00C4CC', borderRadius: 3, padding: '1px 5px', color: '#fff', fontSize: 9 }}>CANVA</span>
                      Your Canva Templates
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
                      {canvaTemplates.filter(t => {
                        if (form.contentType === 'carousel') return t.type === 'carousel'
                        if (form.contentType === 'image_post') return t.type === 'image'
                        return t.type === 'video'
                      }).map(t => (
                        <CanvaTemplateCard
                          key={t.id}
                          tpl={t}
                          active={form.canvaTemplateUrl === t.url}
                          onClick={() => { set('canvaTemplateUrl', t.url); set('template', t.id) }}
                          onDelete={async (id) => {
                            await fetch(`/api/canva-templates/${id}`, { method: 'DELETE' })
                            setCanvaTemplates(prev => prev.filter(c => c.id !== id))
                            if (form.canvaTemplateUrl) set('canvaTemplateUrl', '')
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowGenTpl(true)} style={{
                    flex: 1, padding: '9px', borderRadius: 7, cursor: 'pointer',
                    border: '1px dashed rgba(0,182,255,0.4)', background: 'rgba(0,182,255,0.04)',
                    color: '#00B6FF', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>✨ Generate with AI</button>
                  <button onClick={() => setShowCanvaTpl(true)} style={{
                    flex: 1, padding: '9px', borderRadius: 7, cursor: 'pointer',
                    border: '1px dashed rgba(0,196,204,0.4)', background: 'rgba(0,196,204,0.04)',
                    color: '#00C4CC', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>🎨 Import from Canva</button>
                </div>
              </Section>
            )}

            {/* Writing style */}
            {typeDef.showWritingStyle && (
              <Section title="Writing Style">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {STYLES.map(s => (
                    <Chip key={s.id} active={form.style === s.id} onClick={() => set('style', s.id)}>{s.label}</Chip>
                  ))}
                </div>
              </Section>
            )}

            {/* Audio mode — only for video/reel */}
            {typeDef.showVoiceStyle && (
              <Section title="Audio" hint="Choose voiceover (ElevenLabs) or background music only">
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <Chip active={form.audioMode === 'voice'} onClick={() => set('audioMode', 'voice')}>🎙 Voiceover</Chip>
                  <Chip active={form.audioMode === 'music'} onClick={() => set('audioMode', 'music')}>🎵 Music only</Chip>
                </div>
                {form.audioMode === 'voice' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {VOICE_STYLES.map(v => (
                      <Chip key={v.id} active={form.voiceStyle === v.id} onClick={() => set('voiceStyle', v.id)}>{v.label}</Chip>
                    ))}
                  </div>
                )}
                {form.audioMode === 'music' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {MUSIC_GENRES.map(g => (
                      <Chip key={g.id} active={form.musicGenre === g.id} onClick={() => set('musicGenre', g.id)}>{g.label}</Chip>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* Platforms */}
            <Section title="Platforms" hint={`Recommended for ${typeDef.label}`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {platforms.map(p => (
                  <Chip
                    key={p.id} active={form.platforms.includes(p.id)}
                    onClick={() => togglePlatform(p.id)} color={p.color}
                  >{p.label}</Chip>
                ))}
              </div>
            </Section>

            {/* Logo — only for visual types */}
            {form.contentType !== 'text_only' && (
              <Section title="Logo Override" hint="Optional — replaces brand logo in the template">
                <LogoUpload file={form.logo} onFile={f => set('logo', f)} />
              </Section>
            )}
          </div>
        )}

        {/* ── STEP 3: Review & Generate ── */}
        {step === 3 && (
          <div style={{ animation: 'fadein 0.15s ease' }}>

            {/* ── Carousel: visual slide preview ── */}
            {form.contentType === 'carousel' && (
              <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 10, padding: 20, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: carouselSlides.length ? 16 : 0 }}>
                  <div>
                    <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                      🖼️ Slide Preview
                    </div>
                    <div style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>
                      {carouselSlides.length
                        ? `${carouselSlides.length} slides · click to browse`
                        : 'Preview your slides before rendering'}
                    </div>
                  </div>
                  <button
                    onClick={handlePreviewCarouselSlides}
                    disabled={carouselSlidesLoading}
                    style={{
                      padding: '8px 16px', borderRadius: 7, flexShrink: 0,
                      border: carouselSlides.length ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(0,182,255,0.4)',
                      background: carouselSlides.length ? 'rgba(34,197,94,0.06)' : 'rgba(0,182,255,0.08)',
                      color: carouselSlides.length ? '#16a34a' : '#00B6FF',
                      fontSize: 12, fontWeight: 600,
                      cursor: carouselSlidesLoading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    {carouselSlidesLoading ? <><Spinner /> Generating…</> : carouselSlides.length ? '↺ Regenerate' : '⚡ Preview Slides'}
                  </button>
                </div>
                {carouselSlides.length > 0 && (
                  <CarouselSlidePreview
                    slides={carouselSlides}
                    template={form.template || 'carousel_bold'}
                    activeSlide={carouselActiveSlide}
                    onSlideChange={setCarouselActiveSlide}
                  />
                )}
              </div>
            )}

            {/* Script / copy preview (non-carousel types) */}
            {typeDef.showScriptPreview && form.contentType !== 'carousel' && (
              <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 10, padding: 20, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                      {form.contentType === 'text_only'    ? 'Text Preview'
                       : form.contentType === 'image_post' ? 'Headline & Copy Preview'
                       : 'Script Preview'}
                    </div>
                    <div style={{ color: 'var(--cs-text-muted)', fontSize: 12 }}>
                      Preview and edit before generating — or skip to use AI directly
                    </div>
                  </div>
                  {!previewScript && (
                    <button onClick={handlePreviewScript} disabled={previewLoading} style={{
                      padding: '8px 16px', borderRadius: 7, border: '1px solid rgba(0,182,255,0.4)',
                      background: 'rgba(0,182,255,0.08)', color: '#00B6FF',
                      fontSize: 12, fontWeight: 600, cursor: previewLoading ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                    }}>
                      {previewLoading && <Spinner />}
                      {previewLoading ? 'Generating…' : '⚡ Preview'}
                    </button>
                  )}
                </div>
                {previewScript && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>✓ Preview ready — edit freely</span>
                      <button onClick={() => { setPreviewScript(null); setEditedScript('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cs-text-muted)', fontSize: 11 }}>Reset</button>
                    </div>
                    <textarea
                      value={editedScript}
                      onChange={e => setEditedScript(e.target.value)}
                      rows={form.contentType === 'text_only' ? 18 : 12}
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'var(--cs-input-bg)', border: '1px solid var(--cs-border)',
                        borderRadius: 7, padding: '10px 12px',
                        color: 'var(--cs-text)', fontSize: 11, lineHeight: 1.7,
                        fontFamily: 'ui-monospace,SFMono-Regular,monospace',
                        resize: 'vertical', outline: 'none',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Pipeline preview for this type */}
            <div style={{ marginBottom: 14 }}>
              <PipelinePreview typeDef={typeDef} />
            </div>

            {/* Summary */}
            <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 10, padding: 20, marginBottom: 14 }}>
              <div style={{ color: 'var(--cs-text-sub)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                Summary
              </div>
              <SummaryRow label="Type"      value={`${typeDef.icon} ${typeDef.label}`} />
              <SummaryRow label="Brief"     value={form.subject ? form.subject.slice(0, 60) + (form.subject.length > 60 ? '…' : '') : '—'} />
              <SummaryRow label="Brand"     value={BRANDS.find(b => b.id === form.brand)?.name} />
              <SummaryRow label="Language"  value={form.language} />
              {form.contentType !== 'text_only' && <SummaryRow label="Format"    value={form.format} />}
              {form.contentType === 'carousel' && <SummaryRow label="Slides" value={`${form.slides} slides`} />}
              {(form.contentType === 'video' || form.contentType === 'reel' || form.contentType === 'story') && <SummaryRow label="Duration" value={(DURATIONS_BY_TYPE[form.contentType] || []).find(d => d.value === form.duration)?.label || `${form.duration}s`} />}
              {typeDef.showTemplate && <SummaryRow label="Template"  value={form.canvaTemplateUrl ? `🎨 Canva: ${canvaTemplates.find(t => t.url === form.canvaTemplateUrl)?.name || 'Custom'}` : templates.find(t => t.id === form.template)?.label} />}
              {typeDef.showWritingStyle && <SummaryRow label="Style"     value={STYLES.find(s => s.id === form.style)?.label} />}
              {typeDef.showVoiceStyle   && <SummaryRow label="Audio" value={form.audioMode === 'music' ? `🎵 Music — ${MUSIC_GENRES.find(g => g.id === form.musicGenre)?.label}` : `🎙 Voiceover — ${VOICE_STYLES.find(v => v.id === form.voiceStyle)?.label}`} />}
              <SummaryRow label="Platforms" value={form.platforms.map(id => ALL_PLATFORMS.find(p => p.id === id)?.label).filter(Boolean).join(', ') || '—'} />
              {previewScript && (
                <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(0,182,255,0.06)', border: '1px solid rgba(0,182,255,0.15)' }}>
                  <span style={{ color: '#00B6FF', fontSize: 11 }}>Custom script will be used</span>
                </div>
              )}
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}

            {/* Background generation CTA */}
            <button onClick={handleGenerate} style={{
              width: '100%', padding: '14px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#08316F,#00B6FF)',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(0,182,255,0.3)',
            }}>
              <span>{typeDef.icon}</span>
              Generate {typeDef.label}
            </button>
            <p style={{ color: 'var(--cs-text-muted)', fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
              {typeDef.estimatedTime} · Runs in background — you can keep working
            </p>
          </div>
        )}

        {/* Step nav */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {step > 1 && (
            <button onClick={() => { setError(null); setStep(s => s - 1) }} style={{
              padding: '10px 20px', borderRadius: 7, border: '1px solid var(--cs-border)',
              background: 'var(--cs-surface)', color: 'var(--cs-text-sub)', fontSize: 13, cursor: 'pointer',
            }}>← Back</button>
          )}
          {step < 3 && (
            <button onClick={goNext} style={{
              flex: 1, padding: '10px 20px', borderRadius: 7, border: 'none',
              background: 'linear-gradient(135deg,#08316F,#00B6FF)',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Continue →
            </button>
          )}
        </div>
        {error && step < 3 && (
          <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 12px', color: '#dc2626', fontSize: 12, marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>}

      {/* ── Right: sticky summary panel (only when form is visible) ── */}
      {!currentJobId && <div style={{ width: 240, flexShrink: 0, position: 'sticky', top: 0 }}>
        <div style={{ background: 'var(--cs-surface)', border: '1px solid var(--cs-border)', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>{typeDef.icon}</span>
            <div>
              <div style={{ color: 'var(--cs-text)', fontSize: 13, fontWeight: 700 }}>{typeDef.label}</div>
              <div style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>{typeDef.estimatedTime}</div>
            </div>
          </div>

          <SummaryRow label="Brand"     value={BRANDS.find(b => b.id === form.brand)?.name} />
          <SummaryRow label="Language"  value={form.language} />
          {form.contentType !== 'text_only' && <SummaryRow label="Format" value={form.format} />}
          {typeDef.showTemplate && <SummaryRow label="Template" value={templates.find(t => t.id === form.template)?.label} />}
          <SummaryRow label="Platforms" value={form.platforms.map(id => ALL_PLATFORMS.find(p => p.id === id)?.label).filter(Boolean).join(', ') || '—'} />

          <div style={{ height: 1, background: 'var(--cs-border)', margin: '14px 0' }} />

          {/* Pipeline steps mini */}
          <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Pipeline
          </div>
          {typeDef.steps.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,182,255,0.1)', border: '1px solid rgba(0,182,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#00B6FF', fontWeight: 700, flexShrink: 0 }}>{i+1}</div>
              <span style={{ color: 'var(--cs-text-sub)', fontSize: 11 }}>{s}</span>
            </div>
          ))}

          <div style={{ height: 1, background: 'var(--cs-border)', margin: '14px 0' }} />

          {/* Step dots */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3].map(n => (
              <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: step >= n ? '#00B6FF' : 'var(--cs-border)', transition: 'background 0.2s' }} />
            ))}
          </div>
          <div style={{ color: 'var(--cs-text-muted)', fontSize: 10, marginTop: 5 }}>Step {step} of 3</div>
        </div>
      </div>}
    </div>
  )
}
