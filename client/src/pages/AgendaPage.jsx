import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Clock, User, Users } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

// ── Constanten ────────────────────────────────────────────────────────────────
const DAY_NAMES  = ['ma','di','wo','do','vr','za','zo']
const DAY_FULL   = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag']
const HOUR_PX    = 56   // hoogte per uur in pixels
const TOTAL_PX   = HOUR_PX * 24

function getMonday(d) {
  const date = new Date(d)
  const day  = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  date.setHours(0,0,0,0)
  return date
}
function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}
function toDateStr(d) { return d.toISOString().split('T')[0] }
function timeToPx(hhmm) {
  const [h,m] = hhmm.split(':').map(Number)
  return (h * 60 + m) / 60 * HOUR_PX
}
function dtToPx(isoStr) {
  const d = new Date(isoStr)
  return (d.getHours() * 60 + d.getMinutes()) / 60 * HOUR_PX
}
function dtToDate(isoStr) { return new Date(isoStr).toISOString().split('T')[0] }
function durationPx(mins) { return (mins / 60) * HOUR_PX }

// ── Kleur per event type ──────────────────────────────────────────────────────
const EVENT_COLORS = {
  class:    { bg: 'rgba(59,130,246,0.85)',   border: '#3b82f6', label: 'Groepslessen'   },
  pt_confirmed: { bg: 'rgba(239,68,68,0.85)',  border: '#ef4444', label: 'Personal Training' },
  pt_pending:   { bg: 'rgba(245,158,11,0.85)', border: '#f59e0b', label: 'PT Aanvraag'       },
  vt:       { bg: 'rgba(34,197,94,0.85)',    border: '#22c55e', label: 'Vrij Trainen'    },
}

// ── Vrij Trainen slot tijden (08-22) ──────────────────────────────────────────
const VT_SLOTS = []
for (let h = 8; h < 22; h++) {
  VT_SLOTS.push(`${String(h).padStart(2,'0')}:00`)
}

