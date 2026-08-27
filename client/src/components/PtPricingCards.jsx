import { useState, useEffect, useMemo } from 'react'
import { Check, X, ArrowRight } from 'lucide-react'
import api from '../api'
import { formatEuro } from '../utils/format'
import PurchaseWizard from './PtPurchaseWizard'

// PT-tiers — uitsluitend presentatie/features (dezelfde tekst als altijd op de
// PT-pagina gebruikt). Prijzen komen altijd uit PT_PLANS via /api/pt/plans,
// nooit hier hardcoded.
const TIER_INFO = [
  {
    tier: 'Basic', medal: '🥉',
    features: [
      'Personal Training',
      'Persoonlijke begeleiding tijdens de training',
      'Training gericht op jouw doel',
    ],
  },
  {
    tier: 'Standard', medal: '🥈',
    features: [
      'Alles van Basic',
      'Lichaamsmetingen',
      'Extra begeleiding',
      'Water/shake waar afgesproken',
      'Persoonlijke voortgang',
    ],
  },
  {
    tier: 'Premium', medal: '🥇',
    features: [
      'Alles van Standard',
      'Persoonlijk voedingsschema',
      'Persoonlijk trainingsprogramma',
      'Persoonlijke oefeningen',
      'Uitgebreide voortgang/meting',
      'Consults',
      'Online trainingen/video’s',
      'Persoonlijke coaching/contact',
      'MH Gym shop/gear voordelen en kortingen waar beschikbaar',
    ],
  },
]

// Bouwt een vergelijkingslijst uit de bestaande TIER_INFO-teksten: de
// "Alles van X"-regel is geen losse feature maar betekent "erft alles van de
// vorige tier" — die wordt hier weggefilterd en vervangen door daadwerkelijke
// overname van de features van de lagere tier(s). Er wordt geen nieuwe
// benefit-tekst verzonnen; alles komt letterlijk uit TIER_INFO hierboven.
function buildComparisonRows() {
  const ownFeatures = TIER_INFO.map(t => t.features.filter(f => !f.startsWith('Alles van ')))
  const rows = []
  const effectiveByTier = {}
  let cumulative = []
  TIER_INFO.forEach((t, i) => {
    cumulative = [...cumulative, ...ownFeatures[i]]
    effectiveByTier[t.tier] = new Set(cumulative)
    ownFeatures[i].forEach(f => { if (!rows.includes(f)) rows.push(f) })
  })
  return { rows, effectiveByTier }
}
const { rows: COMPARISON_ROWS, effectiveByTier: TIER_EFFECTIVE_FEATURES } = buildComparisonRows()

/**
 * Herbruikbare PT-pricing-sectie: frequentiekeuze + Basic/Standard/Premium-
 * kaarten met dynamische prijzen uit de backend. Gebruikt op zowel de PT-
 * pagina als het Dashboard — exact dezelfde component, dezelfde data,
 * dezelfde winkelwagen-/checkout-flow (PurchaseWizard), geen duplicatie.
 */
export default function PtPricingCards({ hasSubscription = false }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFreq, setSelectedFreq] = useState(1)
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

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
          Trainingsfrequentie
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '4px', gap: '4px' }}>
          {[1, 2, 3].map((freq) => (
            <button
              key={freq}
              onClick={() => setSelectedFreq(freq)}
              style={{
                padding: '0.6rem 1.1rem', borderRadius: 'var(--r)', border: 'none',
                background: selectedFreq === freq ? 'var(--accent)' : 'transparent',
                color: selectedFreq === freq ? '#000' : 'var(--text-2)',
                fontWeight: selectedFreq === freq ? 800 : 500,
                fontSize: '0.88rem', cursor: 'pointer', transition: 'var(--t)', whiteSpace: 'nowrap',
              }}
            >
              {freq}× per week
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        {TIER_INFO.map(({ tier, medal }) => {
          const plan = uniquePlans.find((p) => p.tier === tier && p.freq_per_week === selectedFreq)
          const isPremium = tier === 'Premium'
          const effective = TIER_EFFECTIVE_FEATURES[tier]
          return (
            <div key={tier} style={{
              background: isPremium
                ? 'linear-gradient(160deg, rgba(245,194,0,0.10) 0%, var(--surface) 55%)'
                : 'var(--surface)',
              border: `1.5px solid ${isPremium ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--r-xl)', padding: '1.75rem', position: 'relative',
              boxShadow: isPremium ? '0 0 0 1px var(--accent), 0 12px 40px rgba(245,194,0,0.15)' : 'none',
              display: 'flex', flexDirection: 'column',
            }}>
              {isPremium && <span style={{
                position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)',
                background: 'var(--accent)', color: '#000', fontSize: '0.7rem', fontWeight: 800,
                padding: '4px 14px', borderRadius: '20px', letterSpacing: '0.5px', whiteSpace: 'nowrap',
              }}>MEEST COMPLEET</span>}

              <div style={{ fontSize: '1.8rem', marginBottom: '0.3rem' }}>{medal}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {tier}
              </div>

              {plan ? (
                <>
                  <div style={{ marginBottom: '0.1rem' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>{formatEuro(plan.price_monthly)}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> / maand</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                    Maandelijks opzegbaar · {plan.lessons_per_month ?? plan.freq_per_week * 4} sessies/mnd
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Prijs niet beschikbaar voor deze combinatie.
                </div>
              )}

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.5rem', flex: 1 }}>
                {COMPARISON_ROWS.map((f) => {
                  const included = effective.has(f)
                  return (
                    <li key={f} style={{
                      display: 'flex', gap: '0.6rem', fontSize: '0.83rem', lineHeight: 1.4,
                      color: included ? 'var(--text-2)' : 'var(--text-muted)',
                      opacity: included ? 1 : 0.55,
                    }}>
                      {included
                        ? <Check size={15} style={{ color: isPremium ? 'var(--accent)' : 'var(--success)', flexShrink: 0, marginTop: '1px' }} />
                        : <X size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '1px' }} />}
                      {f}
                    </li>
                  )
                })}
              </ul>

              {hasSubscription ? (
                <button className="btn btn-ghost btn-full" disabled>Al actief abonnement</button>
              ) : (
                <button
                  className={`btn btn-full ${isPremium ? 'btn-primary' : 'btn-outline'}`}
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
