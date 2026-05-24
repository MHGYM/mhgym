import { useState, useEffect, useCallback } from 'react'
import { Clock, MapPin, User, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api'

// ── Category config ────────────────────────────────────────────────────────
// Tabs shown in the filter bar
const CATEGORIES = ['alle', 'kickboksen', 'boksen', 'ladies-only', 'jeugd', 'kids', 'recreanten']

const CATEGORY_LABEL = {
  'alle':        'Alle lessen',
  'kickboksen':  '🥊 Kickboksen',
  'boksen':      '🥊 Boksen',
  'ladies-only': '🌸 Ladies-Only',
  'jeugd':       '🎯 Jeugd',
  'kids':        '⭐ Kids',
  'recreanten':  '💪 Recreanten',
}

// Client-side filter functions — keys match the stored compound category strings
// "kickboksen" tab: kickboksen-*, "boksen" tab: boksen-* (NOT kickboksen-*)
const FILTER_FN = {
  'alle':        () => true,
  'kickboksen':  (c) => c.category?.startsWith('kickboksen'),
  'boksen':      (c) => c.category?.startsWith('boksen'),
  'ladies-only': (c) => c.category?.includes('ladies-only'),
  'jeugd':       (c) => c.category === 'jeugd' || c.category === 'kickboksen-jeugd',
  'kids':        (c) => c.category?.includes('kids'),
  'recreanten':  (c) => c.category?.includes('recreanten'),
}

// Badge: color class derived from the compound category
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

// Badge: short human-readable label
const BADGE_LABEL = {
  'kickboksen-kids':        'Kids',
  'kickboksen-recreanten':  'Recreanten',
  'kickboksen-ladies-only': 'Ladies-Only',
  'kickboksen-jeugd':       'Jeugd',
  'boksen-recreanten':      'Recreanten',
  'boksen-ladies-only':     'Ladies-Only',
  'jeugd':                  'Jeugd',
}
const getBadgeLabel = (cat) => BADGE_LABEL[cat] ?? cat

// ── Date helpers ───────────────────────────────────────────────────────────
function formatDate(str) {
  return new Date(str).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}
function formatTime(str) {
  return new Date(str).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
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
  const [allClasses, setAllClasses] = useState([])  // full week, unfiltered
  const [myBookings, setMyBookings] = useState([])
  const [category,    setCategory]  = useState('alle')
  const [weekOffset,  setWeekOffset] = useState(0)
  const [loading,     setLoading]   = useState(true)
  const [bookingId,   setBookingId] = useState(null)
  const [flash,       setFlash]     = useState(null)

  const weekStart = getWeekStart(weekOffset)
  const weekEnd   = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch ALL classes for the week — category filtering is done client-side
      // so compound categories (kickboksen-kids, boksen-recreanten…) work correctly
      const [classRes, bookingRes] = await Promise.all([
        api.get('/classes', { params: { from: weekStart.toISOString(), to: weekEnd.toISOString() } }),
        api.get('/bookings'),
      ])
      setAllClasses(classRes.data.classes)
      setMyBookings(bookingRes.data.bookings)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [weekOffset])

  useEffect(() => { load() }, [load])

  // Apply the active category filter
  const filterFn  = FILTER_FN[category] ?? (() => true)
  const classes   = allClasses.filter(filterFn)

  const bookedClassIds = new Set(
    myBookings.filter((b) => b.status === 'confirmed').map((b) => b.class_id)
  )
  const getBooking = (classId) =>
    myBookings.find((b) => b.class_id === classId && b.status === 'confirmed')

  const showFlash = (msg, type = 'success') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  const handleBook = async (classId) => {
    setBookingId(classId)
    try {
      await api.post('/bookings', { class_id: classId })
      showFlash('Les gereserveerd! ✓')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Reserveren mislukt.', 'error')
    } finally {
      setBookingId(null)
    }
  }

  const handleCancel = async (booking) => {
    setBookingId(booking.class_id)
    try {
      await api.delete(`/bookings/${booking.id}`)
      showFlash('Reservering geannuleerd.')
      load()
    } catch (e) {
      showFlash(e.response?.data?.error || 'Annuleren mislukt.', 'error')
    } finally {
      setBookingId(null)
    }
  }

  // Group by day (after client-side filter)
  const byDay = classes.reduce((acc, cls) => {
    const day = new Date(cls.date_time).toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(cls)
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
        <h1>Lesrooster</h1>
        <p>Reserveer je lessen voor de komende weken</p>
      </div>

      {/* Week navigator */}
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
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`filter-btn${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      {/* Classes */}
      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : Object.keys(byDay).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>Geen lessen gevonden</h3>
          <p>Probeer een andere week of categorie.</p>
        </div>
      ) : (
        Object.entries(byDay)
          .sort(([a], [b]) => new Date(a) - new Date(b))
          .map(([day, dayCls]) => (
            <div key={day} style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--text-2)', textTransform: 'capitalize' }}>
                {new Date(day).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div className="classes-grid">
                {dayCls
                  .sort((a, b) => new Date(a.date_time) - new Date(b.date_time))
                  .map((cls) => {
                    const isBooked  = bookedClassIds.has(cls.id)
                    const booking   = getBooking(cls.id)
                    const spotsLeft = cls.spots_left ?? (cls.max_capacity - cls.current_bookings)
                    const isFull    = spotsLeft <= 0
                    const isLow     = spotsLeft > 0 && spotsLeft <= 3
                    const inProg    = bookingId === cls.id
                    const isPast    = new Date(cls.date_time) < new Date()

                    const badgeCls  = getBadgeClass(cls.category)
                    const badgeTxt  = getBadgeLabel(cls.category)

                    return (
                      <div
                        key={cls.id}
                        className="class-card"
                        style={isBooked ? { borderColor: 'rgba(34,197,94,0.3)' } : {}}
                      >
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
                          <div className="class-meta-row">
                            <Clock size={13} />
                            {formatTime(cls.date_time)}&nbsp;·&nbsp;{cls.duration_minutes} min
                          </div>
                          <div className="class-meta-row"><MapPin size={13} /> {cls.location}</div>
                        </div>

                        {/* Capacity bar */}
                        <div className="progress-bar">
                          <div
                            className={`progress-fill ${isFull ? 'full' : isLow ? 'warn' : ''}`}
                            style={{ width: `${Math.min((cls.current_bookings / cls.max_capacity) * 100, 100)}%` }}
                          />
                        </div>

                        <div className="class-card-footer">
                          {isPast ? (
                            <button className="btn btn-ghost btn-full" disabled>Verlopen</button>
                          ) : isBooked ? (
                            <button
                              className="btn btn-success btn-full"
                              onClick={() => handleCancel(booking)}
                              disabled={inProg}
                              style={{ justifyContent: 'space-between' }}
                            >
                              <span>{inProg ? <span className="spinner spinner-sm" /> : '✓ Gereserveerd'}</span>
                              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Annuleer</span>
                            </button>
                          ) : (
                            <button
                              className={`btn ${isFull ? 'btn-ghost' : 'btn-primary'} btn-full`}
                              onClick={() => !isFull && handleBook(cls.id)}
                              disabled={isFull || inProg}
                            >
                              {inProg
                                ? <span className="spinner spinner-sm" />
                                : isFull ? 'Vol' : 'Reserveer'
                              }
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          ))
      )}
    </div>
  )
}
