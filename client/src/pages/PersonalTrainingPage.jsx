import { useState, useEffect, useCallback } from 'react'
import {
  User, Clock, Calendar, ChevronLeft, ChevronRight,
  Check, AlertCircle, ArrowRight, X, CreditCard, Shield, Dumbbell,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

// ── Constanten ─────────────────────────────────────────────────────────────
const LOSSE_TERMS = [
  'Gekochte lessen zijn 12 maanden geldig na aankoopdatum.',
  'Geen restitutie mogelijk na aankoop.',
  'Wijzigen of annuleren van een sessie kan tot 24 uur van tevoren.',
  'Bij annulering binnen 24 uur vervalt de les.',
  'Extra persoon meenemen: +€15 per sessie, vooraf melden via app.',
  'Lessen zijn persoonlijk en niet overdraagbaar.',
]

const ABO_TERMS = [
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

function fmtDate(d) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
function addMonths(date, n) {
  const d = new Date(date); d.setMonth(d.getMonth() + n); return d
}

// ── Purchase Wizard ────────────────────────────────────────────────────────
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

function PurchaseWizard({ type, item, onClose }) {
  const [step,   setStep]   = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error,  setError]  = useState('')

  const isPackage = type === 'package'
  const terms     = isPackage ? LOSSE_TERMS : ABO_TERMS

  const contractEnd = !isPackage ? addMonths(new Date(), 6) : null

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
    : `€${item.price_monthly.toFixed(2).replace('.', ',')} / maand`

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520, width: '100%' }}>
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.2rem' }}>
              {isPackage ? `PT Pakket — ${item.label}` : `PT Abonnement — ${item.label}`}
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
                  {isPackage ? `€${item.total_price.toFixed(2).replace('.', ',')}` : `€${item.price_monthly.toFixed(2).replace('.', ',')}`}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {isPackage ? `${item.label} — geldig 12 maanden` : `Eerste maand — daarna €${item.price_monthly}/mnd via SEPA`}
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

