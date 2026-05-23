import { useState, useEffect } from 'react'
import { Save, Key, Calendar, MapPin, Clock, Check, AlertCircle, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

function formatDate(str) {
  if (!str) return '–'
  return new Date(str).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
function formatTime(str) {
  if (!str) return ''
  return new Date(str).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_BADGE = {
  confirmed: <span className="badge badge-success">Bevestigd</span>,
  cancelled:  <span className="badge badge-muted">Geannuleerd</span>,
  attended:   <span className="badge badge-info">Aanwezig</span>,
  no_show:    <span className="badge badge-error">No-show</span>,
}

export default function ProfilePage() {
  const { user, membership, refreshUser } = useAuth()

  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)

  // Profile form
  const [profile, setProfile] = useState({ first_name: '', last_name: '', phone: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // Password form
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [passSaving, setPassSaving] = useState(false)
  const [passMsg, setPassMsg] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [, bookingsRes] = await Promise.all([
          refreshUser(),
          api.get('/bookings'),
        ])
        setBookings(bookingsRes.data.bookings)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Sync user data into form
  useEffect(() => {
    if (user) {
      setProfile({
        first_name: user.first_name ?? '',
        last_name:  user.last_name  ?? '',
        phone:      user.phone      ?? '',
      })
    }
  }, [user])

  const setP = (f) => (e) => setProfile((prev) => ({ ...prev, [f]: e.target.value }))
  const setPw = (f) => (e) => setPasswords((prev) => ({ ...prev, [f]: e.target.value }))

  const saveProfile = async (e) => {
    e.preventDefault()
    setProfileSaving(true); setProfileMsg(null)
    try {
      await api.put('/auth/profile', profile)
      await refreshUser()
      setProfileMsg({ type: 'success', text: 'Profiel opgeslagen.' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.error || 'Opslaan mislukt.' })
    } finally {
      setProfileSaving(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (passwords.new_password !== passwords.confirm) {
      setPassMsg({ type: 'error', text: 'Nieuwe wachtwoorden komen niet overeen.' }); return
    }
    if (passwords.new_password.length < 8) {
      setPassMsg({ type: 'error', text: 'Nieuw wachtwoord minimaal 8 tekens.' }); return
    }
    setPassSaving(true); setPassMsg(null)
    try {
      const { data } = await api.put('/auth/password', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      })
      setPassMsg({ type: 'success', text: data.message })
      setPasswords({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setPassMsg({ type: 'error', text: err.response?.data?.error || 'Wachtwoord wijzigen mislukt.' })
    } finally {
      setPassSaving(false)
    }
  }

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : '?'

  if (loading) return <div className="page loading-center"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>Mijn profiel</h1>
        <p>Beheer je gegevens en bekijk je activiteit</p>
      </div>

      <div className="profile-layout">
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Avatar card */}
          <div className="profile-avatar-section">
            <div className="profile-avatar">{initials}</div>
            <div className="profile-name">{user?.first_name} {user?.last_name}</div>
            <div className="profile-email">{user?.email}</div>
            {user?.role === 'admin' && (
              <span className="badge badge-warning" style={{ marginTop: '0.5rem' }}>Admin</span>
            )}
          </div>

          {/* Membership status */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Lidmaatschap</h3>
            {membership ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Plan</span>
                  <span style={{ fontWeight: 700 }}>{membership.membership_name || membership.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</span>
                  <span className="badge badge-success">Actief</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Prijs</span>
                  <span>€{Number(membership.price_monthly).toFixed(2)}/mnd</span>
                </div>
                {membership.end_date && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Geldig tot</span>
                    <span>{formatDate(membership.end_date)}</span>
                  </div>
                )}
                <div className="divider" style={{ margin: '0.5rem 0' }} />
                {/* Usage this month */}
                <div>
                  <div className="progress-wrap">
                    <div className="progress-label">
                      <span>Lessen deze maand</span>
                      <span>
                        {membership.bookings_used_this_month ?? 0}
                        {membership.max_bookings_per_month > 0 && `/${membership.max_bookings_per_month}`}
                        {membership.max_bookings_per_month === -1 && ' (∞)'}
                      </span>
                    </div>
                    {membership.max_bookings_per_month > 0 && (
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(
                              ((membership.bookings_used_this_month ?? 0) / membership.max_bookings_per_month) * 100,
                              100
                            )}%`
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem', padding: '0.5rem 0' }}>
                Geen actief lidmaatschap
              </div>
            )}
          </div>

          {/* Profile form */}
          <div className="card">
            <h3 style={{ marginBottom: '1.25rem' }}>Persoonlijke gegevens</h3>
            {profileMsg && (
              <div className={`alert alert-${profileMsg.type}`} style={{ marginBottom: '1rem' }}>
                {profileMsg.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
                {profileMsg.text}
              </div>
            )}
            <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Voornaam</label>
                  <input className="form-input" value={profile.first_name} onChange={setP('first_name')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Achternaam</label>
                  <input className="form-input" value={profile.last_name} onChange={setP('last_name')} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input className="form-input" value={user?.email ?? ''} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Telefoon</label>
                <input className="form-input" type="tel" value={profile.phone} onChange={setP('phone')} placeholder="+31 6 12345678" />
              </div>
              <button className="btn btn-primary btn-full" type="submit" disabled={profileSaving}>
                {profileSaving ? <span className="spinner spinner-sm" /> : <><Save size={15} /> Opslaan</>}
              </button>
            </form>
          </div>

          {/* Password form */}
          <div className="card">
            <h3 style={{ marginBottom: '1.25rem' }}>Wachtwoord wijzigen</h3>
            {passMsg && (
              <div className={`alert alert-${passMsg.type}`} style={{ marginBottom: '1rem' }}>
                {passMsg.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
                {passMsg.text}
              </div>
            )}
            <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div className="form-group">
                <label className="form-label">Huidig wachtwoord</label>
                <input className="form-input" type="password" value={passwords.current_password} onChange={setPw('current_password')} required />
              </div>
              <div className="form-group">
                <label className="form-label">Nieuw wachtwoord</label>
                <input className="form-input" type="password" value={passwords.new_password} onChange={setPw('new_password')} placeholder="Minimaal 8 tekens" required />
              </div>
              <div className="form-group">
                <label className="form-label">Herhaal nieuw wachtwoord</label>
                <input className="form-input" type="password" value={passwords.confirm} onChange={setPw('confirm')} required />
              </div>
              <button className="btn btn-ghost btn-full" type="submit" disabled={passSaving}>
                {passSaving ? <span className="spinner spinner-sm" /> : <><Key size={15} /> Wachtwoord wijzigen</>}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN – Booking history */}
        <div className="card">
          <h3 style={{ marginBottom: '1.25rem' }}>Reserveringsgeschiedenis</h3>
          {bookings.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <div className="empty-state-icon"><Calendar size={30} /></div>
              <h3>Nog geen reserveringen</h3>
              <p>Je boekingen verschijnen hier zodra je een les reserveert.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Les</th>
                    <th>Datum</th>
                    <th>Tijd</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings
                    .sort((a, b) => new Date(b.date_time) - new Date(a.date_time))
                    .map((b) => (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>{b.class_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{b.instructor}</div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {b.date_time ? formatDate(b.date_time) : '–'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {b.date_time ? formatTime(b.date_time) : '–'}
                        </td>
                        <td>{STATUS_BADGE[b.status] ?? <span className="badge badge-muted">{b.status}</span>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
