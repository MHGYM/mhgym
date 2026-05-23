import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Dumbbell, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function AuthPage({ mode }) {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Determine active tab from prop or URL
  const [tab, setTab] = useState(mode === 'register' ? 'register' : 'login')
  useEffect(() => { setTab(mode === 'register' ? 'register' : 'login') }, [mode])

  // Redirect if already logged in
  useEffect(() => { if (user) navigate('/dashboard', { replace: true }) }, [user])

  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        await login(form.email, form.password)
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

  const switchTab = (t) => {
    setTab(t)
    setError('')
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

          {/* Error */}
          {error && <div className="alert alert-error">{error}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            {/* Register-only fields */}
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
                <label className="form-label">Telefoonnummer <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optioneel)</span></label>
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
              <label className="form-label">Wachtwoord</label>
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
                : tab === 'login' ? <>Inloggen <ArrowRight size={16} /></> : <>Account aanmaken <ArrowRight size={16} /></>
              }
            </button>
          </form>

          <p className="auth-footer">
            {tab === 'login'
              ? <>Nog geen account? <button className="btn-link" onClick={() => switchTab('register')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Registreer je gratis</button></>
              : <>Al een account? <button className="btn-link" onClick={() => switchTab('login')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Inloggen</button></>
            }
          </p>
        </div>
      </div>
    </div>
  )
}