// ── Booking Modal ──────────────────────────────────────────────────────────
function BookingModal({ slot, balance, onClose, onBooked }) {
  const [purchaseId,    setPurchaseId]    = useState(balance.purchases[0]?.id ?? null)
  const [subscriptionId, setSubscriptionId] = useState(balance.subscription?.id ?? null)
  const [useType,       setUseType]       = useState(balance.subscription ? 'sub' : 'pkg')
  const [extraPerson,   setExtraPerson]   = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  const book = async () => {
    setSaving(true); setError('')
    try {
      await api.post('/pt/bookings', {
        slot_id:         slot.id,
        purchase_id:     useType === 'pkg' ? purchaseId : null,
        subscription_id: useType === 'sub' ? subscriptionId : null,
        extra_person:    extraPerson,
      })
      onBooked()
    } catch (err) {
      setError(err.response?.data?.error || 'Boeken mislukt.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440, width: '100%' }}>
        <div className="modal-header" style={{ marginBottom: '1.25rem' }}>
          <h3>PT Sessie boeken</h3>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><AlertCircle size={15} />{error}</div>}

        <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{fmtDate(slot.date_time)}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {fmtTime(slot.date_time)} · 60 min · {slot.trainer}
          </div>
        </div>

        {/* Kies pakket of abonnement */}
        {balance.purchases.length > 0 && balance.subscription && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {['pkg', 'sub'].map((t) => (
              <button key={t} onClick={() => setUseType(t)} style={{
                flex: 1, padding: '0.6rem', borderRadius: 'var(--r)', cursor: 'pointer',
                background: useType === t ? 'var(--accent-dim)' : 'var(--surface-2)',
                border: `1px solid ${useType === t ? 'var(--accent)' : 'var(--border)'}`,
                color: useType === t ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.82rem',
              }}>
                {t === 'pkg' ? '📦 Pakket' : '🔄 Abonnement'}
              </button>
            ))}
          </div>
        )}

        {useType === 'pkg' && balance.purchases.length > 0 && (
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Selecteer pakket</label>
            <select className="form-input" value={purchaseId ?? ''} onChange={(e) => setPurchaseId(parseInt(e.target.value))}>
              {balance.purchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lessons_remaining} les{p.lessons_remaining !== 1 ? 'sen' : ''} resterend (verloopt {new Date(p.expires_at).toLocaleDateString('nl-NL')})
                </option>
              ))}
            </select>
          </div>
        )}

        <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', cursor: 'pointer', padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 'var(--r)', marginBottom: '1.25rem' }}>
          <input type="checkbox" checked={extraPerson} onChange={(e) => setExtraPerson(e.target.checked)} style={{ accentColor: 'var(--accent)', width: 16, height: 16 }} />
          <span style={{ fontSize: '0.83rem', color: 'var(--text-2)' }}>Extra persoon meenemen <span style={{ color: 'var(--text-muted)' }}>(+€15 per sessie, betaling via gym)</span></span>
        </label>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-ghost btn-full" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary btn-full" onClick={book} disabled={saving}>
            {saving ? <span className="spinner spinner-sm" /> : 'Boeken (wacht op bevestiging)'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Slot week navigator ────────────────────────────────────────────────────
function getWeekStart(offset = 0) {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

function SlotsView({ balance, onRefresh }) {
  const [slots,      setSlots]      = useState([])
  const [myBookings, setMyBookings] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [booking,    setBooking]    = useState(null)  // slot being booked
  const [cancelling, setCancelling] = useState(null)
  const [flash,      setFlash]      = useState(null)

  const weekStart = getWeekStart(weekOffset)
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [slotsRes, bookRes] = await Promise.all([
        api.get('/pt/slots', { params: { from: weekStart.toISOString(), to: weekEnd.toISOString() } }),
        api.get('/pt/bookings/mine'),
      ])
      setSlots(slotsRes.data.slots)
      setMyBookings(bookRes.data.bookings)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [weekOffset])

  useEffect(() => { load() }, [load])

  const showFlash = (msg, type = 'success') => { setFlash({ msg, type }); setTimeout(() => setFlash(null), 4000) }

  const handleCancelBooking = async (bookingId) => {
    if (!confirm('Boeking annuleren? Bij annulering >24h voor de sessie krijg je de les terug.')) return
    setCancelling(bookingId)
    try {
      await api.put(`/pt/bookings/${bookingId}/cancel`)
      showFlash('Boeking geannuleerd. Les teruggestort.')
      load(); onRefresh()
    } catch (err) { showFlash(err.response?.data?.error || 'Annuleren mislukt.', 'error') }
    finally { setCancelling(null) }
  }

  const bookedSlotIds = new Set(myBookings.filter((b) => b.status !== 'cancelled' && b.status !== 'declined').map((b) => b.slot_id))
  const getMyBooking  = (slotId) => myBookings.find((b) => b.slot_id === slotId && b.status !== 'cancelled' && b.status !== 'declined')

  const byDay = slots.reduce((acc, s) => {
    const day = new Date(s.date_time).toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(s); return acc
  }, {})

  const weekLabel = `${weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const hasBalance = balance && (balance.total_remaining > 0 || balance.subscription?.status === 'active')

  return (
    <div>
      {flash && <div className={`alert alert-${flash.type}`} style={{ marginBottom: '1rem' }}>{flash.msg}</div>}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0.25rem' }}>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o - 1)} style={{ width: 28, height: 28 }}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.5rem', color: 'var(--text-2)', minWidth: 180, textAlign: 'center' }}>{weekLabel}</span>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o + 1)} style={{ width: 28, height: 28 }}><ChevronRight size={16} /></button>
        </div>
        {weekOffset !== 0 && <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>Huidige week</button>}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : Object.keys(byDay).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>Geen slots beschikbaar</h3>
          <p>Er zijn deze week geen PT-slots gepland. Bekijk een andere week.</p>
        </div>
      ) : (
        Object.entries(byDay).sort(([a], [b]) => new Date(a) - new Date(b)).map(([day, daySlots]) => (
          <div key={day} style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '0.75rem', color: 'var(--text-2)', textTransform: 'capitalize' }}>
              {new Date(day).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {daySlots.map((slot) => {
                const myBooking = getMyBooking(slot.id)
                const isBooked  = bookedSlotIds.has(slot.id)
                const isPast    = new Date(slot.date_time) < new Date()

                const statusColor = myBooking?.status === 'confirmed' ? 'var(--success)'
                  : myBooking?.status === 'pending' ? 'var(--warning)' : 'var(--text-muted)'
                const statusLabel = myBooking?.status === 'confirmed' ? '✓ Bevestigd'
                  : myBooking?.status === 'pending' ? '⏳ Wachten op bevestiging' : ''

                return (
                  <div key={slot.id} style={{
                    background: 'var(--surface)', border: `1px solid ${isBooked ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
                    borderRadius: 'var(--r-lg)', padding: '1rem',
                    opacity: isPast ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>{fmtTime(slot.date_time)}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>60 min</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      <User size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />{slot.trainer}
                    </div>
                    {isBooked ? (
                      <div>
                        <div style={{ fontSize: '0.78rem', color: statusColor, fontWeight: 600, marginBottom: '0.5rem' }}>{statusLabel}</div>
                        {myBooking && (
                          <button
                            className="btn btn-ghost btn-full btn-sm"
                            onClick={() => handleCancelBooking(myBooking.id)}
                            disabled={cancelling === myBooking.id || isPast}
                          >
                            {cancelling === myBooking.id ? <span className="spinner spinner-sm" /> : 'Annuleer'}
                          </button>
                        )}
                      </div>
                    ) : isPast ? (
                      <button className="btn btn-ghost btn-full btn-sm" disabled>Verlopen</button>
                    ) : !hasBalance ? (
                      <button className="btn btn-outline btn-full btn-sm" onClick={() => document.getElementById('pt-pricing')?.scrollIntoView({ behavior: 'smooth' })}>
                        Koop eerst een pakket
                      </button>
                    ) : (
                      <button className="btn btn-primary btn-full btn-sm" onClick={() => setBooking(slot)}>
                        Boeken
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {booking && (
        <BookingModal
          slot={booking}
          balance={balance}
          onClose={() => setBooking(null)}
          onBooked={() => { setBooking(null); load(); onRefresh(); showFlash('Sessie geboekt! Wacht op bevestiging van de trainer. 💪') }}
        />
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function PersonalTrainingPage() {
  const { user } = useAuth()
  const [packages,  setPackages]  = useState([])
  const [plans,     setPlans]     = useState([])
  const [balance,   setBalance]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('lessen')
  const [wizard,    setWizard]    = useState(null)  // { type, item }
  const [success,   setSuccess]   = useState('')

  const loadBalance = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await api.get('/pt/balance')
      setBalance(data)
    } catch (e) { console.error(e) }
  }, [user])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('betaling') === 'geslaagd') {
      setSuccess('Betaling ontvangen! Je lessen zijn klaar voor gebruik.')
      window.history.replaceState({}, '', '/personal-training')
      setTimeout(() => loadBalance(), 3000)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const [pkgRes, planRes] = await Promise.all([api.get('/pt/packages'), api.get('/pt/plans')])
        setPackages(pkgRes.data.packages)
        setPlans(planRes.data.plans)
        await loadBalance()
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <div className="page loading-center"><div className="spinner" /></div>

  const hasPurchases     = balance?.purchases?.length > 0
  const hasSubscription  = balance?.subscription?.status === 'active'
  const totalRemaining   = balance?.total_remaining ?? 0

  return (
    <div className="page">
      <div className="page-header">
        <h1>Personal Training</h1>
        <p>1-op-1 coaching met trainer Mohammed · Zaal 1</p>
      </div>

      {success && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}><Check size={16} />{success}</div>}

      {/* Balance banner */}
      {(hasPurchases || hasSubscription) && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(245,194,0,0.08), rgba(245,194,0,0.03))',
          border: '1px solid rgba(245,194,0,0.2)', borderRadius: 'var(--r-lg)',
          padding: '1.25rem 1.75rem', marginBottom: '2rem',
          display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
        }}>
          <Dumbbell size={28} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            {hasPurchases && (
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                <span style={{ color: 'var(--accent)', fontSize: '1.4rem' }}>{totalRemaining}</span>
                {' '}les{totalRemaining !== 1 ? 'sen' : ''} beschikbaar
              </div>
            )}
            {hasSubscription && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.83rem' }}>
                PT Abonnement {balance.subscription.freq_per_week}× per week — actief
              </div>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('boeken')}>
            Sessie boeken
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {[
          { id: 'lessen',   label: '📦 Losse lessen'  },
          { id: 'abo',      label: '🔄 PT Abonnement' },
          { id: 'boeken',   label: '📅 Sessie boeken'  },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding: '0.65rem 1.25rem', borderRadius: '0', border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: '0.9rem',
            fontWeight: activeTab === id ? 700 : 400,
            color: activeTab === id ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: `2px solid ${activeTab === id ? 'var(--accent)' : 'transparent'}`,
            transition: 'all 0.18s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Losse lessen ──────────────────────────────────────────────────── */}
      {activeTab === 'lessen' && (
        <div id="pt-pricing">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <h2>Lossen lessen pakketten</h2>
            <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>Geldig 12 maanden</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {packages.map((pkg) => {
              const isBest = pkg.lessons === 10
              return (
                <div key={pkg.id} style={{
                  background: 'var(--surface)', border: `1px solid ${isBest ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-lg)', padding: '1.5rem', position: 'relative',
                  boxShadow: isBest ? '0 0 0 1px var(--accent), 0 8px 32px rgba(245,194,0,0.1)' : 'none',
                }}>
                  {isBest && <span style={{
                    position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--accent)', color: '#000', fontSize: '0.72rem', fontWeight: 800,
                    padding: '3px 12px', borderRadius: '20px', letterSpacing: '0.5px',
                  }}>POPULAIRSTE KEUZE</span>}
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>{pkg.label}</div>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>€{pkg.price_per_lesson}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> /les</span>
                  </div>
                  {pkg.lessons > 1 && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      Totaal €{pkg.total_price.toLocaleString('nl-NL')}
                    </div>
                  )}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      ✓ 60 minuten per sessie<br />
                      ✓ 1-op-1 met Mohammed<br />
                      ✓ 12 maanden geldig
                    </div>
                  </div>
                  <button
                    className={`btn btn-full ${isBest ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setWizard({ type: 'package', item: pkg })}
                  >
                    Kies dit pakket <ArrowRight size={15} />
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1rem 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-2)' }}>Extra persoon: </strong>+€15 per sessie — vooraf melden via de app.
          </div>
        </div>
      )}

      {/* ── PT Abonnement ─────────────────────────────────────────────────── */}
      {activeTab === 'abo' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <h2>PT Abonnement</h2>
            <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>6 maanden minimum</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
            Vaste coaching op jouw ritme. Automatische SEPA-incasso per maand.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {plans.map((plan) => {
              const isBest = plan.freq_per_week === 2
              return (
                <div key={plan.id} style={{
                  background: 'var(--surface)', border: `1px solid ${isBest ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-lg)', padding: '1.5rem', position: 'relative',
                  boxShadow: isBest ? '0 0 0 1px var(--accent), 0 8px 32px rgba(245,194,0,0.1)' : 'none',
                }}>
                  {isBest && <span style={{
                    position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--accent)', color: '#000', fontSize: '0.72rem', fontWeight: 800,
                    padding: '3px 12px', borderRadius: '20px',
                  }}>AANBEVOLEN</span>}
                  <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>{plan.label}</div>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>€{plan.price_per_lesson}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> /sessie</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    €{plan.price_monthly}/mnd · {plan.freq_per_week * 4} sessies/mnd
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      ✓ {plan.freq_per_week}× per week<br />
                      ✓ 60 min per sessie<br />
                      ✓ Na 6 mnd opzegbaar
                    </div>
                  </div>
                  {hasSubscription ? (
                    <button className="btn btn-ghost btn-full" disabled>Al actief</button>
                  ) : (
                    <button
                      className={`btn btn-full ${isBest ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setWizard({ type: 'subscription', item: plan })}
                    >
                      Start abonnement <ArrowRight size={15} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1rem 1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-2)' }}>Extra persoon: </strong>+€15 per sessie — vooraf melden via de app.
          </div>
        </div>
      )}

      {/* ── Sessie boeken ──────────────────────────────────────────────────── */}
      {activeTab === 'boeken' && (
        <div>
          <h2 style={{ marginBottom: '1.5rem' }}>Beschikbare PT-slots</h2>
          {!hasPurchases && !hasSubscription ? (
            <div className="empty-state">
              <div className="empty-state-icon">🥊</div>
              <h3>Eerst een pakket kopen</h3>
              <p>Koop een losse lessen pakket of sluit een PT-abonnement af om sessies te boeken.</p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setActiveTab('lessen')}>Losse lessen</button>
                <button className="btn btn-outline" onClick={() => setActiveTab('abo')}>PT Abonnement</button>
              </div>
            </div>
          ) : (
            <SlotsView balance={balance} onRefresh={loadBalance} />
          )}
        </div>
      )}

      {/* Purchase wizard */}
      {wizard && (
        <PurchaseWizard
          type={wizard.type}
          item={wizard.item}
          onClose={() => setWizard(null)}
        />
      )}

      {/* Trust strip */}
      <div style={{
        marginTop: '3rem', padding: '1.25rem 2rem',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center',
      }}>
        {[
          { icon: '💪', text: '1-op-1 coaching met Mohammed' },
          { icon: '🔒', text: 'Veilig betalen via Mollie' },
          { icon: '⏰', text: 'Sessies van 60 minuten' },
          { icon: '📅', text: 'Flexibel boeken via de app' },
        ].map(({ icon, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>{icon}</span>{text}
          </div>
        ))}
      </div>
    </div>
  )
}
