import { useState, useEffect, useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import api from '../api'
import { formatEuro } from '../utils/format'
import PurchaseWizard from './PtPurchaseWizard'

// Contractduur — matcht het officiële MH Personal Coaching inschrijfformulier:
// prijs/les en maandbedrag hangen af van de gekozen looptijd × frequentie.
// Prijzen komen altijd uit PT_PLANS via /api/pt/plans, nooit hier hardcoded.
const DURATIONS = [
  { months: 1,  label: '1 maand' },
  { months: 6,  label: '6 maanden' },
  { months: 12, label: '12 maanden' },
]
const FREQS = [
  { freq: 1, label: '1× per week' },
  { freq: 2, label: '2× per week' },
  { freq: 3, label: '3× per week' },
]

/**
 * Herbruikbare PT-pricing-sectie: contractduur + frequentiekeuze met
 * dynamische prijzen uit de backend. Gebruikt op zowel de PT-pagina als het
 * Dashboard — exact dezelfde component, dezelfde data, dezelfde winkelwagen-
 * /checkout-flow (PurchaseWizard), geen duplicatie.
 */
export default function PtPricingCards({ hasSubscription = false }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMonths, setSelectedMonths] = useState(12)
  const [wizardItem, setWizardItem] = useState(null)

  useEffect(() => {
    api.get('/pt/plans')
      .then(r => setPlans(r.data.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }, [])

  const uniquePlans = useMemo(
    () => plans.filter((p, i, a) => a.findIndex(x => x.id === p.id) === i),
    [plans],
  )

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Laden…</p>

  const durationLabel = DURATIONS.find(d => d.months === selectedMonths)?.label ?? `${selectedMonths} maanden`

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
          Contractduur
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '4px', gap: '4px' }}>
          {DURATIONS.map(({ months, label }) => (
            <button
              key={months}
              onClick={() => setSelectedMonths(months)}
              style={{
                padding: '0.6rem 1.1rem', borderRadius: 'var(--r)', border: 'none',
                background: selectedMonths === months ? 'var(--accent)' : 'transparent',
                color: selectedMonths === months ? '#000' : 'var(--text-2)',
                fontWeight: selectedMonths === months ? 800 : 500,
                fontSize: '0.88rem', cursor: 'pointer', transition: 'var(--t)', whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {FREQS.map(({ freq, label }) => {
          const plan = uniquePlans.find((p) => p.tier === durationLabel && p.freq_per_week === freq)
          const isBestValue = selectedMonths === 12
          return (
            <div key={freq} style={{
              background: isBestValue
                ? 'linear-gradient(160deg, rgba(245,194,0,0.10) 0%, var(--surface) 55%)'
                : 'var(--surface)',
              border: `1.5px solid ${isBestValue ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--r-xl)', padding: '1.75rem', position: 'relative',
              boxShadow: isBestValue ? '0 0 0 1px var(--accent), 0 12px 40px rgba(245,194,0,0.15)' : 'none',
              display: 'flex', flexDirection: 'column',
            }}>
              {isBestValue && <span style={{
                position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--accent)', color: '#000', fontSize: '0.7rem', fontWeight: 800,
                padding: '4px 14px', borderRadius: '20px', letterSpacing: '0.5px', whiteSpace: 'nowrap',
              }}>LAAGSTE PRIJS PER LES</span>}

              <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {label}
              </div>

              {plan ? (
                <>
                  <div style={{ marginBottom: '0.1rem' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>{formatEuro(plan.price_monthly)}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> / maand</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                    €{plan.price_per_lesson}/les · {plan.lessons_per_month ?? plan.freq_per_week * 4} sessies/mnd · min. {durationLabel}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Prijs niet beschikbaar voor deze combinatie.
                </div>
              )}

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.5rem', flex: 1, fontSize: '0.83rem', color: 'var(--text-2)' }}>
                <li>1-op-1 personal training</li>
                <li>Persoonlijke begeleiding tijdens de training</li>
                <li>Training gericht op jouw doel</li>
                <li>Vaste trainingsdagen en tijden in overleg</li>
              </ul>

              {hasSubscription ? (
                <button className="btn btn-ghost btn-full" disabled>Al actief abonnement</button>
              ) : (
                <button
                  className={`btn btn-full ${isBestValue ? 'btn-primary' : 'btn-outline'}`}
                  disabled={!plan}
                  onClick={() => plan && setWizardItem(plan)}
                >
                  Kies plan <ArrowRight size={15} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {wizardItem && (
        <PurchaseWizard type="subscription" item={wizardItem} onClose={() => setWizardItem(null)} />
      )}
    </div>
  )
}
