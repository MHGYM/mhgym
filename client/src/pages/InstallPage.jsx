import { useState } from 'react'

const GOLD   = '#f5c200'
const GOLD2  = '#e0a800'
const DARK   = '#0a0a0a'
const DARK2  = '#111111'
const DARK3  = '#1a1a1a'
const BORDER = 'rgba(245,194,0,0.18)'

/* ── tiny icon components ──────────────────────────────────────────── */

function IconBox({ children, color = GOLD, bg = 'rgba(245,194,0,0.10)' }) {
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 14, background: bg,
      border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: '1.4rem',
    }}>
      {children}
    </div>
  )
}

function Step({ n, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`,
        color: '#000', fontWeight: 800, fontSize: '0.85rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 10px rgba(245,194,0,0.35)',
      }}>
        {n}
      </div>
      <p style={{ margin: 0, fontSize: '0.95rem', color: '#d0d0d0', lineHeight: 1.55, paddingTop: '0.3rem' }}>
        {text}
      </p>
    </div>
  )
}

function PlatformTab({ id, label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '0.7rem 1rem', border: 'none', cursor: 'pointer',
        borderRadius: 10, fontWeight: active ? 700 : 500, fontSize: '0.9rem',
        background: active
          ? `linear-gradient(135deg, ${GOLD}, ${GOLD2})`
          : 'transparent',
        color: active ? '#000' : '#888',
        transition: 'all 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      {label}
    </button>
  )
}

const ANDROID_STEPS = [
  { n: 1, text: 'Open Chrome op je Android telefoon' },
  { n: 2, text: 'Ga naar app.mhgym.nl' },
  { n: 3, text: 'Tik op de 3 puntjes (⋮) rechtsboven in Chrome' },
  { n: 4, text: 'Kies "Toevoegen aan startscherm"' },
  { n: 5, text: 'Tik op "Toevoegen" — klaar! 🎉' },
]

const IPHONE_STEPS = [
  { n: 1, text: 'Open Safari op je iPhone' },
  { n: 2, text: 'Ga naar app.mhgym.nl' },
  { n: 3, text: 'Tik op het Deel-icoon (□↑) in de menubalk onderaan' },
  { n: 4, text: 'Scroll en kies "Zet op beginscherm"' },
  { n: 5, text: 'Tik op "Voeg toe" — klaar! 🎉' },
]

const FEATURES = [
  {
    emoji: '📅',
    title: 'Lesrooster',
    desc: 'Bekijk het rooster en boek direct je plek in kickboksen, boksen of ladies-only lessen.',
  },
  {
    emoji: '🏆',
    title: 'Community',
    desc: 'Deel je resultaten, like en reageer op posts van andere leden.',
  },
  {
    emoji: '🤖',
    title: 'Maya AI',
    desc: 'Chat 24/7 met Maya — onze AI-assistent die al je vragen over MHGym beantwoordt.',
  },
]

export default function InstallPage() {
  const [platform, setPlatform] = useState('android')
  const steps = platform === 'android' ? ANDROID_STEPS : IPHONE_STEPS

  return (
    <div style={{
      minHeight: '100dvh',
      background: DARK,
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflowX: 'hidden',
    }}>

      {/* ── Radial glow backdrop ── */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(245,194,0,0.12) 0%, transparent 70%)',
      }}/>

      {/* ── Content wrapper ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 480, margin: '0 auto',
        padding: '3rem 1.5rem 4rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2.5rem',
      }}>

        {/* ── Logo block ── */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 88, height: 88, borderRadius: 24, margin: '0 auto 1.2rem',
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 8px 40px rgba(245,194,0,0.40), 0 0 0 1px ${GOLD}30`,
            fontSize: '2.6rem', fontWeight: 900, color: '#000',
            letterSpacing: '-1px', userSelect: 'none',
          }}>
            MH
          </div>
          <div style={{ fontSize: '0.78rem', letterSpacing: '0.25em', color: '#888', textTransform: 'uppercase' }}>
            MH Gym · Soest
          </div>
        </div>

        {/* ── Hero text ── */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: 'clamp(1.65rem, 6vw, 2.2rem)',
            fontWeight: 800, lineHeight: 1.2,
            margin: '0 0 0.85rem',
            letterSpacing: '-0.5px',
          }}>
            Train slimmer met de{' '}
            <span style={{ color: GOLD }}>MHGym App</span>
          </h1>
          <p style={{
            color: '#888', fontSize: '1rem', lineHeight: 1.65,
            margin: 0, maxWidth: 360,
          }}>
            Boek lessen, volg je voortgang en chat met AI&nbsp;assistent Maya — alles in één app, altijd bij de hand.
          </p>
        </div>

        {/* ── Install card ── */}
        <div style={{
          width: '100%',
          background: DARK3,
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>

          {/* Card header */}
          <div style={{
            padding: '1.25rem 1.5rem 0',
          }}>
            <p style={{
              margin: '0 0 1rem', fontWeight: 700, fontSize: '1rem',
              color: '#e0e0e0', textAlign: 'center',
            }}>
              📲 Installeer de App
            </p>

            {/* Platform tabs */}
            <div style={{
              display: 'flex', gap: '0.4rem',
              background: DARK2, borderRadius: 12, padding: '0.3rem',
              marginBottom: '1.5rem',
            }}>
              <PlatformTab id="android" label="Android" icon="🤖"
                active={platform === 'android'} onClick={() => setPlatform('android')} />
              <PlatformTab id="iphone"  label="iPhone"  icon=""
                active={platform === 'iphone'}  onClick={() => setPlatform('iphone')}  />
            </div>
          </div>

          {/* Steps */}
          <div style={{
            padding: '0 1.5rem 1.75rem',
            display: 'flex', flexDirection: 'column', gap: '1.1rem',
          }}>
            {steps.map(s => <Step key={s.n} n={s.n} text={s.text} />)}
          </div>

          {/* Tip banner */}
          <div style={{
            margin: '0 1.5rem 1.75rem',
            background: 'rgba(245,194,0,0.07)',
            border: `1px solid ${BORDER}`,
            borderRadius: 12, padding: '0.85rem 1rem',
            display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>💡</span>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#aaa', lineHeight: 1.5 }}>
              {platform === 'android'
                ? 'Werkt ook in Edge en Samsung Internet — zoek naar "Toevoegen aan startscherm" in het menu.'
                : 'Werkt alleen in Safari. Chrome en andere browsers ondersteunen PWA-installatie op iPhone niet.'
              }
            </p>
          </div>
        </div>

        {/* ── CTA button ── */}
        <a
          href="/"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
            width: '100%', padding: '1rem',
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`,
            color: '#000', fontWeight: 800, fontSize: '1.05rem',
            borderRadius: 16, textDecoration: 'none',
            boxShadow: `0 6px 30px rgba(245,194,0,0.40)`,
            transition: 'transform 0.15s, box-shadow 0.15s',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 40px rgba(245,194,0,0.55)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `0 6px 30px rgba(245,194,0,0.40)` }}
        >
          <span style={{ fontSize: '1.2rem' }}>🚀</span>
          Open de App
        </a>

        {/* ── Divider ── */}
        <div style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '1rem', color: '#333',
        }}>
          <div style={{ flex: 1, height: 1, background: '#222' }} />
          <span style={{ fontSize: '0.78rem', color: '#444', whiteSpace: 'nowrap' }}>alles inbegrepen</span>
          <div style={{ flex: 1, height: 1, background: '#222' }} />
        </div>

        {/* ── Feature cards ── */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {FEATURES.map(({ emoji, title, desc }) => (
            <div key={title} style={{
              display: 'flex', alignItems: 'flex-start', gap: '1rem',
              background: DARK3, border: `1px solid #222`,
              borderRadius: 16, padding: '1.1rem 1.25rem',
              transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = BORDER}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#222'}
            >
              <IconBox>{emoji}</IconBox>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.97rem', marginBottom: '0.3rem', color: '#f0f0f0' }}>
                  {title}
                </div>
                <div style={{ fontSize: '0.83rem', color: '#777', lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: 'center', color: '#444', fontSize: '0.78rem', lineHeight: 1.8 }}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem' }}>MH Gym</div>
          Kickboksen · Boksen · Personal Training<br />
          Rotterdam · <a href="mailto:info@mhgym.nl" style={{ color: '#555', textDecoration: 'none' }}>info@mhgym.nl</a>
        </div>
      </div>
    </div>
  )
}
