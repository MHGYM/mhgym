import { useState, useEffect } from 'react'
import { Check, Zap, Crown, Star, ArrowRight, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

const TIER_ICONS = { Basic: Zap, Premium: Star, VIP: Crown }
const TIER_FEATURED = { Basic: false, Premium: true, VIP: false }

export default function MembershipsPage() {
  const { membership, refreshUser } = useAuth()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes] = await Promise.all([
          api.get('/memberships'),
          refreshUser(),
        ])
        setPlans(plansRes.data.memberships)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleCheckout = async (membershipId) => {
    setCheckingOut(membershipId)
    setError('')
    try {
      const { data } = await api.post('/payments/checkout', { membership_id: membershipId })
      // Redirect to Mollie checkout
      window.location.href = data.checkout_url
    } catch (e) {
      setError(e.response?.data?.error || 'Betaling starten mislukt. Probeer het opnieuw.')
      setCheckingOut(null)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Weet je zeker dat je je lidmaatschap wilt opzeggen?')) return
    setCancelling(true)
    setError('')
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

  if (loading) {
    return <div className="page loading-center"><div className="spinner" /></div>
  }

  const currentPlanId = membership?.membership_id

  return (
    <div className="page">
      <div className="page-header">
        <h1>Lidmaatschap</h1>
        <p>Kies het abonnement dat bij jou past</p>
      </div>

      {error   && <div className="alert alert-error"   style={{ marginBottom: '1.5rem' }}><AlertCircle size={16} />{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}><Check size={16} />{success}</div>}

      {/* Current plan banner */}
      {membership && membership.status === 'active' && (
        <div className="current-membership-banner" style={{ marginBottom: '2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span className="badge badge-success">Actief</span>
              <span style={{ fontWeight: 700 }}>{membership.membership_name || membership.name} lidmaatschap</span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Geldig tot{' '}
              {membership.end_date
                ? new Date(membership.end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'onbepaald'}
              &nbsp;·&nbsp;
              {membership.bookings_used_this_month ?? 0} lessen gebruikt deze maand
              {membership.max_bookings_per_month > 0 && ` van de ${membership.max_bookings_per_month}`}
            </p>
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? <span className="spinner spinner-sm" /> : 'Opzeggen'}
          </button>
        </div>
      )}

      {/* Plans */}
      <div className="membership-grid">
        {plans.map((plan) => {
          const Icon = TIER_ICONS[plan.name] ?? Zap
          const isFeatured = TIER_FEATURED[plan.name]
          const isCurrent  = plan.id === currentPlanId && membership?.status === 'active'

          return (
            <div
              key={plan.id}
              className={`membership-card${isFeatured ? ' featured' : ''}${isCurrent ? ' current' : ''}`}
            >
              {isFeatured && <span className="featured-badge">Meest populair</span>}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--r)',
                  background: isCurrent ? 'var(--success-dim)' : 'var(--accent-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isCurrent ? 'var(--success)' : 'var(--accent)',
                }}>
                  <Icon size={18} />
                </div>
                <span className="membership-name">{plan.name}</span>
                {isCurrent && <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Huidig</span>}
              </div>

              <div>
                <div className="membership-price">
                  <span className="price-amount">€{Number(plan.price_monthly).toFixed(2).replace('.', ',')}</span>
                  <span className="price-period">/ maand</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  {plan.max_bookings_per_month === -1
                    ? 'Onbeperkt lessen per maand'
                    : `${plan.max_bookings_per_month} lessen per maand`}
                </p>
              </div>

              {plan.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {plan.description}
                </p>
              )}

              <ul className="membership-features">
                {(Array.isArray(plan.features) ? plan.features : []).map((f, i) => (
                  <li key={i}>
                    <Check size={14} className="feature-check" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                className={`btn btn-full btn-lg ${isCurrent ? 'btn-ghost' : isFeatured ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => !isCurrent && handleCheckout(plan.id)}
                disabled={isCurrent || checkingOut === plan.id}
              >
                {checkingOut === plan.id
                  ? <span className="spinner spinner-sm" />
                  : isCurrent
                    ? '✓ Huidig plan'
                    : currentPlanId
                      ? <>Upgraden naar {plan.name} <ArrowRight size={16} /></>
                      : <>Beginnen met {plan.name} <ArrowRight size={16} /></>
                }
              </button>
            </div>
          )
        })}
      </div>

      {/* Trust badges */}
      <div style={{
        marginTop: '3rem', padding: '1.5rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem', textAlign: 'center',
      }}>
        {[
          { icon: '🔒', text: 'Veilig betalen via Mollie' },
          { icon: '📅', text: 'Maandelijks opzegbaar' },
          { icon: '⚡', text: 'Direct actief na betaling' },
        ].map(({ icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <span>{icon}</span> {text}
          </div>
        ))}
      </div>
    </div>
  )
}
