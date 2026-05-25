import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X, Clock, User, Users, Check, Plus } from 'lucide-react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

// ── Constanten ────────────────────────────────────────────────────────────────
const DAY_NAMES  = ['ma','di','wo','do','vr','za','zo']
const HOUR_PX    = 56   // hoogte per uur in pixels
const TOTAL_PX   = HOUR_PX * 24

function getMonday(d) {
  const date = new Date(d)
  const day  = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  date.setHours(0,0,0,0)
  return date
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
// Use local date parts — avoids UTC midnight timezone shift that displaces days
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function timeToPx(hhmm){ const [h,m] = hhmm.split(':').map(Number); return (h*60+m)/60*HOUR_PX }
function dtToPx(iso)   { const d = new Date(iso); return (d.getHours()*60+d.getMinutes())/60*HOUR_PX }
// Extract date from ISO string directly — datetime-local is already local time
function dtToDate(iso) { return iso ? iso.substring(0, 10) : '' }
function durationPx(m) { return (m/60)*HOUR_PX }

// Status → kleur / label mapping voor VT slots
function vtSlotColor(slot) {
  if (!slot) return { bg: 'rgba(100,100,100,0.5)', border: '#666', label: '' }
  if (slot.my_status === 'confirmed' || slot.status_override === 'confirmed') {
    return { bg: 'rgba(34,197,94,0.85)',  border: '#22c55e', label: 'Bevestigd' }
  }
  if (slot.my_status === 'requested' || slot.status_override === 'requested') {
    return { bg: 'rgba(245,158,11,0.85)', border: '#f59e0b', label: 'Aangevraagd' }
  }
  const isFull = Number(slot.booking_count) >= Number(slot.max_bookings)
  if (isFull) {
    return { bg: 'rgba(100,100,100,0.5)', border: '#666', label: 'Vol' }
  }
  return { bg: 'rgba(34,197,94,0.3)',  border: '#22c55e', label: 'Beschikbaar' }
}

// Status labels voor admin VT slot
function vtAdminLabel(slot) {
  const pending   = Number(slot.pending_count || 0)
  const confirmed = Number(slot.confirmed_count || 0)
  const isFull    = Number(slot.booking_count) >= Number(slot.max_bookings)
  if (isFull)     return { label: 'Vol', color: '#ef4444' }
  if (pending > 0) return { label: `${pending} aanvraag${pending>1?'en':''}`, color: '#f59e0b' }
  if (confirmed > 0) return { label: 'Bevestigd', color: '#22c55e' }
  return { label: 'Beschikbaar', color: '#22c55e' }
}

// Admin: VT slot aanmaken form
const VT_HOUR_OPTIONS = []
for (let h = 8; h <= 22; h++) VT_HOUR_OPTIONS.push(`${String(h).padStart(2,'0')}:00`)

export default function AgendaPage() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin'

  const [monday,    setMonday]    = useState(getMonday(new Date()))
  const [agenda,    setAgenda]    = useState({ classes:[], pt_bookings:[], pt_available:[], vt_slots:[] })
  const [loading,   setLoading]   = useState(true)
  const [detail,    setDetail]    = useState(null)   // event detail popup
  const [vtReqSlot, setVtReqSlot] = useState(null)   // slot die lid wil aanvragen
  const [vtReqNote, setVtReqNote] = useState('')
  const [vtSaving,  setVtSaving]  = useState(false)
  const [vtError,   setVtError]   = useState('')
  // Admin: VT slot aanmaken
  const [showNewSlot,   setShowNewSlot]   = useState(false)
  const [newSlot,       setNewSlot]       = useState({ date:'', start_time:'08:00', end_time:'10:00', max_bookings:10, notes:'' })
  // Admin: PT slot aanmaken
  const [showNewPtSlot, setShowNewPtSlot] = useState(false)
  const [newPtSlot,     setNewPtSlot]     = useState({ date_time:'', duration_minutes:60, trainer:'Mohammed', notes:'' })
  // Admin: direct lid boeken
  const [directBook, setDirectBook]  = useState(null)  // {slot}
  const [members,    setMembers]      = useState([])
  const [selMember,  setSelMember]    = useState('')
  // VT weekgebruik (leden)
  const [vtWeekUsage, setVtWeekUsage] = useState(0)
  const [vtWeekLimit, setVtWeekLimit] = useState(3)

  const scrollRef  = useRef(null)
  const touchStart = useRef(null)

  const sunday = addDays(monday, 6)
  const from   = toDateStr(monday)
  const to     = toDateStr(sunday)
  const today  = toDateStr(new Date())

  const reload = () => {
    setLoading(true)
    api.get(`/agenda?from=${from}&to=${to}`)
      .then(r => {
        setAgenda(r.data)
        if (!isAdmin) {
          setVtWeekUsage(r.data.vt_week_usage ?? 0)
          setVtWeekLimit(r.data.vt_week_limit ?? 3)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(reload, [from, to])

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = HOUR_PX * 7 }, [])

  // Load members for direct booking
  useEffect(() => {
    if (isAdmin) {
      api.get('/admin/members').then(r => setMembers(r.data.members || [])).catch(() => {})
    }
  }, [isAdmin])

  // Touch swipe
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStart.current == null) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    if (Math.abs(dx) > 60) setMonday(m => addDays(m, dx < 0 ? 7 : -7))
    touchStart.current = null
  }

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
        bg: 'rgba(59,130,246,0.85)', border: '#3b82f6',
      }))

    // PT boekingen (bevestigd/pending)
    agenda.pt_bookings
      .filter(b => dtToDate(b.date_time) === dateStr)
      .forEach(b => {
        const isPending = b.status === 'pending'
        events.push({
          type: isPending ? 'pt_pending' : 'pt_confirmed', id: `pt-${b.id}`, raw: b,
          top: dtToPx(b.date_time),
          height: Math.max(durationPx(b.duration_minutes || 60), 28),
          label: isAdmin ? `PT — ${b.first_name} ${b.last_name}` : 'Personal Training',
          sub: b.trainer,
          bg: isPending ? 'rgba(245,158,11,0.85)' : 'rgba(239,68,68,0.85)',
          border: isPending ? '#f59e0b' : '#ef4444',
        })
      })

    // PT beschikbare slots (admin view only)
    if (isAdmin) {
      ;(agenda.pt_available || [])
        .filter(s => dtToDate(s.date_time) === dateStr)
        .forEach(s => events.push({
          type: 'pt_available', id: `pta-${s.id}`, raw: s,
          top: dtToPx(s.date_time),
          height: Math.max(durationPx(s.duration_minutes || 60), 28),
          label: `PT — beschikbaar`,
          sub: s.trainer,
          bg: 'rgba(239,68,68,0.25)', border: '#ef4444',
        }))
    }

    // VT slots
    ;(agenda.vt_slots || [])
      .filter(s => s.date === dateStr)
      .forEach(s => {
        const col = isAdmin
          ? (() => {
              const { label, color } = vtAdminLabel(s)
              const pending = Number(s.pending_count || 0)
              return {
                bg: pending > 0 ? 'rgba(245,158,11,0.75)' : 'rgba(34,197,94,0.55)',
                border: pending > 0 ? '#f59e0b' : '#22c55e',
                statusLabel: label,
              }
            })()
          : (() => {
              const c = vtSlotColor(s)
              return { bg: c.bg, border: c.border, statusLabel: c.label }
            })()

        events.push({
          type: 'vt_slot', id: `vt-${s.id}`, raw: s,
          top: timeToPx(s.start_time),
          height: Math.max(timeToPx(s.end_time) - timeToPx(s.start_time), 36),
          label: isAdmin ? `VT — ${col.statusLabel}` : `Vrij Trainen — ${col.statusLabel}`,
          sub: `${s.start_time}–${s.end_time}`,
          bg: col.bg, border: col.border,
        })
      })

    return events
  }

  // ── VT slot aanvragen (lid) ──────────────────────────────────────────────────
  const requestVt = async () => {
    if (!vtReqSlot) return
    setVtSaving(true); setVtError('')
    try {
      await api.post(`/vt/slots/${vtReqSlot.id}/book`, { notes: vtReqNote })
      setVtReqSlot(null); setVtReqNote('')
      reload()
    } catch (e) {
      setVtError(e.response?.data?.error || 'Fout bij aanvragen.')
    } finally { setVtSaving(false) }
  }

  const cancelVt = async (bookingId) => {
    try {
      await api.delete(`/vt/bookings/${bookingId}`)
      setDetail(null); reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout bij annuleren.') }
  }

  // ── Admin: VT slot aanmaken ──────────────────────────────────────────────────
  const createSlot = async () => {
    if (!newSlot.date || !newSlot.start_time || !newSlot.end_time) {
      return alert('Vul alle velden in.')
    }
    try {
      await api.post('/vt/admin/slots', newSlot)
      setShowNewSlot(false)
      setNewSlot({ date:'', start_time:'08:00', end_time:'10:00', max_bookings:10, notes:'' })
      reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  // ── Admin: PT slot aanmaken ──────────────────────────────────────────────────
  const createPtSlot = async () => {
    if (!newPtSlot.date_time) return alert('Vul datum en tijd in.')
    try {
      await api.post('/pt/slots', newPtSlot)
      setShowNewPtSlot(false)
      setNewPtSlot({ date_time:'', duration_minutes:60, trainer:'Mohammed', notes:'' })
      reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  // ── Admin: bevestig/weiger booking ──────────────────────────────────────────
  const confirmVtBooking = async (bookingId) => {
    await api.put(`/vt/admin/bookings/${bookingId}/confirm`)
    setDetail(null); reload()
  }
  const declineVtBooking = async (bookingId) => {
    await api.put(`/vt/admin/bookings/${bookingId}/decline`)
    setDetail(null); reload()
  }

  // ── Admin: direct lid boeken ─────────────────────────────────────────────────
  const doDirectBook = async () => {
    if (!selMember) return
    try {
      await api.post(`/vt/admin/slots/${directBook.id}/book-member`, { user_id: parseInt(selMember) })
      setDirectBook(null); setSelMember(''); setDetail(null); reload()
    } catch (e) { alert(e.response?.data?.error || 'Fout') }
  }

  // ── Slot click handler ────────────────────────────────────────────────────────
  const onSlotClick = (ev) => {
    if (ev.type === 'vt_slot') {
      if (isAdmin) {
        setDetail(ev)
      } else {
        const s = ev.raw
        if (s.my_booking_id) {
          // al geboekt — toon detail met annuleer knop
          setDetail(ev)
        } else {
          const isFull = Number(s.booking_count) >= Number(s.max_bookings)
          if (!isFull) {
            setVtReqSlot(s)
            setVtReqNote('')
            setVtError('')
          }
        }
      }
    } else {
      setDetail(ev)
    }
  }

  const headerDateFmt = (d) => d.toLocaleDateString('nl-NL', { day:'numeric', month:'short' })

  return (
    <div className="agenda-page">
      {/* ── Header ── */}
      <div className="agenda-header">
        <div className="agenda-header-top">
          <h1 className="agenda-title">Agenda</h1>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            {isAdmin && (
              <>
                <button className="btn btn-primary btn-sm"
                  onClick={() => { setShowNewPtSlot(s => !s); setShowNewSlot(false) }}>
                  <Plus size={13}/> PT slot
                </button>
                <button className="btn btn-primary btn-sm"
                  onClick={() => { setShowNewSlot(s => !s); setShowNewPtSlot(false) }}>
                  <Plus size={13}/> VT slot
                </button>
              </>
            )}
            {!isAdmin && vtWeekLimit > 0 && (
              <span style={{
                fontSize:'0.78rem', padding:'3px 10px', borderRadius:12,
                background: vtWeekUsage >= vtWeekLimit ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                color: vtWeekUsage >= vtWeekLimit ? 'var(--error)' : 'var(--success)',
                fontWeight: 600,
              }}>
                {vtWeekUsage}/{vtWeekLimit} VT deze week
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setMonday(getMonday(new Date()))}>Vandaag</button>
            <button className="btn-icon" onClick={() => setMonday(m => addDays(m,-7))}><ChevronLeft size={18}/></button>
            <button className="btn-icon" onClick={() => setMonday(m => addDays(m, 7))}><ChevronRight size={18}/></button>
          </div>
        </div>
        <p className="agenda-week-label">{headerDateFmt(monday)} – {headerDateFmt(sunday)}</p>

        {/* Legenda */}
        <div className="agenda-legend">
          {[
            ['#3b82f6','Groepslessen'],
            ['#ef4444','Personal Training'],
            ['#f59e0b','Aangevraagd'],
            ['#22c55e','Vrij Trainen'],
          ].map(([color, label]) => (
            <span key={label} className="legend-item">
              <span className="legend-dot" style={{ background: color }}/>{label}
            </span>
          ))}
        </div>

        {/* Admin: nieuw PT slot form */}
        {isAdmin && showNewPtSlot && (
          <div className="card" style={{ marginTop:'1rem', padding:'1rem', borderColor:'rgba(239,68,68,0.4)' }}>
            <h3 style={{ marginBottom:'0.75rem', fontSize:'0.95rem', color:'var(--error)' }}>PT slot aanmaken</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'0.6rem' }}>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Datum & tijd</label>
                <input className="input" type="datetime-local"
                  value={newPtSlot.date_time} onChange={e => setNewPtSlot({...newPtSlot,date_time:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Trainer</label>
                <select className="input" value={newPtSlot.trainer} onChange={e => setNewPtSlot({...newPtSlot,trainer:e.target.value})}>
                  {['Mohammed','Ecrin','Joep'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Duur (min)</label>
                <input className="input" type="number" min="15" max="120" step="15"
                  value={newPtSlot.duration_minutes} onChange={e => setNewPtSlot({...newPtSlot,duration_minutes:parseInt(e.target.value)})}/>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Notities</label>
                <input className="input" placeholder="Optioneel..."
                  value={newPtSlot.notes} onChange={e => setNewPtSlot({...newPtSlot,notes:e.target.value})}/>
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem' }}>
              <button className="btn btn-primary btn-sm" onClick={createPtSlot}><Check size={13}/> Aanmaken</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewPtSlot(false)}><X size={13}/> Annuleren</button>
            </div>
          </div>
        )}

        {/* Admin: nieuw VT slot form */}
        {isAdmin && showNewSlot && (
          <div className="card" style={{ marginTop:'1rem', padding:'1rem', borderColor:'rgba(34,197,94,0.4)' }}>
            <h3 style={{ marginBottom:'0.75rem', fontSize:'0.95rem', color:'var(--success)' }}>VT slot aanmaken</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:'0.6rem' }}>
              <div>
                <label className="input-label">Datum</label>
                <input className="input" type="date" min={today}
                  value={newSlot.date} onChange={e => setNewSlot({...newSlot,date:e.target.value})}/>
              </div>
              <div>
                <label className="input-label">Van</label>
                <select className="input" value={newSlot.start_time} onChange={e => setNewSlot({...newSlot,start_time:e.target.value})}>
                  {VT_HOUR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Tot</label>
                <select className="input" value={newSlot.end_time} onChange={e => setNewSlot({...newSlot,end_time:e.target.value})}>
                  {VT_HOUR_OPTIONS.filter(o => o > newSlot.start_time).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Max pers.</label>
                <input className="input" type="number" min="1" max="50"
                  value={newSlot.max_bookings} onChange={e => setNewSlot({...newSlot,max_bookings:parseInt(e.target.value)})}/>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label className="input-label">Notities</label>
                <input className="input" placeholder="Optioneel..."
                  value={newSlot.notes} onChange={e => setNewSlot({...newSlot,notes:e.target.value})}/>
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem' }}>
              <button className="btn btn-primary btn-sm" onClick={createSlot}><Check size={13}/> Aanmaken</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewSlot(false)}><X size={13}/> Annuleren</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Kalender ── */}
      <div className="agenda-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Dag headers */}
        <div className="agenda-day-headers">
          <div className="time-gutter-header"/>
          {Array.from({ length: 7 }, (_,i) => {
            const d    = addDays(monday, i)
            const dStr = toDateStr(d)
            return (
              <div key={i} className={`day-header${dStr===today?' today':''}`}>
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
              {Array.from({ length: 24 }, (_,h) => (
                <div key={h} className="time-label" style={{ top: h*HOUR_PX }}>
                  {String(h).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {Array.from({ length: 7 }, (_,i) => {
              const d    = addDays(monday, i)
              const dStr = toDateStr(d)
              const evts = eventsForDay(dStr)
              return (
                <div key={i} className={`day-col${dStr===today?' today-col':''}`}>
                  {Array.from({ length: 24 }, (_,h) => (
                    <div key={h} className="hour-line" style={{ top: h*HOUR_PX }}/>
                  ))}
                  <div className="gym-open-zone" style={{ top:8*HOUR_PX, height:14*HOUR_PX }}/>
                  {evts.map(ev => (
                    <div
                      key={ev.id}
                      className="cal-event"
                      style={{ top:ev.top, height:ev.height, background:ev.bg, borderLeft:`3px solid ${ev.border}` }}
                      onClick={e => { e.stopPropagation(); onSlotClick(ev) }}
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
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
            <div className="modal-header">
              <h3>{detail.label}</h3>
              <button className="btn-icon" onClick={() => setDetail(null)}><X size={18}/></button>
            </div>
            <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>

              {detail.type === 'class' && (
                <>
                  <p><Clock size={14} style={{ display:'inline', marginRight:6 }}/>
                    {new Date(detail.raw.date_time).toLocaleString('nl-NL',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}
                  </p>
                  <p><User size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.instructor}</p>
                  <p><Users size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.confirmed_bookings}/{detail.raw.max_capacity} deelnemers</p>
                  <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{detail.raw.location}</p>
                </>
              )}

              {(detail.type === 'pt_confirmed' || detail.type === 'pt_pending' || detail.type === 'pt_available') && (
                <>
                  <p><Clock size={14} style={{ display:'inline', marginRight:6 }}/>
                    {new Date(detail.raw.date_time).toLocaleString('nl-NL',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}
                  </p>
                  <p><User size={14} style={{ display:'inline', marginRight:6 }}/>{detail.raw.trainer}</p>
                  {isAdmin && detail.raw.first_name && <p>Lid: {detail.raw.first_name} {detail.raw.last_name}</p>}
                  {detail.type !== 'pt_available' && (
                    <p style={{ color: detail.type==='pt_pending'?'var(--warning)':'var(--success)', fontWeight:600 }}>
                      {detail.type==='pt_pending' ? '⏳ Wacht op bevestiging' : '✓ Bevestigd'}
                    </p>
                  )}
                  {detail.type === 'pt_available' && <p style={{ color:'var(--text-muted)' }}>Nog beschikbaar</p>}
                </>
              )}

              {detail.type === 'vt_slot' && (() => {
                const s = detail.raw
                return (
                  <>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <p style={{ fontWeight:600 }}>{s.date}</p>
                        <p style={{ color:'var(--text-muted)' }}>{s.start_time} – {s.end_time}</p>
                      </div>
                      <div style={{ textAlign:'right', fontSize:'0.85rem', color:'var(--text-muted)' }}>
                        {s.booking_count}/{s.max_bookings} pers.
                      </div>
                    </div>
                    {s.notes && <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{s.notes}</p>}

                    {/* Admin view: boekingen + acties */}
                    {isAdmin && (
                      <>
                        {(s.bookings || []).length > 0 && (
                          <div>
                            <p style={{ fontWeight:600, fontSize:'0.85rem', marginBottom:'0.5rem' }}>Boekingen:</p>
                            {s.bookings.map(b => (
                              <div key={b.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.4rem 0.6rem', background:'var(--surface-2)', borderRadius:6, marginBottom:4 }}>
                                <div style={{ fontSize:'0.85rem' }}>
                                  <span style={{ fontWeight:600 }}>{b.first_name} {b.last_name}</span>
                                  <span style={{ marginLeft:8, color:b.status==='confirmed'?'var(--success)':'var(--warning)', fontSize:'0.78rem' }}>
                                    {b.status==='confirmed' ? '✓ Bevestigd' : '⏳ Aangevraagd'}
                                  </span>
                                </div>
                                <div style={{ display:'flex', gap:4 }}>
                                  {b.status === 'requested' && (
                                    <>
                                      <button className="btn btn-sm" style={{ background:'var(--success-dim)',color:'var(--success)',padding:'2px 8px',fontSize:'0.78rem' }}
                                        onClick={() => confirmVtBooking(b.id)}><Check size={11}/></button>
                                      <button className="btn btn-danger btn-sm" style={{ padding:'2px 8px',fontSize:'0.78rem' }}
                                        onClick={() => declineVtBooking(b.id)}><X size={11}/></button>
                                    </>
                                  )}
                                  {b.status === 'confirmed' && (
                                    <button className="btn btn-ghost btn-sm" style={{ padding:'2px 8px',fontSize:'0.78rem' }}
                                      onClick={() => api.put(`/vt/admin/bookings/${b.id}/decline`).then(() => { setDetail(null); reload() })}>
                                      <X size={11}/>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Direct lid boeken */}
                        {Number(s.booking_count) < Number(s.max_bookings) && (
                          directBook?.id === s.id ? (
                            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                              <label className="input-label">Kies lid</label>
                              <select className="input" value={selMember} onChange={e => setSelMember(e.target.value)}>
                                <option value="">— Selecteer lid —</option>
                                {members.map(m => (
                                  <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.email})</option>
                                ))}
                              </select>
                              <div style={{ display:'flex', gap:'0.5rem' }}>
                                <button className="btn btn-primary btn-sm" onClick={doDirectBook}><Check size={13}/> Boeken</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setDirectBook(null)}><X size={13}/></button>
                              </div>
                            </div>
                          ) : (
                            <button className="btn btn-outline btn-sm" onClick={() => setDirectBook(s)}>
                              <Plus size={13}/> Direct lid boeken
                            </button>
                          )
                        )}

                        <button className="btn btn-danger btn-sm" onClick={async () => {
                          if (!confirm('Slot verwijderen? Alle aanvragen worden geannuleerd.')) return
                          await api.delete(`/vt/admin/slots/${s.id}`)
                          setDetail(null); reload()
                        }}>
                          Slot verwijderen
                        </button>
                      </>
                    )}

                    {/* Lid view */}
                    {!isAdmin && s.my_booking_id && (
                      <button className="btn btn-danger" style={{ width:'100%' }}
                        onClick={() => cancelVt(s.my_booking_id)}>
                        {s.my_status === 'requested' ? 'Aanvraag intrekken' : 'Annuleren'}
                      </button>
                    )}
                  </>
                )
              })()}

            </div>
          </div>
        </div>
      )}

      {/* ── VT aanvraag modal (lid) ── */}
      {vtReqSlot && (
        <div className="modal-overlay" onClick={() => setVtReqSlot(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth:380 }}>
            <div className="modal-header">
              <h3>Vrij Trainen aanvragen</h3>
              <button className="btn-icon" onClick={() => setVtReqSlot(null)}><X size={18}/></button>
            </div>
            <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              <div style={{ padding:'0.75rem', background:'var(--surface-2)', borderRadius:8 }}>
                <p style={{ fontWeight:700 }}>{vtReqSlot.date}</p>
                <p style={{ color:'var(--text-muted)' }}>{vtReqSlot.start_time} – {vtReqSlot.end_time}</p>
                <p style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:4 }}>
                  {vtReqSlot.booking_count}/{vtReqSlot.max_bookings} plekken bezet
                </p>
              </div>

              {/* Weekgebruik badge */}
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                padding:'0.5rem', borderRadius:8,
                background: vtWeekUsage >= vtWeekLimit ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              }}>
                <span style={{ fontSize:'0.82rem', fontWeight:600,
                  color: vtWeekUsage >= vtWeekLimit ? 'var(--error)' : 'var(--success)' }}>
                  {vtWeekUsage}/{vtWeekLimit} sessies deze week gebruikt
                </span>
              </div>

              {vtWeekUsage >= vtWeekLimit ? (
                <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid var(--error)', borderRadius:8, padding:'0.75rem', fontSize:'0.85rem', color:'var(--error)' }}>
                  Je hebt je weeklimiet van {vtWeekLimit}x vrij trainen bereikt.
                </div>
              ) : (
                <>
                  <div>
                    <label className="input-label">Opmerking (optioneel)</label>
                    <input className="input" placeholder="Bijv. focusgebied…" value={vtReqNote} onChange={e => setVtReqNote(e.target.value)}/>
                  </div>
                  {vtError && <p style={{ color:'var(--error)', fontSize:'0.85rem' }}>{vtError}</p>}
                  <p style={{ fontSize:'0.82rem', color:'var(--text-muted)' }}>
                    De admin bevestigt je aanvraag zo snel mogelijk. Je ontvangt een melding.
                  </p>
                  <button className="btn btn-primary" onClick={requestVt} disabled={vtSaving}>
                    {vtSaving ? 'Bezig...' : 'Aanvraag indienen'}
                  </button>
                </>
              )}
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
