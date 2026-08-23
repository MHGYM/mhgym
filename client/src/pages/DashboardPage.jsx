import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, CreditCard, TrendingUp, Clock, MapPin, User, ArrowRight, Dumbbell,
  Ticket, Zap, Target, Ruler, Utensils, Flame, AlertTriangle, Award, ChevronRight,
  Lock, CheckCircle2, Sparkles, ScrollText,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
function formatDateLong(dateStr) {
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

const PT_TIER_CLASS = { Basic: 'tier-basic', Standard: 'tier-standard', Premium: 'tier-premium' }

export default function DashboardPage() {
  const { user, membership, refreshUser } = useAuth()

  const [bookings,        setBookings]        = useState([])
  const [voortgang,       setVoortgang]       = useState(null)
  const [ptBalance,       setPtBalance]       = useState(null)
  const [ptBookings,      setPtBookings]      = useState([])
  const [trainingAccess,  setTrainingAccess]  = useState(null)
  const [trainingProgram, setTrainingProgram] = useState(null)
  const [measurements,    setMeasurements]    = useState([])
  const [trainingMeal,    setTrainingMeal]    = useState(null)
  const [simpleNutrition, setSimpleNutrition] = useState(null)
  const [workoutLogs,     setWorkoutLogs]     = useState([])
  const [programDays,     setProgramDays]     = useState([])
  const [badges,          setBadges]          = useState([])
  const [loading,         setLoading]         = useState(true)

  // ── Fase 1: kerngegevens laden ────────────────────────────────────────────
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
          api.get('/voortgang/badges/mine'),
        ])
        const [, bookingsR, voortgangR, ptBalR, ptBookR, accessR, simpleNutR, badgesR] = results

        if (bookingsR.status === 'fulfilled')  setBookings(bookingsR.value.data.bookings || [])
        if (voortgangR.status === 'fulfilled')  setVoortgang(voortgangR.value.data)
        if (ptBalR.status === 'fulfilled')      setPtBalance(ptBalR.value.data)
        if (ptBookR.status === 'fulfilled')     setPtBookings(ptBookR.value.data.bookings || [])
        if (accessR.status === 'fulfilled')     setTrainingAccess(accessR.value.data)
        if (simpleNutR.status === 'fulfilled')  setSimpleNutrition(simpleNutR.value.data)
        if (badgesR.status === 'fulfilled')     setBadges(badgesR.value.data.badges || [])

        // Trainingsplatform-content alleen ophalen bij bevestigde toegang (voorkomt onnodige 403's)
        if (accessR.status === 'fulfilled' && accessR.value.data.has_access) {
          const [progR, measR, nutR, logsR] = await Promise.allSettled([
            api.get('/training/my/program'),
            api.get('/training/my/measurements'),
            api.get('/training/my/nutrition'),
            api.get('/training/my/logs', { params: { limit: 100 } }),
          ])
          if (progR.status === 'fulfilled') setTrainingProgram(progR.value.data.user_program)
          if (measR.status === 'fulfilled') setMeasurements(measR.value.data.measurements || [])
          if (nutR.status === 'fulfilled')  setTrainingMeal(nutR.value.data.plan)
          if (logsR.status === 'fulfilled') setWorkoutLogs(logsR.value.data.logs || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Fase 2: programmadagen ophalen zodra het actieve programma bekend is ──
  useEffect(() => {
    if (!trainingProgram?.program_id) return
    api.get(`/training/programs/${trainingProgram.program_id}`)
      .then((r) => setProgramDays(r.data.program?.days || []))
      .catch(() => {})
  }, [trainingProgram])

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
  const nextClass = upcomingClasses[0] || null

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
  const nextPt = upcomingPt[0] || null
  const completedPtSessions = ptBookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.date_time) <= now
  ).length

  const isPtClient = !!(ptBalance?.subscription) || Number(ptBalance?.total_remaining) > 0
  // Tier komt uitsluitend uit echte data — pt_subscriptions heeft momenteel geen tier-kolom,
  // dus tot die er is tonen we bewust geen (mogelijk onjuist) gegokt niveau.
  const ptTier = ptBalance?.subscription?.tier || null

  const geldigheid    = voortgang?.geldigheid || null
  const hasFonds       = !!geldigheid?.fonds
  const hasRittenkaart = !!geldigheid?.rittenkaart
  // Een PT-klant heeft al een actieve, betalende relatie met de gym — "geen abonnement" is dan niet correct.
  const hasAnyMembershipInfo = !!membership || hasRittenkaart || hasFonds || isPtClient

  const latestMeasurement = measurements[0] || null
  const prevMeasurement   = measurements[1] || null
  const weightTrend = latestMeasurement?.weight_kg != null && prevMeasurement?.weight_kg != null
    ? Number(latestMeasurement.weight_kg) - Number(prevMeasurement.weight_kg)
    : null

  // Voedingsschema: gebruik het rijkere trainingsplatform-schema als het bestaat, anders het eenvoudige Mijn Voortgang-schema
  const nutritionSource = trainingMeal ? 'training' : (simpleNutrition?.template ? 'voortgang' : null)

  // "Volgende workout": volgt de programmavolgorde op basis van hoeveel workouts al gelogd zijn — reële, afgeleide data.
  const nextWorkoutDay = programDays.length > 0 ? programDays[workoutLogs.length % programDays.length] : null
  const lastWorkout = workoutLogs[0] || null

  // ── Persoonlijke statusregel (echte data, geen verzonnen tekst) ───────────
  let statusLine = 'Klaar voor je volgende training?'
  if (voortgang) {
    if (voortgang.is_inactive) statusLine = 'Tijd om de draad weer op te pakken 💪'
    else if (voortgang.visits_this_week > 0) statusLine = `Je hebt deze week al ${voortgang.visits_this_week}× getraind — knap gedaan!`
    else if (voortgang.current_streak_weeks > 0) statusLine = `Je hebt een actieve streak van ${voortgang.current_streak_weeks} ${voortgang.current_streak_weeks === 1 ? 'week' : 'weken'}.`
  }

  // ── Premium-functies: per functie een eigen, eerlijke ontgrendel-check ────
  const premiumFeatures = [
    { key: 'voeding',   icon: '🥗', title: 'Persoonlijk voedingsschema',     unlocked: !!nutritionSource },
    { key: 'training',  icon: '🎥', title: 'Online trainingen',              unlocked: !!trainingAccess?.has_access },
    { key: 'analyse',   icon: '📊', title: 'Uitgebreide lichaamsanalyse',    unlocked: measurements.length > 0 },
    { key: 'coaching',  icon: '🥊', title: 'Persoonlijke coaching',          unlocked: isPtClient },
    { key: 'shop',      icon: '🛍️', title: 'MH Gym Shop-korting',            unlocked: false },
  ]

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
              Goed bezig, <span>{user?.first_name}</span> 👋
            </h1>
            <p className="welcome-sub">
              {statusLine}
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

      {/* ── 2. Snel overzicht ─────────────────────────────────────────────── */}
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
            ) : isPtClient ? (
              <>
                <span className="stat-value" style={{ fontSize: '1.3rem' }}>PT-klant</span>
                <span className="stat-sub">Geen groepslessen-abonnement</span>
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

          {/* Volgende training — uitsluitend groepslessen (PT staat in de PT-kaart) */}
          <div className="stat-card">
            <Clock size={20} className="stat-icon" />
            <span className="stat-label">Volgende training</span>
            {nextClass ? (
              <>
                <span className="stat-value" style={{ fontSize: '1.3rem' }}>{formatDate(nextClass.date_time)}</span>
                <span className="stat-sub">{formatTime(nextClass.date_time)} · {nextClass.class_name}</span>
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

      {/* ── 3. PT — één geconsolideerde kaart ────────────────────────────────── */}
      {isPtClient && (
        <div className="dash-section">
          <div className="section-header">
            <h2><Zap size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Personal Training</h2>
            <Link to={ptBalance.subscription ? '/personal-training?tab=abo' : '/personal-training'} className="btn btn-ghost btn-sm">
              {ptBalance.subscription ? 'Abonnement beheren' : 'Bekijk PT'} <ArrowRight size={14} />
            </Link>
          </div>
          <div className="pt-card">
            <div className="pt-card-header">
              <div className="pt-card-title">
                <Zap size={18} style={{ color: 'var(--accent)' }} />
                {ptBalance.subscription
                  ? `${ptTier ? 'PT ' + ptTier : 'PT-abonnement'} · ${ptBalance.subscription.freq_per_week}× per week`
                  : 'PT-lessenpakket'}
              </div>
              {ptTier && <span className={`tier-badge ${PT_TIER_CLASS[ptTier]}`}>{ptTier}</span>}
            </div>
            {ptBalance.subscription && (
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '0.75rem' }}>
                €{Number(ptBalance.subscription.price_monthly).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}> / maand</span>
              </div>
            )}
            <div className="pt-stats-row">
              <div className="mini-stat">
                <span className="mini-stat-label">Resterende lessen</span>
                <span className="mini-stat-value">{ptBalance.total_remaining ?? 0}</span>
                <span className="mini-stat-sub">{ptBalance.subscription ? `${ptBalance.subscription.freq_per_week}×/week` : 'Losse pakketten'}</span>
              </div>
              <div className="mini-stat">
                <span className="mini-stat-label">Gevolgde trainingen</span>
                <span className="mini-stat-value">{completedPtSessions}</span>
                <span className="mini-stat-sub">totaal afgerond</span>
              </div>
              <div className="mini-stat">
                <span className="mini-stat-label">Volgende PT-sessie</span>
                {nextPt ? (
                  <>
                    <span className="mini-stat-value" style={{ fontSize: '1.15rem' }}>{formatDate(nextPt.date_time)}</span>
                    <span className="mini-stat-sub">{formatTime(nextPt.date_time)}{nextPt.trainer ? ` · ${nextPt.trainer}` : ''}</span>
                  </>
                ) : (
                  <>
                    <span className="mini-stat-value" style={{ fontSize: '1.15rem' }}>–</span>
                    <span className="mini-stat-sub">Nog niets geboekt</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Mijn Voortgang (lichaamsmetingen) ─────────────────────────────── */}
      {trainingAccess?.has_access && (
        <div className="dash-section">
          <div className="section-header">
            <h2><Ruler size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Mijn Voortgang</h2>
            <Link to="/training" className="btn btn-ghost btn-sm">Details <ArrowRight size={14} /></Link>
          </div>
          <div className="progress-card">
            {latestMeasurement ? (
              <>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Laatste meting: {formatDate(latestMeasurement.date)}
                </div>
                <div className="metric-grid">
                  <div className="metric-item">
                    <div className="metric-value">
                      {latestMeasurement.weight_kg != null ? `${latestMeasurement.weight_kg}` : '–'}
                      {latestMeasurement.weight_kg != null && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}> kg</span>}
                    </div>
                    <div className="metric-label">Gewicht</div>
                    {weightTrend !== null && (
                      <div className={weightTrend > 0 ? 'trend-up' : weightTrend < 0 ? 'trend-down' : 'trend-flat'} style={{ fontSize: '0.72rem' }}>
                        {weightTrend > 0 ? '▲' : weightTrend < 0 ? '▼' : '–'} {Math.abs(weightTrend).toFixed(1)} kg
                      </div>
                    )}
                  </div>
                  <div className="metric-item">
                    <div className="metric-value">{latestMeasurement.body_fat_pct != null ? `${latestMeasurement.body_fat_pct}%` : '–'}</div>
                    <div className="metric-label">Vetpercentage</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-value unavailable">–</div>
                    <div className="metric-label">BMI</div>
                    <div className="metric-note">lengte nog niet geregistreerd</div>
                  </div>
                  <div className="metric-item">
                    <div className="metric-value unavailable">–</div>
                    <div className="metric-label">Spiermassa</div>
                    <div className="metric-note">nog niet gemeten</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                <p style={{ fontSize: '0.88rem' }}>Nog geen lichaamsmeting geregistreerd. Vraag je coach om een meting in te plannen.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5. Mijn Training ──────────────────────────────────────────────────── */}
      {trainingProgram && (
        <div className="dash-section">
          <div className="section-header">
            <h2><Target size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Mijn Training</h2>
            <Link to="/training" className="btn btn-ghost btn-sm">Naar trainingen <ArrowRight size={14} /></Link>
          </div>
          <div className="dash-card-grid">
            <div className="stat-card">
              <Target size={18} className="stat-icon" />
              <span className="stat-label">Trainingsprogramma</span>
              <span className="stat-value" style={{ fontSize: '1.2rem' }}>{trainingProgram.program_name}</span>
              <span className="stat-sub">{trainingProgram.goal} · {trainingProgram.sessions_per_week}×/week</span>
            </div>
            <div className="stat-card">
              <Dumbbell size={18} className="stat-icon" />
              <span className="stat-label">Volgende workout</span>
              {nextWorkoutDay ? (
                <>
                  <span className="stat-value" style={{ fontSize: '1.2rem' }}>
                    {nextWorkoutDay.is_rest_day ? 'Rustdag' : nextWorkoutDay.day_name}
                  </span>
                  <span className="stat-sub">{nextWorkoutDay.focus || (nextWorkoutDay.is_rest_day ? 'Herstel' : '—')}</span>
                </>
              ) : (
                <>
                  <span className="stat-value" style={{ fontSize: '1.3rem' }}>–</span>
                  <span className="stat-sub">Nog geen programmadagen</span>
                </>
              )}
            </div>
            <div className="stat-card">
              <ScrollText size={18} className="stat-icon" />
              <span className="stat-label">Laatste workout</span>
              {lastWorkout ? (
                <>
                  <span className="stat-value" style={{ fontSize: '1.2rem' }}>{formatDate(lastWorkout.date)}</span>
                  <span className="stat-sub">{lastWorkout.day_name || 'Training'}{lastWorkout.exercise_count ? ` · ${lastWorkout.exercise_count} oefeningen` : ''}</span>
                </>
              ) : (
                <>
                  <span className="stat-value" style={{ fontSize: '1.3rem' }}>–</span>
                  <span className="stat-sub">Nog niets gelogd</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Voeding ───────────────────────────────────────────────────────── */}
      <div className="dash-section">
        <div className="section-header">
          <h2><Utensils size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Voeding</h2>
        </div>
        {nutritionSource === 'training' ? (
          <div className="stat-card" style={{ maxWidth: 420 }}>
            <Utensils size={18} className="stat-icon" />
            <span className="stat-label">Voedingsschema</span>
            <span className="stat-value" style={{ fontSize: '1.2rem' }}>{trainingMeal.name}</span>
            <span className="stat-sub">{trainingMeal.calories_target ? `${trainingMeal.calories_target} kcal/dag` : trainingMeal.goal}</span>
          </div>
        ) : nutritionSource === 'voortgang' ? (
          <Link to="/dashboard/mijn-voortgang" className="stat-card" style={{ textDecoration: 'none', maxWidth: 420 }}>
            <Utensils size={18} className="stat-icon" />
            <span className="stat-label">Voedingsschema</span>
            <span className="stat-value" style={{ fontSize: '1.2rem' }}>{simpleNutrition.template.title}</span>
            <span className="stat-sub">Bekijk je dagelijkse checklist <ChevronRight size={11} style={{ verticalAlign: 'middle' }} /></span>
          </Link>
        ) : (
          <div className="coming-soon-card">
            <div className="cs-icon">🔒</div>
            <h4>Nog geen voedingsschema</h4>
            <p>Zodra je coach een voedingsschema voor je klaarzet, verschijnt het hier.</p>
          </div>
        )}
      </div>

      {/* ── 7. Badges & Mijlpalen ────────────────────────────────────────────── */}
      <div className="dash-section">
        <div className="section-header">
          <h2><Award size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Badges &amp; Mijlpalen</h2>
          <Link to="/dashboard/mijn-voortgang" style={{ fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>
            Alles bekijken <ChevronRight size={13} style={{ verticalAlign: 'middle' }} />
          </Link>
        </div>
        {badges.filter(b => b.earned).length === 0 ? (
          <div className="coming-soon-card">
            <div className="cs-icon">🏆</div>
            <h4>Nog geen badges behaald</h4>
            <p>Zodra MH Gym je eerste meetresultaat uploadt, verdien je automatisch je eerste badge.</p>
          </div>
        ) : (
          <div className="premium-grid">
            {badges.map((b) => (
              <div key={b.key} className={`premium-feature-card ${b.earned ? 'unlocked' : 'locked'}`} title={b.description}>
                <span className="premium-feature-icon">{b.icon}</span>
                <span className="premium-feature-title">{b.label}</span>
                <span className={`premium-feature-status ${b.earned ? 'is-unlocked' : 'is-locked'}`}>
                  {b.earned
                    ? <><CheckCircle2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Behaald</>
                    : <><Lock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Nog niet behaald</>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 8. Premium ───────────────────────────────────────────────────────── */}
      <div className="dash-section">
        <div className="section-header">
          <h2><Sparkles size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />Premium</h2>
        </div>
        <div className="premium-grid">
          {premiumFeatures.map((f) => (
            <div key={f.key} className={`premium-feature-card ${f.unlocked ? 'unlocked' : 'locked'}`}>
              <span className="premium-feature-icon">{f.icon}</span>
              <span className="premium-feature-title">{f.title}</span>
              <span className={`premium-feature-status ${f.unlocked ? 'is-unlocked' : 'is-locked'}`}>
                {f.unlocked
                  ? <><CheckCircle2 size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Beschikbaar</>
                  : <><Lock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />Nog niet actief</>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Komende reserveringen ────────────────────────────────────────────── */}
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
