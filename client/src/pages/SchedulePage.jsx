import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Clock, MapPin, User, Users, ChevronLeft, ChevronRight, X, AlertCircle } from 'lucide-react'
import api from '../api'
import PtBookingModal from '../components/PtBookingModal'

// ── Class badge helpers (cosmetic labelling only) ────────────────────────────
// These never decide WHAT is shown — every class fetched from the backend is
// always displayed (see the "alle" filter below). They only prettify the tab
// grouping/badge for the categories this gym happens to use today; a brand
// new category an admin adds later still shows up fine (falls back to its
// raw name) and automatically gets its own filter tab.
const KNOWN_GROUPS = [
  { key: 'kickboksen',  label: '🥊 Kickboksen',  match: (c) => c.startsWith('kickboksen') },
  { key: 'boksen',      label: '🥊 Boksen',      match: (c) => c.startsWith('boksen') },
  { key: 'ladies-only', label: '🌸 Ladies-Only', match: (c) => c.includes('ladies-only') },
  { key: 'jeugd',       label: '🎯 Jeugd',       match: (c) => c === 'jeugd' || c.includes('jeugd') },
  { key: 'kids',        label: '⭐ Kids',        match: (c) => c.includes('kids') },
  { key: 'recreanten',  label: '💪 Recreanten',  match: (c) => c.includes('recreanten') },
]

