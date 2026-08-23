import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, Calendar, Utensils, Flame, Clock, Ticket, CreditCard,
  CheckCircle2, Circle, AlertTriangle, User, MapPin, Dumbbell, Ruler, X,
} from 'lucide-react'
import api from '../api'
import AuthedImage from '../components/AuthedImage'

const TABS = [
  { key: 'voortgang',       label: 'Voortgang',       Icon: TrendingUp },
  { key: 'aanwezigheid',    label: 'Aanwezigheid',    Icon: Calendar   },
  { key: 'voeding',         label: 'Voeding',          Icon: Utensils   },
  { key: 'meetresultaten',  label: 'Meetresultaten',  Icon: Ruler      },
]

function fmtDate(s) {
  return new Date(s).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function MijnVoortgangPage() {
  const [tab, setTab]           = useState('voortgang')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading]   = useState(true)

  const loadOverview = useCallback(() => {
    api.get('/voortgang/overview').then(r => setOverview(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    loadOverview()
    setLoading(false)
  }, [loadOverview])

  if (loading) {
    return (
      <div className="page loading-center">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="section-header" style={{ marginBottom: '1rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <TrendingUp size={20} style={{ color: 'var(--accent)' }} />
          Mijn Voortgang
        </h2>
      </div>

      <div className="tab-bar" style={{ marginBottom: '1.25rem' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} className={`tab-btn${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />{label}
          </button>
        ))}
      </div>

      {tab === 'voortgang'      && <VoortgangTab overview={overview} />}
      {tab === 'aanwezigheid'   && <AanwezigheidTab />}
      {tab === 'voeding'        && <VoedingTab />}
      {tab === 'meetresultaten' && <MeetresultatenTab />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAB: VOORTGANG
// ════════════════════════════════════════════════════════════════════
function VoortgangTab({ overview }) {
  if (!overview) return <p style={{ color: 'var(--text-muted)' }}>Kan gegevens niet laden.</p>

  const { geldigheid, nutrition_week } = overview

  return (
    <div>
      {overview.is_inactive && (
        <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>We missen je! Kom weer trainen 💪 — het is {overview.days_since_last_visit} dagen geleden.</span>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <Calendar size={18} className="stat-icon" />
          <span className="stat-label">Deze week</span>
          <span className="stat-value">{overview.visits_this_week}</span>
          <span className="stat-sub">bezoeken</span>
        </div>
        <div className="stat-card">
          <Calendar size={18} className="stat-icon" />
          <span className="stat-label">Deze maand</span>
          <span className="stat-value">{overview.visits_this_month}</span>
          <span className="stat-sub">bezoeken</span>
        </div>
        <div className="stat-card">
          <Flame size={18} className="stat-icon" style={{ color: overview.current_streak_weeks > 0 ? 'var(--warning)' : undefined }} />
          <span className="stat-label">Actieve streak</span>
          <span className="stat-value">{overview.current_streak_weeks}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}> wk</span></span>
          <span className="stat-sub">langste: {overview.longest_streak_weeks} wk</span>
        </div>
        <div className="stat-card">
          <Clock size={18} className="stat-icon" />
          <span className="stat-label">Laatste bezoek</span>
          <span className="stat-value" style={{ fontSize: '1.3rem' }}>
            {overview.days_since_last_visit === null ? '—' : `${overview.days_since_last_visit}d`}
          </span>
          <span className="stat-sub">geleden</span>
        </div>
      </div>

      {/* Geldigheid PT / rittenkaart / fonds */}
      {(geldigheid?.rittenkaart || geldigheid?.fonds || geldigheid?.pt_package) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>Geldigheid</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {geldigheid.rittenkaart && (
              <GeldigheidRow
                icon={<Ticket size={16} />}
                label={`Rittenkaart · ${geldigheid.rittenkaart.type_naam}`}
                sub={`${geldigheid.rittenkaart.ritten_resterend} van ${geldigheid.rittenkaart.ritten_totaal} ritten resterend`}
                dagen={geldigheid.rittenkaart.dagen_resterend}
              />
            )}
            {geldigheid.pt_package && (
              <GeldigheidRow
                icon={<Dumbbell size={16} />}
                label="PT-pakket"
                sub={`${geldigheid.pt_package.lessons_remaining} van ${geldigheid.pt_package.lessons_total} lessen resterend`}
                dagen={geldigheid.pt_package.dagen_resterend}
              />
            )}
            {geldigheid.fonds && (
              <GeldigheidRow
                icon={<CreditCard size={16} />}
                label={geldigheid.fonds.fonds_naam || 'Fonds'}
                sub={`Geldig t/m ${new Date(geldigheid.fonds.end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                dagen={geldigheid.fonds.dagen_resterend}
              />
            )}
          </div>
        </div>
      )}

      {/* Voeding compliance mini-kaart */}
      {nutrition_week?.template && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              <Utensils size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Voeding deze week
            </span>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{nutrition_week.compliance_pct ?? 0}%</span>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${nutrition_week.compliance_pct >= 100 ? 'full' : nutrition_week.compliance_pct < 40 ? 'warn' : ''}`}
              style={{ width: `${Math.min(nutrition_week.compliance_pct ?? 0, 100)}%` }}
            />
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {nutrition_week.completed} van {nutrition_week.expected} maaltijden afgevinkt — schema: {nutrition_week.template.title}
          </div>
        </div>
      )}
    </div>
  )
}

function GeldigheidRow({ icon, label, sub, dagen }) {
  const urgent = dagen !== null && dagen <= 5
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.65rem 0.9rem', background: 'var(--surface-2)', borderRadius: 'var(--r)', borderLeft: urgent ? '3px solid var(--warning)' : '3px solid var(--success)' }}>
      <span style={{ color: urgent ? 'var(--warning)' : 'var(--success)', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      {dagen !== null && (
        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: urgent ? 'var(--warning)' : 'var(--text)', whiteSpace: 'nowrap' }}>
          {dagen > 0 ? `${dagen}d` : 'verlopen'}
        </span>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAB: AANWEZIGHEID
// ════════════════════════════════════════════════════════════════════
function AanwezigheidTab() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/voortgang/attendance').then(r => setHistory(r.data.history || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Laden…</p>

  if (history.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '2.5rem' }}>
        <div className="empty-state-icon"><Calendar size={36} /></div>
        <h3>Nog geen bezoeken gelogd</h3>
        <p>Zodra je bent ingecheckt bij een les of PT-afspraak verschijnt dat hier.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {history.map(a => (
        <div key={a.id} className="booking-item">
          <div className="booking-time">
            <div>{fmtDate(a.date).split(' ')[0]}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{fmtDate(a.date).split(' ').slice(1).join(' ')}</div>
          </div>
          <div className="booking-info">
            <h4>{a.source === 'pt' ? 'Personal Training' : a.class_name || 'Groepsles'}</h4>
            {a.instructor && (
              <p><User size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />{a.instructor}</p>
            )}
          </div>
          <span className={`badge ${a.source === 'pt' ? 'badge-info' : 'badge-success'}`}>
            {a.source === 'pt' ? 'PT' : 'Aanwezig'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAB: VOEDING
// ════════════════════════════════════════════════════════════════════
function VoedingTab() {
  const [today, setTodayData] = useState(null)
  const [week, setWeek]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes]     = useState({})
  const [saving, setSaving]   = useState({})

  const load = useCallback(() => {
    Promise.all([
      api.get('/voortgang/nutrition/today'),
      api.get('/voortgang/nutrition/week'),
    ]).then(([t, w]) => {
      setTodayData(t.data)
      setWeek(w.data)
      const n = {}
      Object.entries(t.data.logs || {}).forEach(([k, v]) => { n[k] = v.note || '' })
      setNotes(n)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const toggleMeal = async (mealKey) => {
    const current = today.logs[mealKey] || { completed: false, note: '' }
    setSaving(s => ({ ...s, [mealKey]: true }))
    try {
      await api.post('/voortgang/nutrition/log', {
        date: today.date,
        meal_ref: mealKey,
        completed: !current.completed,
        note: notes[mealKey] || '',
      })
      setTodayData(t => ({
        ...t,
        logs: { ...t.logs, [mealKey]: { completed: !current.completed, note: notes[mealKey] || '' } },
      }))
      // Week-compliance opnieuw ophalen zodat de percentage klopt
      api.get('/voortgang/nutrition/week').then(r => setWeek(r.data)).catch(() => {})
    } catch (e) {
      alert(e.response?.data?.error || 'Opslaan mislukt.')
    } finally {
      setSaving(s => ({ ...s, [mealKey]: false }))
    }
  }

  const saveNote = async (mealKey) => {
    const current = today.logs[mealKey] || { completed: false }
    try {
      await api.post('/voortgang/nutrition/log', {
        date: today.date,
        meal_ref: mealKey,
        completed: current.completed,
        note: notes[mealKey] || '',
      })
      setTodayData(t => ({ ...t, logs: { ...t.logs, [mealKey]: { ...current, note: notes[mealKey] || '' } } }))
    } catch (_) { /* stil falen — notitie is niet kritiek */ }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Laden…</p>

  if (!today?.template) {
    return (
      <div className="empty-state" style={{ padding: '2.5rem' }}>
        <div className="empty-state-icon"><Utensils size={36} /></div>
        <h3>Nog geen voedingsschema</h3>
        <p>Je coach heeft nog geen voedingsschema voor je klaargezet.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Week compliance */}
      {week?.template && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Week-overzicht</span>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{week.compliance_pct ?? 0}%</span>
          </div>
          <div className="progress-bar" style={{ marginBottom: '0.6rem' }}>
            <div
              className={`progress-fill ${week.compliance_pct >= 100 ? 'full' : week.compliance_pct < 40 ? 'warn' : ''}`}
              style={{ width: `${Math.min(week.compliance_pct ?? 0, 100)}%` }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {week.days.map(d => {
              const total = today.meals.length
              const ratio = total > 0 ? d.completed / total : 0
              return (
                <div key={d.date} title={`${d.date}: ${d.completed}/${total}`} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: 22, borderRadius: 4, marginBottom: 3,
                    background: ratio >= 1 ? 'var(--success)' : ratio > 0 ? 'var(--warning)' : 'var(--surface-3)',
                  }} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {new Date(d.date + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'narrow' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Vandaag checklist */}
      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
        Vandaag · {today.template.title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {today.meals.map(meal => {
          const log = today.logs[meal.key] || { completed: false, note: '' }
          return (
            <div key={meal.key} className="card" style={{ padding: '0.85rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem' }}>
                <button
                  onClick={() => toggleMeal(meal.key)}
                  disabled={saving[meal.key]}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, flexShrink: 0 }}
                  aria-label={log.completed ? 'Afvinken ongedaan maken' : 'Afvinken'}
                >
                  {log.completed
                    ? <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
                    : <Circle size={22} style={{ color: 'var(--text-muted)' }} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', textDecoration: log.completed ? 'line-through' : 'none', color: log.completed ? 'var(--text-muted)' : 'var(--text)' }}>
                    {meal.label}
                  </div>
                  {meal.description && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{meal.description}</div>
                  )}
                  <input
                    className="form-input"
                    style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.6rem' }}
                    placeholder="Afgeweken? Noteer wat je at…"
                    value={notes[meal.key] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [meal.key]: e.target.value }))}
                    onBlur={() => saveNote(meal.key)}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAB: MEETRESULTATEN + BADGES
// ════════════════════════════════════════════════════════════════════
function fmtFullDate(s) {
  return s ? new Date(s).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'
}

function MeetresultatenTab() {
  const [reports, setReports]   = useState(undefined) // undefined = laden
  const [badges, setBadges]     = useState([])
  const [fullscreen, setFullscreen] = useState(null) // report object of null

  useEffect(() => {
    api.get('/voortgang/measurement-reports/mine').then(r => setReports(r.data.reports || [])).catch(() => setReports([]))
    api.get('/voortgang/badges/mine').then(r => setBadges(r.data.badges || [])).catch(() => {})
  }, [])

  if (reports === undefined) return <p style={{ color: 'var(--text-muted)' }}>Laden…</p>

  return (
    <div>
      {/* Badges */}
      {badges.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>Badges</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
            {badges.map(b => (
              <div
                key={b.key}
                title={b.description}
                style={{
                  padding: '0.6rem 0.7rem', borderRadius: 'var(--r)',
                  background: b.earned ? 'var(--surface-2)' : 'transparent',
                  border: `1px solid ${b.earned ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: b.earned ? 1 : 0.45,
                }}
              >
                <div style={{ fontSize: '1.3rem', lineHeight: 1 }}>{b.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', marginTop: 4 }}>{b.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{b.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meetresultaten */}
      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>Mijn meetresultaten</h3>

      {reports.length === 0 ? (
        <div className="empty-state" style={{ padding: '2.5rem' }}>
          <div className="empty-state-icon"><Ruler size={36} /></div>
          <h3>Je hebt nog geen meetresultaten.</h3>
          <p>Zodra MH Gym een lichaamsanalyse-/weegschaalrapport voor je uploadt, verschijnt dat hier.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
          {reports.map(rep => (
            <div key={rep.id} className="card" style={{ padding: '0.5rem', cursor: 'pointer' }} onClick={() => setFullscreen(rep)}>
              <AuthedImage
                src={`/voortgang/measurement-reports/mine/${rep.id}/image`}
                alt={rep.title || fmtFullDate(rep.measured_at)}
                style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 'var(--r-sm)' }}
              />
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginTop: '0.4rem' }}>{rep.title || 'Meetresultaat'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmtFullDate(rep.measured_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen viewer */}
      {fullscreen && (
        <div className="modal-overlay" onClick={() => setFullscreen(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: 'auto' }}>
            <div className="modal-header">
              <h3>{fullscreen.title || 'Meetresultaat'} — {fmtFullDate(fullscreen.measured_at)}</h3>
              <button className="btn-icon" onClick={() => setFullscreen(null)}><X size={18} /></button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center' }}>
              <AuthedImage
                src={`/voortgang/measurement-reports/mine/${fullscreen.id}/image`}
                alt={fullscreen.title || fmtFullDate(fullscreen.measured_at)}
                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 'var(--r)' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
