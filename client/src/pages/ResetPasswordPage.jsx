import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Dumbbell, Eye, EyeOff, ArrowRight, CheckCircle, XCircle } from 'lucide-react'
import api from '../api'

export default function ResetPasswordPage() {
  const [searchParams]             = useSearchParams()
  const navigate                   = useNavigate()
  const token                      = searchParams.get('token') || ''

  const [password,  setPassword]   = useState('')
  const [password2, setPassword2]  = useState('')
  const [showPass,  setShowPass]   = useState(false)
  const [loading,   setLoading]    = useState(false)
  const [done,      setDone]       = useState(false)
  const [error,     setError]      = useState('')

  // No token → redirect to login
  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Wachtwoord minimaal 8 tekens.'); return }
    if (password !== password2) { setError('Wachtwoorden komen niet overeen.'); return }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Er is een fout opgetreden.')
    } finally {
      setLoading(false)
    }
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
        <p>Stel hiernaast een nieuw wachtwoord in voor je MHGym account.</p>
      </div>

      {/* Right form panel */}
      <div className="auth-form-side">
        <div className="auth-box">

          {done ? (
            /* ── Success state ── */
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle size={56} style={{ color: 'var(--success, #22c55e)', marginBottom: '1rem' }} />
              <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Wachtwoord gewijzigd!</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem', lineHeight: 1.6 }}>
                Je wachtwoord is succesvol ingesteld. Je kunt nu inloggen met je nieuwe wachtwoord.
              </p>
              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={() => navigate('/login')}
              >
                Ga naar inloggen <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              <div>
                <h1 style={{ fontSize: '1.6rem', marginBottom: '0.3rem' }}>Nieuw wachtwoord</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Kies een sterk wachtwoord van minimaal 8 tekens.
                </p>
              </div>

              {error && (
                <div className="alert alert-error" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <XCircle size={15} style={{ flexShrink: 0 }} /> {error}
                </div>
              )}

              <form className="auth-form" onSubmit={submit}>
                <div className="form-group">
                  <label className="form-label">Nieuw wachtwoord</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Minimaal 8 tekens"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required autoFocus
                      style={{ paddingRight: '2.5rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      style={{
                        position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Strength bar */}
                  {password.length > 0 && (
                    <div style={{ marginTop: '0.4rem', display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} style={{
                          flex: 1, height: 3, borderRadius: 2,
                          background: password.length >= i * 3
                            ? (password.length >= 12 ? 'var(--success, #22c55e)' : 'var(--accent, #f5c200)')
                            : 'var(--border, #333)',
                          transition: 'background 0.2s',
                        }} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Herhaal wachtwoord</label>
                  <input
                    className="form-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Zelfde wachtwoord"
                    value={password2}
                    onChange={e => setPassword2(e.target.value)}
                    required
                    style={{
                      borderColor: password2 && password !== password2
                        ? 'var(--error, #ef4444)' : '',
                    }}
                  />
                  {password2 && password !== password2 && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--error, #ef4444)', marginTop: '0.3rem' }}>
                      Wachtwoorden komen niet overeen
                    </p>
                  )}
                </div>

                <button
                  className="btn btn-primary btn-full btn-lg"
                  type="submit"
                  disabled={loading || !password || !password2}
                >
                  {loading
                    ? <span className="spinner spinner-sm" />
                    : <>Sla nieuw wachtwoord op <ArrowRight size={16} /></>
                  }
                </button>
              </form>

              <p className="auth-footer">
                Terug naar{' '}
                <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                  Inloggen
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
