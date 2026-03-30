/**
 * Shared carousel slide preview components.
 * Used in both NewContent (step-3 preview) and Library (modal preview).
 */

export const CAROUSEL_THEMES = {
  carousel_bold: {
    bg: 'linear-gradient(135deg,#08316F 0%,#0a3d8a 100%)',
    ctaBg: 'linear-gradient(145deg,#08316F 0%,#0d4db5 55%,#082a62 100%)',
    accent: '#C8A96E', sky: '#00B6FF', text: '#fff',
    textMuted: 'rgba(255,255,255,0.65)',
    statBg: 'rgba(0,182,255,0.1)', statBorder: '#00B6FF',
    tagColor: '#00B6FF', numBg: 'rgba(0,182,255,0.12)',
  },
  carousel_clean: {
    bg: 'linear-gradient(135deg,#F4F7FB 0%,#e8edf5 100%)',
    ctaBg: 'linear-gradient(135deg,#08316F,#0a4ba0)',
    accent: '#C8A96E', sky: '#00B6FF', text: '#08316F',
    textMuted: 'rgba(8,49,111,0.65)',
    statBg: 'rgba(8,49,111,0.08)', statBorder: '#08316F',
    tagColor: '#00B6FF', numBg: 'rgba(0,182,255,0.1)',
  },
  carousel_minimal: {
    bg: 'linear-gradient(135deg,#0C0C0E 0%,#141417 100%)',
    ctaBg: 'radial-gradient(ellipse at center,#141f2e 0%,#0C0C0E 70%)',
    accent: '#C8A96E', sky: '#00B6FF', text: '#fff',
    textMuted: 'rgba(255,255,255,0.5)',
    statBg: 'rgba(200,169,110,0.08)', statBorder: '#C8A96E',
    tagColor: '#00B6FF', numBg: 'rgba(255,255,255,0.06)',
  },
  carousel_data: {
    bg: 'linear-gradient(135deg,#031520 0%,#061e2e 100%)',
    ctaBg: 'linear-gradient(135deg,#031520,#041a2a)',
    accent: '#00E5A0', sky: '#00B6FF', text: '#fff',
    textMuted: 'rgba(255,255,255,0.5)',
    statBg: 'rgba(0,182,255,0.08)', statBorder: '#00B6FF',
    tagColor: '#00E5A0', numBg: 'rgba(0,182,255,0.1)',
  },
}

function getTheme(template) {
  return CAROUSEL_THEMES[template] || CAROUSEL_THEMES.carousel_bold
}

