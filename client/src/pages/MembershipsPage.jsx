import { useState, useEffect } from 'react'
import { Check, CalendarCheck, CalendarRange, Calendar, Crown, Users, ArrowRight, AlertCircle, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

// Icon and label per duration
const DURATION_META = {
  12: { Icon: CalendarCheck,  label: 'Jaar',      sublabel: 'Jaarlijks gefactureerd', best: true  },
  6:  { Icon: CalendarRange,  label: 'Half jaar', sublabel: 'Per half jaar',           best: false },
  1:  { Icon: Calendar,       label: 'Maand',     sublabel: 'Maandelijks opzegbaar',   best: false },
}

const CATEGORY_META = {
  Jeugd:       { icon: '🎒', description: 'Voor leden t/m 17 jaar' },
  Volwassenen: { icon: '💪', description: 'Voor leden vanaf 16 jaar' },
}

function PlanCard({ plan, isCurrent, onCheckout, checkingOut }) {
  const dur   = DURATION_META[plan.duration_months] ?? DURATION_META[1]
  const Icon  = dur.Icon
  const features = Array.isArray(plan.features) ? plan.features : []

  return (
    <div
      className={`membership-card${dur.best ? ' featured' : ''}${isCurrent ? ' current' : ''}`}
      style={isCurrent ? { borderColor: 'var(--success)', boxShadow: '0 0 0 1px var(--success), 0 8px 32px rgba(34,197,94,0.15)' } : {}}
    >
      {dur.best && !isCurrent && <span className="featured-badge">Beste waarde</span>}
      {isCurrent         && <span className="featured-badge" style={{ background: 'var(--success)' }}>Huidig plan</span>}

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
        onClick={() => !isCurrent && onCheckout(plan.id)}
        disabled={isCurrent || checkingOut === plan.id}
        style={isCurrent ? { cursor: 'default' } : {}}
      >
        {checkingOut === plan.id
          ? <span className="spinner spinner-sm" />
          : isCurrent
            ? <><Check size={16} /> Huidig plan</>
            : <>Kies dit plan <ArrowRight size={16} /></>
        }
      </button>
    </div>
  )
}

export default function MembershipsPage() {
  const { membership, refreshUser } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading]     = useState(true)
  const [checkingOut, setCheckingOut] = useState(null)
  const [cancelling, setCancelling]   = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('Volwassenen')

  // Toon succesmelding als Mollie terugredirectt met ?betaling=geslaagd
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('betaling') === 'geslaagd') {
      setSuccess('Betaling ontvangen! Je lidmaatschap wordt binnen enkele seconden geactiveerd.')
      window.history.replaceState({}, '', '/memberships')
      // Herlaad na 3s om membership status te vernieuwen
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

  // Auto-select tab of current membership
  useEffect(() => {
    if (membership?.category) setActiveTab(membership.category)
  }, [membership])

  const handleCheckout = async (membershipId) => {
    setCheckingOut(membershipId); setError('')
    try {
      const { data } = await api.post('/payments/checkout', { membership_id: membershipId })
      window.location.href = data.checkout_url
    } catch (e) {
      setError(e.response?.data?.error || 'Betaling starten mislukt. Probeer het opnieuw.')
      setCheckingOut(null)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Weet je zeker dat je je lidmaatschap wilt opzeggen?')) return
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

  const categories = ['Jeugd', 'Volwassenen']
  const visiblePlans = plans.filter((p) => (p.category || 'Volwassenen') === activeTab)
  const currentPlanId = membership?.membership_id

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
      {membership?.status === 'active' && (
        <div className="current-membership-banner" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '2rem' }}>{CATEGORY_META[membership.category]?.icon ?? '💪'}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
                <span className="badge badge-success">Actief</span>
                <span style={{ fontWeight: 700 }}>
                  {membership.category} — {membership.membership_name || membership.name}
                </span>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                €{Number(membership.price_monthly).toFixed(2)}/mnd
                {membership.end_date && ` · Geldig tot ${new Date(membership.end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                {' '}· {membership.bookings_used_this_month ?? 0} lessen geboekt deze maand
              </p>
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? <span className="spinner spinner-sm" /> : <><X size={14} /> Opzeggen</>}
          </button>
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat]
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
              isCurrent={plan.id === currentPlanId && membership?.status === 'active'}
              onCheckout={handleCheckout}
              checkingOut={checkingOut}
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
          { icon: '📅', text: 'Maand abonnement direct opzegbaar' },
          { icon: '⚡', text: 'Direct actief na betaling' },
          { icon: '🏋️', text: 'Onbeperkt toegang tot alle lessen' },
        ].map(({ icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>{icon}</span>{text}
          </div>
        ))}
      </div>
    </div>
  )
}