export default function AgendaPage() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'

  const [monday,    setMonday]    = useState(getMonday(new Date()))
  const [agenda,    setAgenda]    = useState({ classes: [], pt_bookings: [], vt_bookings: [] })
  const [loading,   setLoading]   = useState(true)
  const [vtModal,   setVtModal]   = useState(null)   // {date, start_time}
  const [vtDate,    setVtDate]    = useState('')
  const [vtStart,   setVtStart]   = useState('')
  const [vtEnd,     setVtEnd]     = useState('')
  const [vtSaving,  setVtSaving]  = useState(false)
  const [vtError,   setVtError]   = useState('')
  const [detail,    setDetail]    = useState(null)   // event detail popup
  const scrollRef  = useRef(null)
  const touchStart = useRef(null)

  const sunday = addDays(monday, 6)
  const from   = toDateStr(monday)
  const to     = toDateStr(sunday)

  useEffect(() => {
    setLoading(true)
    api.get(`/agenda?from=${from}&to=${to}`)
      .then(r => setAgenda(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [from, to])

  // Scroll to 08:00 op mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HOUR_PX * 7
    }
  }, [])

  // Touch swipe navigation
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStart.current == null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    if (Math.abs(dx) > 60) {
      setMonday(m => addDays(m, dx < 0 ? 7 : -7))
    }
    touchStart.current = null
  }

  const prevWeek = () => setMonday(m => addDays(m, -7))
  const nextWeek = () => setMonday(m => addDays(m, 7))
  const goToday  = () => setMonday(getMonday(new Date()))

  // ── Events per dag ──────────────────────────────────────────────────────────
  function eventsForDay(dateStr) {
    const events = []

    // Groepslessen
    agenda.classes
      .filter(c => dtToDate(c.date_time) === dateStr)
      .forEach(c => events.push({
        type: 'class', id: `c-${c.id}`, raw: c,
        top: dtToPx(c.date_time),
        height: Math.max(durationPx(c.duration_minutes || 60), 28),
        label: c.name,
        sub: c.instructor,
        color: EVENT_COLORS.class,
      }))

    // PT boekingen
    agenda.pt_bookings
      .filter(b => dtToDate(b.date_time) === dateStr)
      .forEach(b => {
        const type = b.status === 'pending' ? 'pt_pending' : 'pt_confirmed'
        events.push({
          type, id: `pt-${b.id}`, raw: b,
          top: dtToPx(b.date_time),
          height: Math.max(durationPx(b.duration_minutes || 60), 28),
          label: isAdmin ? `PT — ${b.first_name} ${b.last_name}` : 'Personal Training',
          sub: b.trainer,
          color: EVENT_COLORS[type],
        })
      })

    // Vrij trainen
    agenda.vt_bookings
      .filter(v => v.date === dateStr)
      .forEach(v => events.push({
        type: 'vt', id: `vt-${v.id}`, raw: v,
        top: timeToPx(v.start_time),
        height: Math.max(timeToPx(v.end_time) - timeToPx(v.start_time), 28),
        label: isAdmin ? `VT — ${v.first_name} ${v.last_name}` : 'Vrij Trainen',
        sub: `${v.start_time} – ${v.end_time}`,
        color: EVENT_COLORS.vt,
      }))

    return events
  }

  // ── VT booking opslaan ──────────────────────────────────────────────────────
  const saveVtBooking = async () => {
    setVtError('')
    if (!vtDate || !vtStart || !vtEnd) { setVtError('Kies datum en tijden.'); return }
    setVtSaving(true)
    try {
      await api.post('/vt/bookings', { date: vtDate, start_time: vtStart, end_time: vtEnd })
      setVtModal(null)
      const r = await api.get(`/agenda?from=${from}&to=${to}`)
      setAgenda(r.data)
    } catch (e) {
      setVtError(e.response?.data?.error || 'Fout bij opslaan.')
    } finally { setVtSaving(false) }
  }

  const cancelVtBooking = async (id) => {
    try {
      await api.delete(`/vt/bookings/${id}`)
      const r = await api.get(`/agenda?from=${from}&to=${to}`)
      setAgenda(r.data)
      setDetail(null)
    } catch (e) {
      alert(e.response?.data?.error || 'Fout bij annuleren.')
    }
  }

  const headerDateFmt = (d) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  const today = toDateStr(new Date())

  // ── Nieuwe VT boeking modal openen ──────────────────────────────────────────
  const openVtModal = (dateStr, startSlot) => {
    const [h] = startSlot.split(':').map(Number)
    const endH = Math.min(h + 1, 22)
    setVtDate(dateStr)
    setVtStart(startSlot)
    setVtEnd(`${String(endH).padStart(2,'0')}:00`)
    setVtError('')
    setVtModal(true)
  }

  return (
    <div className="agenda-page">
      {/* ── Header ── */}
      <div className="agenda-header">
        <div className="agenda-header-top">
          <h1 className="agenda-title">Agenda</h1>
          <div className="agenda-nav-btns">
            <button className="btn btn-ghost btn-sm" onClick={goToday}>Vandaag</button>
            <button className="btn-icon" onClick={prevWeek}><ChevronLeft size={18}/></button>
            <button className="btn-icon" onClick={nextWeek}><ChevronRight size={18}/></button>
          </div>
        </div>
        <p className="agenda-week-label">
          {headerDateFmt(monday)} – {headerDateFmt(sunday)}
        </p>

        {/* Legenda */}
        <div className="agenda-legend">
          {Object.entries(EVENT_COLORS).map(([k, v]) => (
            <span key={k} className="legend-item">
              <span className="legend-dot" style={{ background: v.border }}/>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Kalender ── */}
      <div className="agenda-wrap"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Dag headers */}
        <div className="agenda-day-headers">
          <div className="time-gutter-header"/>
          {Array.from({ length: 7 }, (_,i) => {
            const d     = addDays(monday, i)
            const dStr  = toDateStr(d)
            const isToday = dStr === today
            return (
              <div key={i} className={`day-header${isToday ? ' today' : ''}`}>
                <span className="day-abbr">{DAY_NAMES[i]}</span>
                <span className="day-num">{d.getDate()}</span>
              </div>
            )
          })}
        </div>

        {/* Time grid */}
        <div className="agenda-scroll" ref={scrollRef}>
          <div className="agenda-grid" style={{ height: TOTAL_PX }}>
            {/* Time labels */}
            <div className="time-gutter">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="time-label" style={{ top: h * HOUR_PX }}>
                  {String(h).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {Array.from({ length: 7 }, (_, i) => {
              const d    = addDays(monday, i)
              const dStr = toDateStr(d)
              const evts = eventsForDay(dStr)
              const isToday = dStr === today

              return (
                <div key={i} className={`day-col${isToday ? ' today-col' : ''}`}>
                  {/* Hour lines */}
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="hour-line" style={{ top: h * HOUR_PX }} />
                  ))}

                  {/* Gym open zone 08:00-22:00 */}
                  <div className="gym-open-zone"
                    style={{ top: 8 * HOUR_PX, height: 14 * HOUR_PX }}
                  />

                  {/* VT click zones (gym open hours, only for VT members / admin) */}
                  {VT_SLOTS.map(slot => (
                    <div
                      key={slot}
                      className="vt-slot-zone"
                      style={{ top: timeToPx(slot), height: HOUR_PX }}
                      onClick={() => openVtModal(dStr, slot)}
                      title={`Boek vrij trainen om ${slot}`}
                    />
                  ))}

                  {/* Events */}
                  {evts.map(ev => (
                    <div
                      key={ev.id}
                      className="cal-event"
                      style={{
                        top: ev.top, height: ev.height,
                        background: ev.color.bg,
                        borderLeft: `3px solid ${ev.color.border}`,
                      }}
                      onClick={(e) => { e.stopPropagation(); setDetail(ev) }}
                    >
                      <span className="cal-event-label">{ev.label}</span>
                      {ev.height > 36 && <span className="cal-event-sub">{ev.sub}</span>}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Event detail popup ── */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h3>{detail.label}</h3>
              <button className="btn-icon" onClick={() => setDetail(null)}><X size={18}/></button>
            </div>
            <div style={{ padding: '1rem' }}>
              {detail.type === 'class' && (
                <>
                  <p><Clock size={14} style={{ display:'inline', marginRight:6 }}/>{new Date(detail.raw.date_time).toLocaleString('nl-NL',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</p>
                  <p style={{ marginTop:8 }}><User size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.instructor}</p>
                  <p style={{ marginTop:8 }}><Users size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.confirmed_bookings}/{detail.raw.max_capacity} deelnemers</p>
                  <p style={{ marginTop:8, color:'var(--text-muted)', fontSize:'0.85rem' }}>{detail.raw.location}</p>
                </>
              )}
              {(detail.type === 'pt_confirmed' || detail.type === 'pt_pending') && (
                <>
                  <p><Clock size={14} style={{ display:'inline', marginRight:6 }}/>{new Date(detail.raw.date_time).toLocaleString('nl-NL',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</p>
                  <p style={{ marginTop:8 }}><User size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.trainer}</p>
                  {isAdmin && detail.raw.first_name && <p style={{ marginTop:8 }}>Lid: {detail.raw.first_name} {detail.raw.last_name}</p>}
                  <p style={{ marginTop:8, color: detail.type === 'pt_pending' ? 'var(--warning)' : 'var(--success)', fontSize:'0.85rem', fontWeight:600 }}>
                    {detail.type === 'pt_pending' ? '⏳ Wacht op bevestiging' : '✓ Bevestigd'}
                  </p>
                </>
              )}
              {detail.type === 'vt' && (
                <>
                  <p><Clock size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.date} · {detail.raw.start_time} – {detail.raw.end_time}</p>
                  {isAdmin && detail.raw.first_name && <p style={{ marginTop:8 }}>Lid: {detail.raw.first_name} {detail.raw.last_name}</p>}
                  {(!isAdmin || detail.raw.user_id === user?.id) && (
                    <button className="btn btn-danger" style={{ marginTop:'1rem', width:'100%' }}
                      onClick={() => cancelVtBooking(detail.raw.id)}>
                      Annuleren
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── VT boeking modal ── */}
      {vtModal && (
        <div className="modal-overlay" onClick={() => setVtModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>Vrij trainen boeken</h3>
              <button className="btn-icon" onClick={() => setVtModal(null)}><X size={18}/></button>
            </div>
            <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              <div>
                <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>Datum</label>
                <input type="date" className="input" value={vtDate} min={today} onChange={e => setVtDate(e.target.value)} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                <div>
                  <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>Van</label>
                  <select className="input" value={vtStart} onChange={e => setVtStart(e.target.value)}>
                    {VT_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:'0.8rem', color:'var(--text-muted)', display:'block', marginBottom:4 }}>Tot</label>
                  <select className="input" value={vtEnd} onChange={e => setVtEnd(e.target.value)}>
                    {VT_SLOTS.filter(s => s > vtStart).concat(['22:00']).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              {vtError && <p style={{ color:'var(--error)', fontSize:'0.85rem' }}>{vtError}</p>}
              <button className="btn btn-primary" onClick={saveVtBooking} disabled={vtSaving}>
                {vtSaving ? 'Bezig...' : 'Bevestigen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ position:'fixed', bottom:'5rem', left:'50%', transform:'translateX(-50%)', background:'var(--surface)', borderRadius:'var(--r)', padding:'0.5rem 1rem', fontSize:'0.85rem', color:'var(--text-muted)' }}>
          Laden…
        </div>
      )}
    </div>
  )
}