/** Single slide card — compact (thumbnail strip) or full-size */
export function CarouselSlideCard({ slide, template, compact }) {
  const t = getTheme(template)

  const base = {
    background: slide.type === 'cta' ? t.ctaBg : t.bg,
    borderRadius: compact ? 6 : 12,
    padding: compact ? '10px 9px 9px' : '30px 28px 26px',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? 3 : 12,
    minHeight: compact ? 88 : 260,
    width: compact ? 78 : '100%',
    flexShrink: 0,
    cursor: compact ? 'pointer' : 'default',
    boxSizing: 'border-box',
  }

  const titleStyle = {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: compact ? 13 : 42,
    fontWeight: 700,
    color: t.text,
    lineHeight: 1.08,
  }

  const bodyStyle = { fontSize: compact ? 8 : 14, color: t.textMuted, lineHeight: 1.55 }

  return (
    <div style={base}>
      {/* Top accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: compact ? 2 : 5,
        background: `linear-gradient(90deg,${t.sky},${t.accent})`,
      }} />

      {/* Geometry hint (full-size only) */}
      {!compact && (
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.05, pointerEvents: 'none' }}
          viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg">
          <circle cx="200" cy="130" r="140" fill="none" stroke={t.sky} strokeWidth="1"/>
          <circle cx="200" cy="130" r="90"  fill="none" stroke={t.accent} strokeWidth="0.7"/>
          <rect x="40" y="20" width="320" height="220" fill="none" stroke={t.sky} strokeWidth="0.8" transform="rotate(12 200 130)"/>
          <line x1="0" y1="130" x2="400" y2="130" stroke={t.sky} strokeWidth="0.5"/>
          <line x1="200" y1="0" x2="200" y2="260" stroke={t.sky} strokeWidth="0.5"/>
        </svg>
      )}

      {slide.type === 'title' && (
        <>
          <div style={{ fontSize: compact ? 6 : 9, fontWeight: 700, letterSpacing: '0.35em', textTransform: 'uppercase', color: t.accent, marginTop: compact ? 3 : 8, position: 'relative' }}>
            {(slide.brand || 'Rodschinson').slice(0, compact ? 12 : 999)}
          </div>
          <div style={{ ...titleStyle, position: 'relative' }}>
            {(slide.headline || '').slice(0, compact ? 28 : 999)}{compact && slide.headline?.length > 28 ? '…' : ''}
          </div>
          {!compact && (
            <>
              <div style={{ width: 80, height: 3, background: `linear-gradient(90deg,${t.sky},${t.accent})`, borderRadius: 2 }} />
              {slide.subheadline && <div style={bodyStyle}>{slide.subheadline}</div>}
            </>
          )}
          <div style={{ marginTop: 'auto', fontSize: compact ? 7 : 11, color: t.textMuted, position: 'relative' }}>
            {slide.cta || 'Swipe →'}
          </div>
        </>
      )}

      {slide.type === 'content' && (
        <>
          {/* Slide number tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 8, marginTop: compact ? 3 : 6, position: 'relative' }}>
            <div style={{
              width: compact ? 16 : 28, height: compact ? 16 : 28,
              borderRadius: compact ? 4 : 7,
              background: t.numBg,
              border: `1px solid ${t.sky}44`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: compact ? 6 : 10, fontWeight: 700, color: t.sky,
              flexShrink: 0,
            }}>{String(slide.index || 1).padStart(2, '0')}</div>
            {!compact && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.35em', textTransform: 'uppercase', color: t.tagColor }}>Key Point</div>}
          </div>
          <div style={{ ...titleStyle, position: 'relative' }}>
            {(slide.headline || '').slice(0, compact ? 26 : 999)}{compact && slide.headline?.length > 26 ? '…' : ''}
          </div>
          {!compact && slide.body && <div style={bodyStyle}>{slide.body}</div>}
          {!compact && slide.stat && (
            <div style={{
              display: 'flex', alignItems: 'stretch', background: 'rgba(0,0,0,0.2)', borderRadius: 8, overflow: 'hidden',
            }}>
              {(() => {
                const m = String(slide.stat).match(/^([0-9.,]+\s*[%€KMB+]*)\s*[-–—:·]\s*(.*)$/)
                return m ? (
                  <>
                    <div style={{ padding: '12px 16px', background: `${t.statBorder}18`, borderRight: `1px solid ${t.statBorder}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 80 }}>
                      <span style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 36, fontWeight: 700, color: t.sky, lineHeight: 1 }}>{m[1]}</span>
                    </div>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>{m[2]}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '12px 16px', borderLeft: `3px solid ${t.statBorder}`, fontSize: 12, fontWeight: 600, color: t.sky }}>{slide.stat}</div>
                )
              })()}
            </div>
          )}
          {compact && slide.stat && (
            <div style={{ fontSize: 7, fontWeight: 700, color: t.sky, position: 'relative' }}>
              {slide.stat.slice(0, 22)}{slide.stat.length > 22 ? '…' : ''}
            </div>
          )}
        </>
      )}

      {slide.type === 'cta' && (
        <>
          <div style={{ fontSize: compact ? 6 : 9, fontWeight: 700, letterSpacing: '0.35em', textTransform: 'uppercase', color: t.accent, marginTop: compact ? 3 : 8, position: 'relative' }}>
            {compact ? 'CTA' : 'Let\'s connect'}
          </div>
          <div style={{ ...titleStyle, fontSize: compact ? 11 : 34, position: 'relative' }}>
            {(slide.headline || '').slice(0, compact ? 22 : 999)}{compact && slide.headline?.length > 22 ? '…' : ''}
          </div>
          {!compact && (
            <>
              {slide.body && <div style={{ ...bodyStyle, textAlign: 'left' }}>{slide.body}</div>}
              {slide.hashtags?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {slide.hashtags.map((h, i) => (
                    <span key={i} style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: 'rgba(0,182,255,0.1)', border: `1px solid rgba(0,182,255,0.25)`,
                      color: t.sky,
                    }}>{h}</span>
                  ))}
                </div>
              )}
            </>
          )}
          {compact && slide.hashtags?.length > 0 && (
            <div style={{ fontSize: 7, color: t.sky, position: 'relative' }}>{slide.hashtags[0]}</div>
          )}
        </>
      )}

      {/* Slide number watermark */}
      <div style={{ position: 'absolute', bottom: compact ? 4 : 12, right: compact ? 5 : 14, fontSize: compact ? 6 : 10, color: 'rgba(255,255,255,0.18)', fontWeight: 600, letterSpacing: '0.12em' }}>
        {String(slide.index || 1).padStart(2, '0')}
      </div>
    </div>
  )
}

/** Full interactive carousel preview with strip + arrows */
export function CarouselSlidePreview({ slides, template, activeSlide, onSlideChange }) {
  const slide = slides[activeSlide] || slides[0]
  if (!slides.length || !slide) return null

  return (
    <div style={{ animation: 'fadein 0.2s ease' }}>
      {/* Main slide */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <CarouselSlideCard slide={slide} template={template} compact={false} />
        <button onClick={() => onSlideChange(Math.max(0, activeSlide - 1))} disabled={activeSlide === 0} style={{
          position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)',
          width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--cs-border)',
          background: 'var(--cs-surface)', cursor: activeSlide === 0 ? 'not-allowed' : 'pointer',
          color: activeSlide === 0 ? 'var(--cs-text-muted)' : 'var(--cs-text)', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>‹</button>
        <button onClick={() => onSlideChange(Math.min(slides.length - 1, activeSlide + 1))} disabled={activeSlide === slides.length - 1} style={{
          position: 'absolute', right: -14, top: '50%', transform: 'translateY(-50%)',
          width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--cs-border)',
          background: 'var(--cs-surface)', cursor: activeSlide === slides.length - 1 ? 'not-allowed' : 'pointer',
          color: activeSlide === slides.length - 1 ? 'var(--cs-text-muted)' : 'var(--cs-text)', fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>›</button>
      </div>

      {/* Thumbnail strip */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, paddingTop: 2 }}>
        {slides.map((s, i) => (
          <div key={i} onClick={() => onSlideChange(i)} style={{
            outline: i === activeSlide ? '2px solid #00B6FF' : '2px solid transparent',
            borderRadius: 7, overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
            transition: 'all 0.15s',
            transform: i === activeSlide ? 'scale(1.06)' : 'scale(1)',
          }}>
            <CarouselSlideCard slide={s} template={template} compact />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>
          Slide {activeSlide + 1} of {slides.length} · <strong style={{ color: 'var(--cs-text-sub)' }}>{slide.type}</strong>
        </span>
        <span style={{ color: 'var(--cs-text-muted)', fontSize: 11 }}>
          {template?.replace('carousel_', '') || 'bold'}
        </span>
      </div>
    </div>
  )
}
