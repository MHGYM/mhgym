import { useState } from 'react'
import { Check, X, AlertCircle, ArrowRight, CreditCard, Shield } from 'lucide-react'
import api from '../api'
import { formatEuro } from '../utils/format'

// Geëxtraheerd uit PersonalTrainingPage.jsx (ongewijzigd gedrag) zodat zowel de
// PT-pagina als het Dashboard exact dezelfde winkelwagen-/checkout-flow
// gebruiken — geen nieuwe betaallogica, geen dubbele implementatie.

export const LOSSE_TERMS = [
  'Gekochte lessen zijn 12 maanden geldig na aankoopdatum.',
  'Geen restitutie mogelijk na aankoop.',
  'Wijzigen of annuleren van een sessie kan tot 24 uur van tevoren.',
  'Bij annulering binnen 24 uur vervalt de les.',
  'Extra persoon meenemen: +€15 per sessie, vooraf melden via app.',
  'Lessen zijn persoonlijk en niet overdraagbaar.',
]

export const ABO_TERMS = [
  'Minimum looptijd is 6 maanden.',
  'Maandelijks gefactureerd via automatische incasso (SEPA).',
  'Facturering per kalendermaand, geen restitutie bij gemiste lessen.',
  'Na 6 maanden maandelijks opzegbaar met 1 maand opzegtermijn.',
  'Wijzigen of annuleren van een sessie kan tot 24 uur van tevoren.',
  'Bij annulering binnen 24 uur vervalt de sessie.',
  'Extra persoon meenemen: +€15 per sessie, vooraf melden via app.',
  'Bij langdurige ziekte of blessure: overleg mogelijk, geen automatische restitutie.',
  'Sessies zijn persoonlijk en niet overdraagbaar.',
  'MH Gym behoudt het recht om een sessie te verzetten bij overmacht.',
  'Door akkoord te gaan ga je een bindende overeenkomst aan voor minimaal 6 maanden.',
]

export const PT_VOORWAARDEN = [
  'Maandelijks opzegbaar',
  'Vooruitbetaling per maand',
  'Upgraden kan altijd',
  'Minimaal 24 uur vooraf annuleren',
  'Minder dan 24 uur vooraf annuleren = les wordt gerekend',
  'Gemiste lessen worden niet automatisch meegenomen naar de volgende maand',
  'Een eventuele 5e trainingsweek wordt als extra training verwerkt volgens het gekozen abonnement/tarief',
]

function addMonths(date, n) {
  const d = new Date(date); d.setMonth(d.getMonth() + n); return d
}

const WIZARD_STEPS = ['Keuze', 'Voorwaarden', 'Betalen']

