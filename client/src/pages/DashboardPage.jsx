import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, CreditCard, TrendingUp, Clock, MapPin, User, ArrowRight, Dumbbell,
  Ticket, Zap, Target, Ruler, Utensils, Flame, AlertTriangle, Award, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
function formatDateLong(dateStr) {
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Presentatie-mapping — er bestaat nog geen tier-veld in de database.
// Prijzen/frequenties worden in een latere fase vastgelegd; dit is puur UI.
const PT_TIER_BY_FREQ = { 1: 'Basic', 2: 'Standard', 3: 'Premium' }
const PT_TIER_CLASS   = { Basic: 'tier-basic', Standard: 'tier-standard', Premium: 'tier-premium' }

export default function DashboardPage() {
  const { user, membership, refreshUser } = useAuth()

  const [bookings,       setBookings]       = useState([])
  const [voortgang,      setVoortgang]      = useState(null)
  const [ptBalance,      setPtBalance]      = useState(null)
  const [ptBookings,     setPtBookings]     = useState([])
  const [trainingAccess, setTrainingAccess] = useState(null)
  const [trainingProgram,setTrainingProgram]= useState(null)
  const [measurements,   setMeasurements]   = useState([])
  const [trainingMeal,   setTrainingMeal]   = useState(null)
  const [simpleNutrition,setSimpleNutrition]= useState(null)
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const results = await Promise.allSettled([
          refreshUser(),
          api.get('/bookings'),
          api.get('/voortgang/overview'),
          api.get('/pt/balance'),
          api.get('/pt/bookings/mine'),
          api.get('/training/access'),
          api.get('/voortgang/nutrition/today'),
        ])
        const [, bookingsR, voortgangR, ptBalR, ptBookR, accessR, simpleNutR] = results

        if (bookingsR.status === 'fulfilled')  setBookings(bookingsR.value.data.bookings || [])
        if (voortgangR.status === 'fulfilled')  setVoortgang(voortgangR.value.data)
        if (ptBalR.status === 'fulfilled')      setPtBalance(ptBalR.value.data)
        if (ptBookR.status === 'fulfilled')     setPtBookings(ptBookR.value.data.bookings || [])
        if (accessR.status === 'fulfilled')     setTrainingAccess(accessR.value.data)
        if (simpleNutR.status === 'fulfilled')  setSimpleNutrition(simpleNutR.value.data)

        // Trainingsplatform-content alleen ophalen bij bevestigde toegang (voorkomt onnodige 403's)
        if (accessR.status === 'fulfilled' && accessR.value.data.has_access) {
          const [progR, measR, nutR] = await Promise.allSettled([
            api.get('/training/my/program'),
            api.get('/training/my/measurements'),
            api.get('/training/my/nutrition'),
          ])
          if (progR.status === 'fulfilled') setTrainingProgram(progR.value.data.user_program)
          if (measR.status === 'fulfilled') setMeasurements(measR.value.data.measurements || [])
          if (nutR.status === 'fulfilled')  setTrainingMeal(nutR.value.data.plan)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="page loading-center">
        <div className="spinner" />
      </div>
    )
  }

  // ── Groepslessen: komende bevestigde reserveringen ─────────────────────────
  const now = new Date()
  const upcomingClasses = bookings
    .filter((b) => b.status === 'confirmed' && new Date(b.date_time) > now)
    .sort((a, b) => new Date(a.date_time) - new Date(b.date_time))

  const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0)
  const classesUsedThisMonth = bookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.booked_at) >= firstOfMonth
  ).length
  const maxBookings = membership?.max_bookings_per_month ?? null
  const fillPct = maxBookings > 0 ? Math.min((classesUsedThisMonth / maxBookings) * 100, 100) : 0

  // ── PT: volgende sessie + afgeronde sessies ────────────────────────────────
  const upcomingPt = ptBookings
    .filter((b) => b.status === 'confirmed' && new Date(b.date_time) > now)
    .sort((a, b) => new Date(a.date_time) - new Date(b.date_time))
  const completedPtSessions = ptBookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.date_time) <= now
  ).length

  const isPtClient = !!(ptBalance?.subscription) || Number(ptBalance?.total_remaining) > 0
  const ptTier = ptBalance?.subscription ? PT_TIER_BY_FREQ[ptBalance.subscription.freq_per_week] : null

  // ── Eén "volgende sessie": vroegste van groepsles of PT ────────────────────
  const nextClass = upcomingClasses[0] || null
  const nextPt = upcomingPt[0] || null
  let nextSession = null
  if (nextClass && nextPt) {
    nextSession = new Date(nextClass.date_time) <= new Date(nextPt.date_time)
      ? { type: 'class', ...nextClass } : { type: 'pt', ...nextPt }
  } else if (nextClass) nextSession = { type: 'class', ...nextClass }
  else if (nextPt)      nextSession = { type: 'pt', ...nextPt }

  const geldigheid    = voortgang?.geldigheid || null
  const hasFonds       = !!geldigheid?.fonds
  const hasRittenkaart = !!geldigheid?.rittenkaart
  const hasAnyMembershipInfo = !!membership || hasRittenkaart || hasFonds

  const latestMeasurement = measurements[0] || null
  // Voedingsschema: gebruik het rijkere trainingsplatform-schema als het bestaat, anders het eenvoudige Mijn Voortgang-schema
  const nutritionSource = trainingMeal ? 'training' : (simpleNutrition?.template ? 'voortgang' : null)

  return (
    <div className="page">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="dashboard-welcome">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="dash-avatar-ring">
            {`${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase()}
          </div>
          <div>
            <h1 className="welcome-title">
              Goed bezig, <span>{user?.first_name}</span>!
            </h1>
            <p className="welcome-sub">
              {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
              {isPtClient && ptTier && (
                <span className={`tier-badge ${PT_TIER_CLASS[ptTier]}`} style={{ marginLeft: '0.75rem' }}>
                  <Zap size={11} /> PT {ptTier}
                </span>
              )}
            </p>
          </div>
        </div>
        <Link to="/schedule" className="btn btn-primary btn-lg">
          <Calendar size={18} />
          Les boeken
        </Link>
      </div>

      {/* ── Aandachtsbanners ──────────────────────────────────────────────── */}
      {voortgang?.is_inactive && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>We missen je! Kom weer trainen 💪 — het is {voortgang.days_since_last_visit} dagen geleden.</span>
        </div>
      )}
      {hasFonds && geldigheid.fonds.dagen_resterend !== null && geldigheid.fonds.dagen_resterend <= 30 && (
        <div className={`alert ${geldigheid.fonds.dagen_resterend <= 7 ? 'alert-error' : 'alert-warning'}`} style={{ marginBottom: '1rem' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>
            Je {geldigheid.fonds.fonds_naam} loopt {geldigheid.fonds.dagen_resterend <= 0 ? 'af' : `over ${geldigheid.fonds.dagen_resterend} dagen af`}
            {geldigheid.fonds.end_date && ` (${formatDateLong(geldigheid.fonds.end_date)})`}. Regel op tijd een nieuw fonds.
          </span>
        </div>
      )}

      {!hasAnyMembershipInfo && (
        <div className="no-membership-banner">
          <div>
            <h3>Nog geen actief lidmaatschap</h3>
            <p>Kies een abonnement en begin vandaag met sporten.</p>
          </div>
          <Link to="/memberships" className="btn btn-primary">
            Abonnement kiezen <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {/* ── Sectie: Overzicht ─────────────────────────────────────────────── */}
      <div className="dash-section">
        <div className="dash-card-grid">
          {/* Lidmaatschap / Sportfonds / Rittenkaart */}
          <div className="stat-card">
            <CreditCard size={20} className="stat-icon" />
            <span className="stat-label">Lidmaatschap</span>
            {membership ? (
              <>
                <span className="stat-value" style={{ fontSize: '1.3rem' }}>{membership.membership_name || membership.name}</span>
                <span className="stat-sub">€{Number(membership.price_monthly).toFixed(2)} / maand</span>
              </>
            ) : hasFonds ? (
              <>
                <span className="stat-value" style={{ fontSize: '1.3rem' }}>{geldigheid.fonds.fonds_naam}</span>
                <span className="stat-sub">
                  {geldigheid.fonds.dagen_resterend !== null ? `Nog ${geldigheid.fonds.dagen_resterend} dagen geldig` : 'Actief'}
                </span>
              </>
            ) : hasRittenkaart ? (
              <>
                <span className="stat-value" style={{ fontSize: '1.3rem' }}>{geldigheid.rittenkaart.type_naam}</span>
                <span className="stat-sub">{geldigheid.rittenkaart.ritten_resterend} van {geldigheid.rittenkaart.ritten_totaal} ritten resterend</span>
              </>
            ) : (
              <>
                <span className="stat-value" style={{ fontSize: '1.4rem' }}>–</span>
                <span className="stat-sub">Geen actief abonnement</span>
              </>
            )}
          </div>

          {/* Lessen deze maand */}
          <div className="stat-card">
            <TrendingUp size={20} className="stat-icon" />
            <span className="stat-label">Lessen deze maand</span>
            <span className="stat-value">
              {classesUsedThisMonth}
              {maxBookings > 0 && <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>/{maxBookings}</span>}
              {maxBookings === -1 && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}> ∞</span>}
            </span>
            {maxBookings > 0 && (
              <div className="progress-wrap" style={{ marginTop: '0.25rem' }}>
                <div className="progress-bar">
                  <div className={`progress-fill ${fillPct >= 100 ? 'full' : fillPct >= 75 ? 'warn' : ''}`} style={{ width: `${fillPct}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Volgende sessie (groepsles of PT, wat eerder is) */}
          <div className="stat-card">
            <Clock size={20} className="stat-icon" />
            <span className="stat-label">Volgende training</span>
            {nextSession ? (
              <>
                <span className="stat-value" style={{ fontSize: '1.3rem' }}>{formatDate(nextSession.date_time)}</span>
                <span className="stat-sub">
                  {formatTime(nextSession.date_time)} · {nextSession.type === 'pt' ? 'Personal Training' : nextSession.class_name}
                </span>
              </>
            ) : (
              <>
                <span className="stat-value" style={{ fontSize: '1.4rem' }}>–</span>
                <span className="stat-sub">Niets gepland</span>
              </>
            )}
          </div>

          {/* Aanwezigheid / streak */}
          <Link to="/dashboard/mijn-voortgang" className="stat-card" style={{ textDecoration: 'none' }}>
            <Flame size={20} className="stat-icon" style={{ color: voortgang?.current_streak_weeks > 0 ? 'var(--warning)' : undefined }} />
            <span className="stat-label">Actieve streak</span>
            <span className="stat-value">
              {voortgang?.current_streak_weeks ?? 0}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}> wk</span>
            </span>
            <span className="stat-sub">{voortgang?.visits_this_week ?? 0} bezoeken deze week · bekijk voortgang <ChevronRight size={11} style={{ verticalAlign: 'middle' }} /></span>
          </Link>
        </div>
      </div>

      {/* ── Sectie: PT (alleen voor PT-klanten) ─────────────────────────────── */}
      {isPtClient && (
        <div className="dash-section">
          <div className="section-header">
            <h2><Zap size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Personal Training</h2>
            <Link to="/personal-training" className="btn btn-ghost btn-sm">Bekijk PT <ArrowRight size={14} /></Link>
          </div>
          <div className="dash-card-grid">
            <div className="stat-card">
              <Ticket size={18} className="stat-icon" />
              <span className="stat-label">Resterende lessen</span>
              <span className="stat-value">{ptBalance.total_remaining ?? 0}</span>
              <span className="stat-sub">
                {ptBalance.subscription
                  ? `Abonnement · ${ptTier || ptBalance.subscription.freq_per_week + '×/week'}`
                  : 'Losse pakketten'}
              </span>
            </div>
            <div className="stat-card">
              <Award size={18} className="stat-icon" />
              <span className="stat-label">Gevolgde trainingen</span>
              <span className="stat-value">{completedPtSessions}</span>
              <span className="stat-sub">totaal afgeronde sessies</span>
            </div>
            <div className="stat-card">
              <Clock size={18} className="stat-icon" />
              <span className="stat-label">Volgende PT-sessie</span>
              {nextPt ? (
                <>
                  <span className="stat-value" style={{ fontSize: '1.2rem' }}>{formatDate(nextPt.date_time)}</span>
                  <span className="stat-sub">{formatTime(nextPt.date_time)}{nextPt.trainer ? ` · ${nextPt.trainer}` : ''}</span>
                </>
              ) : (
                <>
                  <span className="stat-value" style={{ fontSize: '1.3rem' }}>–</span>
                  <span className="stat-sub">Nog niets geboekt</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sectie: Trainingsvoortgang (programma/meting/voeding indien aanwezig) ── */}
      {(trainingProgram || latestMeasurement || nutritionSource) && (
        <div className="dash-section">
          <div className="section-header">
            <h2><Target size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Trainingsvoortgang</h2>
            <Link to="/training" className="btn btn-ghost btn-sm">Naar trainingen <ArrowRight size={14} /></Link>
          </div>
          <div className="dash-card-grid">
            {trainingProgram && (
              <div className="stat-card">
                <Target size={18} className="stat-icon" />
                <span className="stat-label">Trainingsdoel</span>
                <span className="stat-value" style={{ fontSize: '1.2rem' }}>{trainingProgram.program_name}</span>
                <span className="stat-sub">{trainingProgram.goal} · {trainingProgram.sessions_per_week}×/week</span>
              </div>
            )}
            {latestMeasurement && (
              <div className="stat-card">
                <Ruler size={18} className="stat-icon" />
                <span className="stat-label">Recente meting</span>
                <span className="stat-value">{latestMeasurement.weight_kg != null ? `${latestMeasurement.weight_kg} kg` : '–'}</span>
                <span className="stat-sub">{formatDate(latestMeasurement.date)}</span>
              </div>
            )}
            {nutritionSource === 'training' && (
              <div className="stat-card">
                <Utensils size={18} className="stat-icon" />
                <span className="stat-label">Voedingsschema</span>
                <span className="stat-value" style={{ fontSize: '1.2rem' }}>{trainingMeal.name}</span>
                <span className="stat-sub">
                  {trainingMeal.calories_target ? `${trainingMeal.calories_target} kcal/dag` : trainingMeal.goal}
                </span>
              </div>
            )}
            {nutritionSource === 'voortgang' && (
              <Link to="/dashboard/mijn-voortgang" className="stat-card" style={{ textDecoration: 'none' }}>
                <Utensils size={18} className="stat-icon" />
                <span className="stat-label">Voedingsschema</span>
                <span className="stat-value" style={{ fontSize: '1.2rem' }}>{simpleNutrition.template.title}</span>
                <span className="stat-sub">Bekijk je dagelijkse checklist <ChevronRight size={11} style={{ verticalAlign: 'middle' }} /></span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Sectie: Badges & Challenges (placeholder, geen echte data) ──────── */}
      <div className="dash-section">
        <div className="section-header">
          <h2><Award size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Badges &amp; Challenges</h2>
        </div>
        <div className="coming-soon-card">
          <div className="cs-icon">🏆</div>
          <h4>Binnenkort beschikbaar</h4>
          <p>Mijlpalen, challenges en badges voor consistentie en trainingsresultaten komen in een volgende update.</p>
        </div>
      </div>

      {/* ── Sectie: Komende reserveringen ───────────────────────────────────── */}
      <div className="dash-section">
        <div className="section-header">
          <h2>Komende reserveringen</h2>
          <Link to="/schedule" className="btn btn-ghost btn-sm">
            Alle lessen <ArrowRight size={14} />
          </Link>
        </div>

        {upcomingClasses.length === 0 ? (
          <div className="empty-state" style={{ padding: '2.5rem' }}>
            <div className="empty-state-icon"><Dumbbell size={36} /></div>
            <h3>Geen komende lessen</h3>
            <p style={{ marginBottom: '1.25rem' }}>Reserveer een les en begin met trainen!</p>
            <Link to="/schedule" className="btn btn-primary">
              <Calendar size={16} /> Rooster bekijken
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {upcomingClasses.slice(0, 5).map((b) => (
              <div key={b.id} className="booking-item">
                <div className="booking-time">
                  <div>{formatDate(b.date_time).split(' ')[0]}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800 }}>{formatTime(b.date_time)}</div>
                </div>
                <div className="booking-info">
                  <h4>{b.class_name}</h4>
                  <p>
                    <User size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    {b.instructor}
                    &nbsp;·&nbsp;
                    <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                    {b.location}
                    &nbsp;·&nbsp;
                    {b.duration_minutes} min
                  </p>
                </div>
                <span className="badge badge-success">Bevestigd</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
