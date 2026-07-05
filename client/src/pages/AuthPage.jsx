import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Dumbbell, Eye, EyeOff, ArrowRight, ArrowLeft, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api'

// ── Forgot-password mini-form ─────────────────────────────────────────────────
function ForgotPasswordForm({ onBack }) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Er is een fout opgetreden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: '0.875rem', padding: 0,
          marginBottom: '1.5rem',
        }}
      >
        <ArrowLeft size={15} /> Terug naar inloggen
      </button>

      <h1 style={{ fontSize: '1.6rem', marginBottom: '0.3rem' }}>Wachtwoord vergeten</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Vul je e-mailadres in. Je ontvangt een link om een nieuw wachtwoord in te stellen.
      </p>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {done ? (
        <div style={{
          background: 'var(--success-dim, rgba(34,197,94,0.1))',
          border: '1px solid var(--success, #22c55e)',
          borderRadius: 'var(--r, 8px)', padding: '1.25rem',
          display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
        }}>
          <Mail size={20} style={{ color: 'var(--success, #22c55e)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--success, #22c55e)' }}>
              E-mail verzonden
            </p>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
              Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een resetlink.
              Controleer ook je spam-map.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">E-mailadres</label>
            <input
              className="form-input" type="email" placeholder="jan@email.nl"
              value={email} onChange={e => setEmail(e.target.value)} required autoFocus
            />
          </div>
          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? <span className="spinner spinner-sm" /> : <>Stuur resetlink <ArrowRight size={16} /></>}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Profile picker (gezinsaccounts op één e-mail) ─────────────────────────────
function ProfilePicker({ profiles, onPick, onBack }) {
  const initials = (p) => `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase()
  return (
    <div>
      <button
        onClick={onBack}
        style={{ display:'flex', alignItems:'center', gap:'0.4rem', background:'none', border:'none',
          cursor:'pointer', color:'var(--text-muted)', fontSize:'0.875rem', padding:0, marginBottom:'1.5rem' }}>
        <ArrowLeft size={15} /> Terug
      </button>
      <h1 style={{ fontSize:'1.4rem', marginBottom:'0.3rem' }}>Kies profiel</h1>
      <p style={{ color:'var(--text-muted)', fontSize:'0.875rem', marginBottom:'1.5rem' }}>
        Meerdere leden zijn gekoppeld aan dit e-mailadres. Wie wil je inloggen?
      </p>
      <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
        {profiles.map(p => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            style={{ display:'flex', alignItems:'center', gap:'0.9rem', padding:'0.9rem 1rem',
              background:'var(--card-bg,#1a1a2e)', border:'1px solid var(--border)', borderRadius:10,
              cursor:'pointer', textAlign:'left', transition:'border-color .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--primary)', display:'flex',
              alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'0.9rem', color:'#fff', flexShrink:0 }}>
              {initials(p)}
            </div>
            <span style={{ fontWeight:600, fontSize:'0.95rem', color:'var(--text)' }}>
              {p.first_name} {p.last_name}
            </span>
            <ArrowRight size={15} style={{ marginLeft:'auto', color:'var(--text-muted)' }} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main auth page ────────────────────────────────────────────────────────────
export default function AuthPage({ mode }) {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [tab, setTab] = useState(mode === 'register' ? 'register' : 'login')
  useEffect(() => { setTab(mode === 'register' ? 'register' : 'login') }, [mode])

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }) }, [user])

  const [form,     setForm]     = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [forgot,   setForgot]   = useState(false)
  const [profiles, setProfiles] = useState(null) // profile-picker state

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        const result = await login(form.email, form.password)
        if (result?.needs_profile_selection) {
          setProfiles({ list: result.profiles, email: form.email, password: form.password })
          return
        }
      } else {
        if (!form.first_name || !form.last_name) { setError('Vul je voor- en achternaam in.'); return }
        if (form.password.length < 8)             { setError('Wachtwoord minimaal 8 tekens.'); return }
        await register(form)
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Er is een fout opgetreden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  const handleProfilePick = async (userId) => {
    setLoading(true)
    setError('')
    try {
      await login(profiles.email, profiles.password, userId)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Inloggen mislukt.')
      setProfiles(null)
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t) => {
    setTab(t); setError(''); setForgot(false)
    navigate(t === 'login' ? '/login' : '/register', { replace: true })
  }

  return (
    <div className="auth-page">
      {/* Left brand panel */}
      <div className="auth-brand">
        <div className="auth-brand-logo">
          <Dumbbell size={32} color="var(--accent)" />
          <span className="logo-text"><span className="logo-accent">MH</span>GYM</span>
        </div>
        <h2>
          Train Hard.<br />
          <span>Live Strong.</span>
        </h2>
        <p>
          Jouw fitness reis begint hier. Boek lessen, volg je voortgang
          en bereik je doelen — alles op één plek.
        </p>
        <ul className="auth-features">
          <li>Onbeperkt toegang tot alle lessen</li>
          <li>Persoonlijk lesrooster en reserveringen</li>
          <li>Professionele instructeurs</li>
          <li>Flexibele abonnementen zonder gedoe</li>
        </ul>
      </div>

      {/* Right form panel */}
      <div className="auth-form-side">
        <div className="auth-box">

          {/* ── Profile picker (gezinsaccounts) ── */}
          {profiles ? (
            <ProfilePicker
              profiles={profiles.list}
              onPick={handleProfilePick}
              onBack={() => { setProfiles(null); setError('') }}
            />
          ) : forgot ? (
            <ForgotPasswordForm onBack={() => setForgot(false)} />
          ) : (
            <>
              <div>
                <h1 style={{ fontSize: '1.6rem', marginBottom: '0.3rem' }}>
                  {tab === 'login' ? 'Welkom terug' : 'Account aanmaken'}
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  {tab === 'login'
                    ? 'Log in met je MHGym account'
                    : 'Word lid en begin vandaag nog'}
                </p>
              </div>

              {/* Tab switcher */}
              <div className="auth-tabs">
                <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => switchTab('login')}>
                  Inloggen
                </button>
                <button className={`auth-tab${tab === 'register' ? ' active' : ''}`} onClick={() => switchTab('register')}>
                  Registreren
                </button>
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <form className="auth-form" onSubmit={handleSubmit}>
                {tab === 'register' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Voornaam</label>
                      <input
                        className="form-input" type="text" placeholder="Jan"
                        value={form.first_name} onChange={set('first_name')} required autoFocus
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Achternaam</label>
                      <input
                        className="form-input" type="text" placeholder="de Vries"
                        value={form.last_name} onChange={set('last_name')} required
                      />
                    </div>
                  </div>
                )}

                {tab === 'register' && (
                  <div className="form-group">
                    <label className="form-label">
                      Telefoonnummer{' '}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optioneel)</span>
                    </label>
                    <input
                      className="form-input" type="tel" placeholder="+31 6 12345678"
                      value={form.phone} onChange={set('phone')}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">E-mailadres</label>
                  <input
                    className="form-input" type="email" placeholder="jan@email.nl"
                    value={form.email} onChange={set('email')} required
                    autoFocus={tab === 'login'}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                    <label className="form-label" style={{ margin: 0 }}>Wachtwoord</label>
                    {tab === 'login' && (
                      <button
                        type="button"
                        onClick={() => setForgot(true)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--accent)', fontSize: '0.8rem', padding: 0, fontWeight: 500,
                        }}
                      >
                        Wachtwoord vergeten?
                      </button>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={showPass ? 'text' : 'password'}
                      placeholder={tab === 'register' ? 'Minimaal 8 tekens' : '••••••••'}
                      value={form.password} onChange={set('password')} required
                      style={{ paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((s) => !s)}
                      style={{
                        position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
                  {loading
                    ? <span className="spinner spinner-sm" />
                    : tab === 'login'
                      ? <>Inloggen <ArrowRight size={16} /></>
                      : <>Account aanmaken <ArrowRight size={16} /></>
                  }
                </button>
              </form>

              <p className="auth-footer">
                {tab === 'login'
                  ? <>Nog geen account?{' '}
                      <button className="btn-link" onClick={() => switchTab('register')}
                        style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        Registreer je gratis
                      </button></>
                  : <>Al een account?{' '}
                      <button className="btn-link" onClick={() => switchTab('login')}
                        style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        Inloggen
                      </button></>
                }
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
