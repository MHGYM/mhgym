import { useState, useEffect } from 'react'
import {
  Check, CalendarCheck, CalendarRange, Calendar, ArrowRight, AlertCircle,
  X, User, FileText, CreditCard, Shield,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

// ── Meta ───────────────────────────────────────────────────────────────────

const DURATION_META = {
  12: { Icon: CalendarCheck, label: 'Jaar',      sublabel: 'Jaarlijks gefactureerd', best: true  },
  6:  { Icon: CalendarRange, label: 'Half jaar', sublabel: 'Per half jaar',          best: false },
  1:  { Icon: Calendar,      label: 'Maand',     sublabel: 'Maandelijks opzegbaar',  best: false },
}

const CATEGORY_META = {
  Jeugd:       { icon: '🎒', description: 'Voor leden t/m 17 jaar' },
  Volwassenen: { icon: '💪', description: 'Voor leden vanaf 16 jaar' },
}

function addMonths(date, n) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function fmtDate(d) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysLeft(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24)))
}

// ── PlanCard ───────────────────────────────────────────────────────────────

function PlanCard({ plan, isCurrent, onSelect, disabled }) {
  const dur      = DURATION_META[plan.duration_months] ?? DURATION_META[1]
  const Icon     = dur.Icon
  const features = Array.isArray(plan.features) ? plan.features : []

  return (
    <div
      className={`membership-card${dur.best ? ' featured' : ''}${isCurrent ? ' current' : ''}`}
      style={isCurrent ? { borderColor: 'var(--success)', boxShadow: '0 0 0 1px var(--success), 0 8px 32px rgba(34,197,94,0.15)' } : {}}
    >
      {dur.best && !isCurrent && <span className="featured-badge">Beste waarde</span>}
      {isCurrent             && <span className="featured-badge" style={{ background: 'var(--success)' }}>Huidig plan</span>}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--r)',
          background: isCurrent ? 'var(--success-dim)' : dur.best ? 'var(--accent-dim)' : 'var(--surface-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isCurrent ? 'var(--success)' : dur.best ? 'var(--accent)' : 'var(--text-muted)',
          flexShrink: 0,
        }}>
          <Icon size={20} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{dur.label} abonnement</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dur.sublabel}</div>
        </div>
      </div>

      {/* Price */}
      <div>
        <div className="membership-price">
          <span className="price-amount">€{Number(plan.price_monthly).toFixed(2).replace('.', ',')}</span>
          <span className="price-period">/ maand</span>
        </div>
        {dur.best && (
          <div style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '0.2rem', fontWeight: 600 }}>
            Laagste prijs per maand
          </div>
        )}
      </div>

      {/* Features */}
      <ul className="membership-features" style={{ flex: 1 }}>
        {features.map((f, i) => (
          <li key={i}>
            <Check size={13} className="feature-check" />
            <span style={{ fontSize: '0.85rem' }}>{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        className={`btn btn-full btn-lg ${isCurrent ? 'btn-ghost' : dur.best ? 'btn-primary' : 'btn-outline'}`}
        onClick={() => !isCurrent && !disabled && onSelect(plan)}
        disabled={isCurrent || disabled}
        style={isCurrent ? { cursor: 'default' } : {}}
      >
        {isCurrent
          ? <><Check size={16} /> Huidig plan</>
          : <>Kies dit plan <ArrowRight size={16} /></>
        }
      </button>
    </div>
  )
}

// ── Wizard Modal ───────────────────────────────────────────────────────────

const WIZARD_STEPS = ['Gegevens', 'Voorwaarden', 'Betalen']

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

function SignupWizard({ plan, user, onClose, onSuccess }) {
  const { refreshUser } = useAuth()
  const [step, setStep]       = useState(0)
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [paying,  setPaying]  = useState(false)
  const [agreed, setAgreed]   = useState(false)

  const dur          = DURATION_META[plan.duration_months] ?? DURATION_META[1]
  const startDate    = new Date()
  const contractEnd  = addMonths(startDate, plan.minimum_months || plan.duration_months || 1)
  const monthlyPrice = Number(plan.price_monthly).toFixed(2).replace('.', ',')

  // Personal details form
  const [form, setForm] = useState({
    first_name:  user?.first_name  ?? '',
    last_name:   user?.last_name   ?? '',
    phone:       user?.phone       ?? '',
    birth_date:  user?.birth_date  ?? '',
    address:     user?.address     ?? '',
    postal_code: user?.postal_code ?? '',
    city:        user?.city        ?? '',
  })
  const setF = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  // Step 1 → save profile + advance
  const submitDetails = async (e) => {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      await api.put('/auth/profile', form)
      await refreshUser()
      setStep(1)
    } catch (err) {
      setError(err.response?.data?.error || 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  // Step 3 → start Mollie checkout
  const startPayment = async () => {
    setPaying(true); setError('')
    try {
      const { data } = await api.post('/payments/checkout', {
        membership_id:   plan.id,
        agreed_to_terms: true,
      })
      window.location.href = data.checkout_url
    } catch (err) {
      setError(err.response?.data?.error || 'Betaling starten mislukt. Probeer het opnieuw.')
      setPaying(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, width: '100%' }}>
        {/* Modal header */}
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>
              {plan.category} — {dur.label} abonnement
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              €{monthlyPrice}/mnd · {plan.minimum_months || plan.duration_months} maanden minimum
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <StepBar step={step} />

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* ── STEP 0: Gegevens ─────────────────────────────────────── */}
        {step === 0 && (
          <form onSubmit={submitDetails} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              <User size={14} /> Controleer je gegevens voor het contract
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Voornaam *</label>
                <input className="form-input" value={form.first_name} onChange={setF('first_name')} required />
              </div>
              <div className="form-group">
                <label className="form-label">Achternaam *</label>
                <input className="form-input" value={form.last_name} onChange={setF('last_name')} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">E-mailadres</label>
              <input className="form-input" value={user?.email ?? ''} readOnly style={{ opacity: 0.6 }} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Telefoon *</label>
                <input className="form-input" type="tel" value={form.phone} onChange={setF('phone')}
                  placeholder="+31 6 12345678" required />
              </div>
              <div className="form-group">
                <label className="form-label">Geboortedatum *</label>
                <input className="form-input" type="date" value={form.birth_date} onChange={setF('birth_date')} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Adres *</label>
              <input className="form-input" value={form.address} onChange={setF('address')}
                placeholder="Straatnaam 1" required />
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: '0 0 35%' }}>
                <label className="form-label">Postcode *</label>
                <input className="form-input" value={form.postal_code} onChange={setF('postal_code')}
                  placeholder="1234 AB" required />
              </div>
              <div className="form-group">
                <label className="form-label">Stad *</label>
                <input className="form-input" value={form.city} onChange={setF('city')}
                  placeholder="Amsterdam" required />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button type="button" className="btn btn-ghost btn-full" onClick={onClose}>Annuleren</button>
              <button type="submit" className="btn btn-primary btn-full" disabled={saving}>
                {saving ? <span className="spinner spinner-sm" /> : <>Volgende <ArrowRight size={15} /></>}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 1: Voorwaarden ──────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
              <FileText size={14} /> Contractoverzicht
            </div>

            {/* Contract summary box */}
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)', padding: '1.25rem',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {[
                  ['Abonnement',      `${plan.category} — ${dur.label}`],
                  ['Maandbedrag',     `€${monthlyPrice} / maand`],
                  ['Minimale looptijd', `${plan.minimum_months || plan.duration_months} maanden`],
                  ['Startdatum',      fmtDate(startDate)],
                  ['Opzegbaar vanaf', fmtDate(contractEnd)],
                  ['Opzegtermijn',    '1 maand'],
                  ['Betaalmethode',   'SEPA-incasso (maandelijks)'],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: '5px 0', color: 'var(--text-muted)', fontSize: '0.83rem' }}>{label}</td>
                    <td style={{ padding: '5px 0', fontWeight: 600, textAlign: 'right', fontSize: '0.88rem' }}>{value}</td>
                  </tr>
                ))}
              </table>
            </div>

            {/* How it works */}
            <div style={{
              background: 'rgba(245,194,0,0.06)', border: '1px solid rgba(245,194,0,0.2)',
              borderRadius: 'var(--r)', padding: '0.9rem 1rem', fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.6,
            }}>
              <strong style={{ color: 'var(--accent)' }}>Hoe werkt het?</strong><br />
              Je betaalt nu de eerste maand via iDEAL. Daarna wordt elke maand automatisch €{monthlyPrice} via
              SEPA-incasso afgeschreven. Je kunt opzeggen via de app zodra je minimale contractperiode voorbij is.
              Er geldt altijd een opzegtermijn van 1 maand.
            </div>

            {/* Checkbox */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer',
              padding: '0.85rem 1rem', borderRadius: 'var(--r)',
              background: agreed ? 'var(--success-dim)' : 'var(--surface-2)',
              border: `1px solid ${agreed ? 'var(--success)' : 'var(--border)'}`,
              transition: 'all 0.18s',
            }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ marginTop: '2px', accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }}
              />
              <span style={{ fontSize: '0.83rem', lineHeight: 1.55, color: 'var(--text-2)' }}>
                Ik ga akkoord met de minimale contractduur van{' '}
                <strong>{plan.minimum_months || plan.duration_months} maanden</strong> en
                een opzegtermijn van <strong>1 maand</strong>. Ik begrijp dat mijn abonnement
                automatisch per maand wordt verlengd tot opzegging.
              </span>
            </label>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button className="btn btn-ghost btn-full" onClick={() => setStep(0)}>Terug</button>
              <button
                className="btn btn-primary btn-full"
                disabled={!agreed}
                onClick={() => setStep(2)}
              >
                Akkoord & door <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Betalen ──────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
              <CreditCard size={14} /> Eerste betaling via iDEAL
            </div>

            {/* Payment summary */}
            <div style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)', padding: '1.25rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nu te betalen</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)' }}>€{monthlyPrice}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Eerste maand {plan.category} — {dur.label} abonnement
              </div>
              <div className="divider" style={{ margin: '0.75rem 0' }} />
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Daarna: €{monthlyPrice}/mnd via SEPA-incasso · opzegbaar vanaf {fmtDate(contractEnd)}
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem',
              color: 'var(--text-muted)', padding: '0.6rem 0',
            }}>
              <Shield size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
              Veilige betaling via Mollie · Gegevens worden versleuteld verstuurd
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost btn-full" onClick={() => setStep(1)} disabled={paying}>Terug</button>
              <button className="btn btn-primary btn-full btn-lg" onClick={startPayment} disabled={paying}>
                {paying
                  ? <><span className="spinner spinner-sm" /> Doorsturen…</>
                  : <><CreditCard size={16} /> Betaal nu €{monthlyPrice}</>
                }
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              Je wordt doorgestuurd naar de beveiligde betaalomgeving van Mollie.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function MembershipsPage() {
  const { user, membership, refreshUser } = useAuth()
  const [plans, setPlans]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [activeTab, setActiveTab]   = useState('Volwassenen')
  const [wizard, setWizard]         = useState(null)   // selected plan or null

  // Return from Mollie with ?betaling=geslaagd
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('betaling') === 'geslaagd') {
      setSuccess('Betaling ontvangen! Je lidmaatschap wordt binnen enkele seconden geactiveerd.')
      window.history.replaceState({}, '', '/memberships')
      setTimeout(() => refreshUser(), 3000)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const [plansRes] = await Promise.all([api.get('/memberships'), refreshUser()])
        setPlans(plansRes.data.memberships)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (membership?.category) setActiveTab(membership.category)
  }, [membership])

  const handleCancel = async () => {
    // Check contract_end before showing confirm
    const days = daysLeft(membership?.contract_end)
    if (days > 0) {
      setError(
        `Je kunt pas opzeggen vanaf ${fmtDate(membership.contract_end)} (nog ${days} dagen). ` +
        `De minimale contractduur is ${membership.minimum_months} maanden.`
      )
      return
    }
    if (!confirm('Weet je zeker dat je je lidmaatschap wilt opzeggen? Er geldt een opzegtermijn van 1 maand.')) return
    setCancelling(true); setError('')
    try {
      const { data } = await api.put('/memberships/mine/cancel')
      setSuccess(data.message)
      await refreshUser()
    } catch (e) {
      setError(e.response?.data?.error || 'Opzeggen mislukt.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <div className="page loading-center"><div className="spinner" /></div>

  const categories   = ['Jeugd', 'Volwassenen']
  const visiblePlans = plans.filter((p) => (p.category || 'Volwassenen') === activeTab)
  const currentPlanId = membership?.membership_id
  const hasActiveMembership = membership && (membership.status === 'active' || membership.status === 'cancelling')

  // Contract info for banner
  const contractDaysLeft = daysLeft(membership?.contract_end)
  const isCancelling     = membership?.status === 'cancelling'

  return (
    <div className="page">
      <div className="page-header">
        <h1>Lidmaatschap</h1>
        <p>Kies het abonnement dat bij jou past</p>
      </div>

      {/* Alerts */}
      {error   && <div className="alert alert-error"   style={{ marginBottom: '1.5rem' }}><AlertCircle size={16} />{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}><Check size={16} />{success}</div>}

      {/* Current plan banner */}
      {hasActiveMembership && (
        <div className="current-membership-banner" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <div style={{ fontSize: '2rem' }}>{CATEGORY_META[membership.category]?.icon ?? '💪'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                {isCancelling
                  ? <span className="badge badge-warning">Opgezegd</span>
                  : <span className="badge badge-success">Actief</span>
                }
                <span style={{ fontWeight: 700 }}>
                  {membership.category} — {membership.membership_name || membership.name}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                €{Number(membership.price_monthly).toFixed(2)}/mnd
                {' · '}{membership.bookings_used_this_month ?? 0} lessen geboekt deze maand
                {isCancelling && membership.cancels_at && (
                  <> · <span style={{ color: 'var(--warning)' }}>Toegang tot {fmtDate(membership.cancels_at)}</span></>
                )}
                {!isCancelling && contractDaysLeft > 0 && (
                  <> · <span style={{ color: 'var(--text-muted)' }}>Contract loopt nog {contractDaysLeft} dag{contractDaysLeft !== 1 ? 'en' : ''}</span></>
                )}
              </div>
            </div>
          </div>

          {!isCancelling && (
            <button
              className={`btn btn-sm ${contractDaysLeft > 0 ? 'btn-ghost' : 'btn-danger'}`}
              onClick={handleCancel}
              disabled={cancelling}
              title={contractDaysLeft > 0 ? `Opzegbaar vanaf ${fmtDate(membership.contract_end)}` : 'Lidmaatschap opzeggen'}
            >
              {cancelling
                ? <span className="spinner spinner-sm" />
                : <><X size={14} /> {contractDaysLeft > 0 ? `Opzeggen (${fmtDate(membership.contract_end)})` : 'Opzeggen'}</>
              }
            </button>
          )}
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        {categories.map((cat) => {
          const meta       = CATEGORY_META[cat]
          const hasCurrent = currentPlanId && plans.find((p) => p.id === currentPlanId && p.category === cat)
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.875rem 1.5rem',
                background: activeTab === cat ? 'var(--accent-dim)' : 'var(--surface)',
                border: `1px solid ${activeTab === cat ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--r-lg)',
                cursor: 'pointer', transition: 'all 0.18s',
                flex: 1, textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>{meta.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: activeTab === cat ? 'var(--accent)' : 'var(--text)', fontSize: '0.95rem' }}>
                  {cat}{cat === 'Volwassenen' ? ' 16+' : ''}
                  {hasCurrent && <span className="badge badge-success" style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>Huidig</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{meta.description}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Price cards */}
      <div className="membership-grid">
        {visiblePlans
          .sort((a, b) => b.duration_months - a.duration_months)
          .map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={plan.id === currentPlanId && hasActiveMembership}
              onSelect={(p) => { setError(''); setWizard(p) }}
              disabled={hasActiveMembership}
            />
          ))}
      </div>

      {/* Trust strip */}
      <div style={{
        marginTop: '3rem', padding: '1.25rem 2rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {[
          { icon: '🔒', text: 'Veilig betalen via Mollie' },
          { icon: '📅', text: 'Maand abonnement: 1 maand opzegtermijn' },
          { icon: '⚡', text: 'Direct actief na betaling' },
          { icon: '🏋️', text: 'Toegang tot alle lessen' },
        ].map(({ icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>{icon}</span>{text}
          </div>
        ))}
      </div>

      {/* Signup wizard */}
      {wizard && (
        <SignupWizard
          plan={wizard}
          user={user}
          onClose={() => setWizard(null)}
          onSuccess={() => { setWizard(null); refreshUser() }}
        />
      )}
    </div>
  )
}