function StepBar({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.75rem' }}>
      {WIZARD_STEPS.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < WIZARD_STEPS.length - 1 ? 1 : 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: i < step ? 'var(--success)' : i === step ? 'var(--accent)' : 'var(--surface-3)',
              color: i < step ? '#fff' : i === step ? '#000' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.25s', flexShrink: 0,
            }}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <div style={{ fontSize: '0.68rem', color: i === step ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {label}
            </div>
          </div>
          {i < WIZARD_STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 2, marginBottom: '1.1rem', marginLeft: '0.4rem', marginRight: '0.4rem',
              background: i < step ? 'var(--success)' : 'var(--surface-3)',
              transition: 'background 0.25s',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function PurchaseWizard({ type, item, onClose }) {
  const [step,   setStep]   = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error,  setError]  = useState('')

  const isPackage = type === 'package'
  // Nieuwe Basic/Standard/Premium-abonnementen (met tier) zijn maandelijks opzegbaar —
  // de oude, niet meer getoonde 1×/2×/3×-plannen (zonder tier) behouden hun bestaande 6-maanden voorwaarden.
  const isNewTierSub = !isPackage && !!item.tier
  const terms = isPackage ? LOSSE_TERMS : (isNewTierSub ? PT_VOORWAARDEN : ABO_TERMS)

  const contractEnd = (!isPackage && !isNewTierSub) ? addMonths(new Date(), 6) : null

  const startPayment = async () => {
    setPaying(true); setError('')
    try {
      const endpoint = isPackage ? '/pt/checkout/package' : '/pt/checkout/subscription'
      const payload  = isPackage
        ? { package_id: item.id, agreed_to_terms: true }
        : { plan_id: item.id, agreed_to_terms: true }
      const { data } = await api.post(endpoint, payload)
      window.location.href = data.checkout_url
    } catch (err) {
      setError(err.response?.data?.error || 'Betaling starten mislukt.')
      setPaying(false)
    }
  }

  const priceStr = isPackage
    ? `€${item.total_price.toFixed(2).replace('.', ',')}`
    : `${formatEuro(item.price_monthly)} / maand`

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, width: '100%' }}>
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>
              {isPackage ? `PT Pakket — ${item.label}` : `PT Abonnement — ${item.tier ? item.tier + ' · ' : ''}${item.label}`}
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{priceStr}</div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <StepBar step={step} />

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={15} />{error}</div>}

        {/* ── STEP 0: Overzicht ──────────────────────────────────────────── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '1.25rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {isPackage ? [
                  ['Pakket',         item.label],
                  ['Lessen',         `${item.lessons} lessen`],
                  ['Prijs per les',  `€${item.price_per_lesson}/les`],
                  ['Totaalprijs',    `€${item.total_price.toFixed(2).replace('.', ',')}`],
                  ['Geldig',         '12 maanden na aankoop'],
                  ['Betaalmethode',  'iDEAL (eenmalig)'],
                ] : isNewTierSub ? [
                  ['Abonnement',     `${item.tier} — ${item.label}`],
                  ['Prijs per les',  `€${item.price_per_lesson}/sessie`],
                  ['Maandbedrag',    `${formatEuro(item.price_monthly)}/mnd`],
                  ['Opzegtermijn',   'Maandelijks opzegbaar'],
                  ['Startdatum',     new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })],
                  ['Betaalmethode',  'iDEAL + SEPA maandelijks'],
                ] : [
                  ['Abonnement',     item.label],
                  ['Prijs per les',  `€${item.price_per_lesson}/sessie`],
                  ['Maandbedrag',    `€${item.price_monthly}/mnd`],
                  ['Minimum looptijd', '6 maanden'],
                  ['Startdatum',     new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })],
                  ['Opzegbaar vanaf', contractEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })],
                  ['Betaalmethode',  'iDEAL + SEPA maandelijks'],
                ].map(([l, v]) => (
                  <tr key={l}>
                    <td style={{ padding: '5px 0', color: 'var(--text-muted)', fontSize: '0.83rem' }}>{l}</td>
                    <td style={{ padding: '5px 0', fontWeight: 600, textAlign: 'right', fontSize: '0.88rem' }}>{v}</td>
                  </tr>
                ))}
              </table>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost btn-full" onClick={onClose}>Annuleren</button>
              <button className="btn btn-primary btn-full" onClick={() => setStep(1)}>
                Verder <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 1: Voorwaarden ────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)', padding: '1.25rem', maxHeight: 280, overflowY: 'auto',
            }}>
              <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                {isPackage ? 'Voorwaarden losse lessen' : 'Voorwaarden PT abonnement'}
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {terms.map((t, i) => (
                  <li key={i} style={{ display: 'flex', gap: '0.6rem', fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.55 }}>
                    <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '0.1rem' }}>■</span>{t}
                  </li>
                ))}
              </ul>
              <a href="mailto:info@mhgym.nl?subject=Algemene%20voorwaarden"
                 style={{ display: 'inline-block', marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--accent)' }}>
                Bekijk algemene voorwaarden →
              </a>
            </div>
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer',
              padding: '0.85rem 1rem', borderRadius: 'var(--r)',
              background: agreed ? 'var(--success-dim)' : 'var(--surface-2)',
              border: `1px solid ${agreed ? 'var(--success)' : 'var(--border)'}`,
              transition: 'all 0.18s',
            }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                style={{ marginTop: '2px', accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: '0.83rem', lineHeight: 1.55, color: 'var(--text-2)' }}>
                {isPackage
                  ? 'Ik ga akkoord met de voorwaarden voor losse PT-lessen en begrijp dat er geen restitutie mogelijk is na aankoop.'
                  : isNewTierSub
                    ? 'Ik ga akkoord met de voorwaarden. Dit abonnement is maandelijks opzegbaar — geen minimale looptijd.'
                    : 'Ik ga akkoord met de voorwaarden en ga een bindende overeenkomst aan voor minimaal 6 maanden met een opzegtermijn van 1 maand.'
                }
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost btn-full" onClick={() => setStep(0)}>Terug</button>
              <button className="btn btn-primary btn-full" disabled={!agreed} onClick={() => setStep(2)}>
                Akkoord & door <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Betalen ────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nu te betalen</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>
                  {isPackage ? `€${item.total_price.toFixed(2).replace('.', ',')}` : formatEuro(item.price_monthly)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {isPackage ? `${item.label} — geldig 12 maanden` : `Eerste maand — daarna ${formatEuro(item.price_monthly)}/mnd via SEPA`}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <Shield size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
              Veilige betaling via Mollie
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost btn-full" onClick={() => setStep(1)} disabled={paying}>Terug</button>
              <button className="btn btn-primary btn-full btn-lg" onClick={startPayment} disabled={paying}>
                {paying ? <><span className="spinner spinner-sm" /> Doorsturen…</> : <><CreditCard size={16} /> Betaal nu</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