function prettyCategory(cat) {
  if (!cat) return ''
  return cat.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function getBadgeClass(category) {
  if (!category) return 'badge-muted'
  if (category.includes('ladies-only')) return 'badge-ladies-only'
  if (category.includes('jeugd'))       return 'badge-jeugd'
  if (category.includes('kids'))        return 'badge-kids'
  if (category.includes('recreanten'))  return 'badge-recreanten'
  if (category.startsWith('kickboksen')) return 'badge-kickboksen'
  if (category.startsWith('boksen'))    return 'badge-boksen'
  return 'badge-muted'
}

const BADGE_LABEL = {
  'kickboksen-kids':        'Kids',
  'kickboksen-recreanten':  'Recreanten',
  'kickboksen-ladies-only': 'Ladies-Only',
  'kickboksen-jeugd':       'Jeugd',
  'boksen-recreanten':      'Recreanten',
  'boksen-ladies-only':     'Ladies-Only',
  'jeugd':                  'Jeugd',
}
const getBadgeLabel = (cat) => BADGE_LABEL[cat] ?? prettyCategory(cat)

// ── Date helpers ───────────────────────────────────────────────────────────
function formatTime(str) {
  return new Date(str).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getWeekStart(offset = 0) {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7) // Monday
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const [allClasses,  setAllClasses]  = useState([])  // full week, unfiltered
  const [myBookings,  setMyBookings]  = useState([])
  const [ptSlots,     setPtSlots]     = useState([])
  const [myPtBookings, setMyPtBookings] = useState([])
  const [ptBalance,   setPtBalance]   = useState(null)
  const [vtSlots,     setVtSlots]     = useState([])
  const [category,    setCategory]    = useState('alle')
  const [weekOffset,  setWeekOffset]  = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [busyKey,     setBusyKey]     = useState(null)
  const [flash,       setFlash]       = useState(null)
  const [ptModalSlot, setPtModalSlot] = useState(null)
  const [vtModalSlot, setVtModalSlot] = useState(null)
  const [vtNote,      setVtNote]      = useState('')
  const [vtSaving,    setVtSaving]    = useState(false)
  const [vtError,     setVtError]     = useState('')

  const weekStart = getWeekStart(weekOffset)
  const weekEnd   = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Alle bestaande, boekbare activiteitstypes uit de bestaande backend —
      // groepslessen, PT-slots en Vrij Trainen-slots — worden hier samengevoegd.
      // Elk type gebruikt zijn eigen bestaande endpoint en boekingslogica.
      const [classRes, bookingRes, ptSlotRes, ptBookingRes, vtRes] = await Promise.all([
        api.get('/classes', { params: { from: weekStart.toISOString(), to: weekEnd.toISOString() } }),
        api.get('/bookings'),
        api.get('/pt/slots', { params: { from: weekStart.toISOString(), to: weekEnd.toISOString() } }),
        api.get('/pt/bookings/mine'),
        api.get('/vt/slots', { params: { from: toDateStr(weekStart), to: toDateStr(weekEnd) } }),
      ])
      setAllClasses(classRes.data.classes)
      setMyBookings(bookingRes.data.bookings)
      setPtSlots(ptSlotRes.data.slots)
      setMyPtBookings(ptBookingRes.data.bookings)
      setVtSlots(vtRes.data.slots || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [weekOffset])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/pt/balance').then((r) => setPtBalance(r.data)).catch(() => setPtBalance(null))
  }, [])

  // ── Dynamische categorie-tabs ──────────────────────────────────────────────
  const presentCats = [...new Set(allClasses.map((c) => c.category).filter(Boolean))]
  const presentGroups = KNOWN_GROUPS.filter((g) => presentCats.some((c) => g.match(c)))
  const leftoverCats = presentCats.filter((c) => !KNOWN_GROUPS.some((g) => g.match(c)))
  const classTabs = [
    ...presentGroups.map((g) => ({ key: g.key, label: g.label, match: g.match })),
    ...leftoverCats.map((c) => ({ key: c, label: getBadgeLabel(c), match: (x) => x === c })),
  ]
  const TABS = [
    { key: 'alle', label: 'Alle activiteiten' },
    ...classTabs,
    { key: 'pt', label: '🥊 Personal Training' },
    { key: 'vt', label: '🏋️ Vrij Trainen' },
  ]

  const bookedClassIds = new Set(myBookings.filter((b) => b.status === 'confirmed').map((b) => b.class_id))
  const getClassBooking = (classId) => myBookings.find((b) => b.class_id === classId && b.status === 'confirmed')

  const bookedPtSlotIds = new Set(myPtBookings.filter((b) => b.status !== 'cancelled' && b.status !== 'declined').map((b) => b.slot_id))
  const getPtBooking = (slotId) => myPtBookings.find((b) => b.slot_id === slotId && b.status !== 'cancelled' && b.status !== 'declined')
  const hasPtBalance = ptBalance && (ptBalance.total_remaining > 0 || ptBalance.subscription?.status === 'active')

  // ── Items samenvoegen tot één lijst, per tab gefilterd ──────────────────────
  const classItems = allClasses.map((c) => ({ type: 'class', id: c.id, date: new Date(c.date_time), raw: c }))
  const ptItems     = ptSlots.map((s) => ({ type: 'pt', id: s.id, date: new Date(s.date_time), raw: s }))
  const vtItems     = vtSlots.map((s) => ({ type: 'vt', id: s.id, date: new Date(`${s.date}T${s.start_time}`), raw: s }))

  let items
  if (category === 'alle') items = [...classItems, ...ptItems, ...vtItems]
  else if (category === 'pt') items = ptItems
  else if (category === 'vt') items = vtItems
  else {
    const tab = classTabs.find((t) => t.key === category)
    items = tab ? classItems.filter((it) => tab.match(it.raw.category)) : classItems
  }

  const showFlash = (msg, type = 'success') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  // ── Groepsles boeken/annuleren ───────────────────────────────────────────
  const handleBookClass = async (classId) => {
    setBusyKey(`class-${classId}`)
    try {
      await api.post('/bookings', { class_id: classId })
      showFlash('Les gereserveerd! ✓')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Reserveren mislukt.', 'error')
    } finally {
      setBusyKey(null)
    }
  }
  const handleCancelClass = async (booking) => {
    setBusyKey(`class-${booking.class_id}`)
    try {
      await api.delete(`/bookings/${booking.id}`)
      showFlash('Reservering geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    } finally {
      setBusyKey(null)
    }
  }

  // ── PT annuleren (boeken gaat via PtBookingModal) ────────────────────────
  const handleCancelPt = async (bookingId, slotId) => {
    if (!confirm('Boeking annuleren? Bij annulering >24h voor de sessie krijg je de les terug.')) return
    setBusyKey(`pt-${slotId}`)
    try {
      await api.put(`/pt/bookings/${bookingId}/cancel`)
      showFlash('PT-boeking geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    } finally {
      setBusyKey(null)
    }
  }

  // ── Vrij Trainen aanvragen/annuleren ─────────────────────────────────────
  const submitVtRequest = async () => {
    if (!vtModalSlot) return
    setVtSaving(true); setVtError('')
    try {
      await api.post(`/vt/slots/${vtModalSlot.id}/book`, { notes: vtNote })
      setVtModalSlot(null); setVtNote('')
      showFlash('Aanvraag ingediend! Wacht op bevestiging van de admin.')
      load()
    } catch (e) {
      setVtError(e.response?.data?.error || 'Aanvragen mislukt.')
    } finally {
      setVtSaving(false)
    }
  }
  const handleCancelVt = async (bookingId, slotId) => {
    if (!confirm('Aanvraag/boeking annuleren?')) return
    setBusyKey(`vt-${slotId}`)
    try {
      await api.delete(`/vt/bookings/${bookingId}`)
      showFlash('Vrij Trainen geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    } finally {
      setBusyKey(null)
    }
  }

  // Group by day (after filter)
  const byDay = items.reduce((acc, item) => {
    const day = item.date.toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(item)
    return acc
  }, {})

  const weekLabel = `${weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}`

  return (
    <div className="page">
      {/* Flash */}
      {flash && (
        <div className={`alert alert-${flash.type}`} style={{ marginBottom: '1rem', position: 'sticky', top: '72px', zIndex: 50 }}>
          {flash.msg}
        </div>
      )}

      <div className="page-header">
        <h1>Les boeken</h1>
        <p>Reserveer groepslessen, Personal Training en Vrij Trainen</p>
      </div>

      {/* Week navigator — altijd zichtbaar, ook als de huidige week leeg is */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: '0.25rem',
        }}>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o - 1)} style={{ width: 28, height: 28 }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{
            fontSize: '0.85rem', fontWeight: 600, padding: '0 0.5rem',
            color: 'var(--text-2)', minWidth: 180, textAlign: 'center',
          }}>
            {weekLabel}
          </span>
          <button className="btn-icon" onClick={() => setWeekOffset((o) => o + 1)} style={{ width: 28, height: 28, color: 'var(--text-muted)' }}>
            <ChevronRight size={16} />
          </button>
        </div>
        {weekOffset !== 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)}>Huidige week</button>
        )}
      </div>

      {/* Category filter tabs */}
      <div className="filter-bar" style={{ marginBottom: '1.75rem' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`filter-btn${category === tab.key ? ' active' : ''}`}
            onClick={() => setCategory(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Activities */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : Object.keys(byDay).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>Geen activiteiten gevonden</h3>
          <p>Er is niets gepland in {weekLabel}. Blader naar een andere week hierboven, of kies een andere categorie.</p>
        </div>
      ) : (
        Object.entries(byDay)
          .sort(([a], [b]) => new Date(a) - new Date(b))
          .map(([day, dayItems]) => (
            <div key={day} style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--text-2)', textTransform: 'capitalize' }}>
                {new Date(day).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div className="classes-grid">
                {dayItems
                  .sort((a, b) => a.date - b.date)
                  .map((item) => {
                    if (item.type === 'class') return renderClassCard(item)
                    if (item.type === 'pt')    return renderPtCard(item)
                    return renderVtCard(item)
                  })}
              </div>
            </div>
          ))
      )}

      {ptModalSlot && (
        <PtBookingModal
          slot={ptModalSlot}
          balance={ptBalance}
          onClose={() => setPtModalSlot(null)}
          onBooked={() => { setPtModalSlot(null); load(); showFlash('PT-sessie geboekt! Wacht op bevestiging van de trainer. 💪') }}
        />
      )}

      {vtModalSlot && (
        <div className="modal-overlay" onClick={() => setVtModalSlot(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3>🏋️ Vrij Trainen aanvragen</h3>
              <button className="btn-icon" onClick={() => setVtModalSlot(null)}><X size={18} /></button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
                <p style={{ fontWeight: 700, color: '#22c55e' }}>{vtModalSlot.date}</p>
                <p style={{ color: 'var(--text-2)', fontSize: '1rem', fontWeight: 600 }}>{vtModalSlot.start_time} – {vtModalSlot.end_time}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {vtModalSlot.booking_count}/{vtModalSlot.max_bookings} plekken bezet
                </p>
              </div>
              <div>
                <label className="input-label">Opmerking (optioneel)</label>
                <input className="input" placeholder="Bijv. focusgebied…" value={vtNote} onChange={(e) => setVtNote(e.target.value)} />
              </div>
              {vtError && <p style={{ color: 'var(--error)', fontSize: '0.85rem' }}><AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />{vtError}</p>}
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>De admin bevestigt je aanvraag zo snel mogelijk.</p>
              <button className="btn btn-primary" onClick={submitVtRequest} disabled={vtSaving} style={{ touchAction: 'manipulation' }}>
                {vtSaving ? 'Bezig…' : 'Aanvraag indienen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ── Card renderers ─────────────────────────────────────────────────────────
  function renderClassCard(item) {
    const cls = item.raw
    const isBooked  = bookedClassIds.has(cls.id)
    const booking   = getClassBooking(cls.id)
    const spotsLeft = cls.spots_left ?? (cls.max_capacity - cls.current_bookings)
    const isFull    = spotsLeft <= 0
    const isLow     = spotsLeft > 0 && spotsLeft <= 3
    const inProg    = busyKey === `class-${cls.id}`
    const isPast    = item.date < new Date()
    const badgeCls  = getBadgeClass(cls.category)
    const badgeTxt  = getBadgeLabel(cls.category)

    return (
      <div key={`class-${cls.id}`} className="class-card" style={isBooked ? { borderColor: 'rgba(34,197,94,0.3)' } : {}}>
        <div className="class-card-header">
          <span className={`badge ${badgeCls}`}>{badgeTxt}</span>
          <span className={`class-spots ${isFull ? 'full' : isLow ? 'low' : ''}`}>
            <Users size={12} style={{ display: 'inline', marginRight: 3 }} />
            {isFull ? 'Vol' : `${spotsLeft} plek${spotsLeft !== 1 ? 'ken' : ''}`}
          </span>
        </div>

        <div className="class-name">{cls.name}</div>

        <div className="class-meta">
          <div className="class-meta-row"><User size={13} /> {cls.instructor}</div>
          <div className="class-meta-row"><Clock size={13} /> {formatTime(cls.date_time)}&nbsp;·&nbsp;{cls.duration_minutes} min</div>
          <div className="class-meta-row"><MapPin size={13} /> {cls.location}</div>
        </div>

        <div className="progress-bar">
          <div className={`progress-fill ${isFull ? 'full' : isLow ? 'warn' : ''}`}
            style={{ width: `${Math.min((cls.current_bookings / cls.max_capacity) * 100, 100)}%` }} />
        </div>

        <div className="class-card-footer">
          {isPast ? (
            <button className="btn btn-ghost btn-full" disabled>Verlopen</button>
          ) : isBooked ? (
            <button className="btn btn-success btn-full" onClick={() => handleCancelClass(booking)} disabled={inProg} style={{ justifyContent: 'space-between' }}>
              <span>{inProg ? <span className="spinner spinner-sm" /> : '✓ Gereserveerd'}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Annuleer</span>
            </button>
          ) : (
            <button className={`btn ${isFull ? 'btn-ghost' : 'btn-primary'} btn-full`} onClick={() => !isFull && handleBookClass(cls.id)} disabled={isFull || inProg}>
              {inProg ? <span className="spinner spinner-sm" /> : isFull ? 'Vol' : 'Reserveer'}
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderPtCard(item) {
    const slot = item.raw
    const myBooking = getPtBooking(slot.id)
    const isBooked  = bookedPtSlotIds.has(slot.id)
    const isPast    = item.date < new Date()
    const inProg    = busyKey === `pt-${slot.id}`
    const statusColor = myBooking?.status === 'confirmed' ? 'var(--success)' : myBooking?.status === 'pending' ? 'var(--warning)' : 'var(--text-muted)'
    const statusLabel = myBooking?.status === 'confirmed' ? '✓ Bevestigd' : myBooking?.status === 'pending' ? '⏳ Wachten op bevestiging' : ''

    return (
      <div key={`pt-${slot.id}`} className="class-card" style={isBooked ? { borderColor: 'rgba(34,197,94,0.3)' } : {}}>
        <div className="class-card-header">
          <span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>Personal Training</span>
        </div>

        <div className="class-name">Personal Training</div>

        <div className="class-meta">
          <div className="class-meta-row"><User size={13} /> {slot.trainer}</div>
          <div className="class-meta-row"><Clock size={13} /> {formatTime(slot.date_time)}&nbsp;·&nbsp;{slot.duration_minutes || 60} min</div>
        </div>

        <div className="class-card-footer">
          {isBooked ? (
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: statusColor, fontWeight: 600, marginBottom: '0.5rem' }}>{statusLabel}</div>
              {myBooking && (
                <button className="btn btn-ghost btn-full btn-sm" onClick={() => handleCancelPt(myBooking.id, slot.id)} disabled={inProg || isPast}>
                  {inProg ? <span className="spinner spinner-sm" /> : 'Annuleer'}
                </button>
              )}
            </div>
          ) : isPast ? (
            <button className="btn btn-ghost btn-full" disabled>Verlopen</button>
          ) : !hasPtBalance ? (
            <Link to="/personal-training" className="btn btn-outline btn-full">Koop eerst een pakket</Link>
          ) : (
            <button className="btn btn-primary btn-full" onClick={() => setPtModalSlot(slot)}>Boeken</button>
          )}
        </div>
      </div>
    )
  }

  function renderVtCard(item) {
    const slot = item.raw
    const isFull = Number(slot.booking_count) >= Number(slot.max_bookings)
    const isPast = item.date < new Date()
    const inProg = busyKey === `vt-${slot.id}`
    const statusColor = slot.my_status === 'confirmed' ? 'var(--success)' : 'var(--warning)'
    const statusLabel = slot.my_status === 'confirmed' ? '✓ Bevestigd' : '⏳ Wacht op bevestiging'

    return (
      <div key={`vt-${slot.id}`} className="class-card" style={slot.my_booking_id ? { borderColor: 'rgba(34,197,94,0.3)' } : {}}>
        <div className="class-card-header">
          <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>Vrij Trainen</span>
          <span className={`class-spots ${isFull ? 'full' : ''}`}>
            <Users size={12} style={{ display: 'inline', marginRight: 3 }} />
            {isFull ? 'Vol' : `${slot.max_bookings - slot.booking_count} plek${slot.max_bookings - slot.booking_count !== 1 ? 'ken' : ''}`}
          </span>
        </div>

        <div className="class-name">Vrij Trainen</div>

        <div className="class-meta">
          <div className="class-meta-row"><Clock size={13} /> {slot.start_time} – {slot.end_time}</div>
        </div>

        <div className="class-card-footer">
          {slot.my_booking_id ? (
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: '0.78rem', color: statusColor, fontWeight: 600, marginBottom: '0.5rem' }}>{statusLabel}</div>
              <button className="btn btn-ghost btn-full btn-sm" onClick={() => handleCancelVt(slot.my_booking_id, slot.id)} disabled={inProg || isPast}>
                {inProg ? <span className="spinner spinner-sm" /> : (slot.my_status === 'requested' ? 'Aanvraag intrekken' : 'Annuleer')}
              </button>
            </div>
          ) : isPast ? (
            <button className="btn btn-ghost btn-full" disabled>Verlopen</button>
          ) : isFull ? (
            <button className="btn btn-ghost btn-full" disabled>Vol</button>
          ) : (
            <button className="btn btn-primary btn-full" onClick={() => { setVtModalSlot(slot); setVtNote(''); setVtError('') }}>Aanvragen</button>
          )}
        </div>
      </div>
    )
  }
}
