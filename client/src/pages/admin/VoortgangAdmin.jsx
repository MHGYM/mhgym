import { useState, useEffect, useRef } from 'react'
import { Plus, Edit2, Trash2, Check, X, Utensils, Camera, Eye, Search, Target, Award, TrendingUp, TrendingDown } from 'lucide-react'
import api from '../../api'
import AuthedImage from '../../components/AuthedImage'

const TABS = [
  { key: 'voeding',       label: "Voedingsschema's", Icon: Utensils },
  { key: 'meetresultaten', label: 'Meetresultaten',  Icon: Camera   },
]

export default function VoortgangAdmin() {
  const [tab, setTab] = useState('voeding')

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        Mijn Voortgang — beheer
      </h2>

      <div className="tab-bar" style={{ marginBottom: '1.25rem' }}>
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} className={`tab-btn${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />{label}
          </button>
        ))}
      </div>

      {tab === 'voeding' && <VoedingschemasAdmin />}
      {tab === 'meetresultaten' && <MeetresultatenAdmin />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Gedeeld: live zoekbalk om een lid te selecteren
// ════════════════════════════════════════════════════════════════════
function MemberSearchPicker({ onSelect, placeholder = 'Zoek lid op naam of e-mail…' }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef(null)

  const search = (q) => {
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); setShowResults(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await api.get(`/admin/members?q=${encodeURIComponent(q.trim())}`)
        setResults(r.data.members || [])
        setShowResults(true)
      } catch (_) { setResults([]) }
      finally { setSearching(false) }
    }, 350)
  }

  const pick = (m) => {
    setQuery(`${m.first_name} ${m.last_name}`)
    setShowResults(false)
    onSelect(m)
  }

  return (
    <div style={{ position: 'relative', maxWidth: 420 }}>
      <label className="input-label">Lid</label>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          className="input"
          style={{ paddingLeft: 32 }}
          placeholder={placeholder}
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => { if (results.length) setShowResults(true) }}
        />
      </div>

      {showResults && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, maxHeight: 260, overflowY: 'auto', padding: '0.4rem' }}>
          {searching && <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Zoeken…</div>}
          {!searching && results.length === 0 && (
            <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Geen leden gevonden.</div>
          )}
          {!searching && results.map(m => (
            <div
              key={m.id}
              onClick={() => pick(m)}
              style={{ padding: '0.5rem 0.6rem', borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.first_name} {m.last_name}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SelectedMemberBar({ member, onClear }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', padding: '0.6rem 0.9rem', background: 'var(--surface-2)', borderRadius: 'var(--r)' }}>
      <span style={{ fontWeight: 700 }}>Geselecteerd: {member.first_name} {member.last_name}</span>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>({member.email})</span>
      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onClear}><X size={13} /> Wissel lid</button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAB: VOEDINGSSCHEMA'S — nu met zoekbalk i.p.v. volledige ledenlijst
// ════════════════════════════════════════════════════════════════════
const MEAL_KEYS = [
  { key: 'ontbijt', label: 'Ontbijt' },
  { key: 'lunch',   label: 'Lunch'   },
  { key: 'diner',   label: 'Diner'   },
  { key: 'snacks',  label: 'Snacks'  },
]

const emptyMeals = () => MEAL_KEYS.map(m => ({ ...m, description: '' }))

function VoedingschemasAdmin() {
  const [member, setMember]       = useState(null)
  const [templates, setTemplates] = useState([])
  const [loading, setLoading]     = useState(false)
  const [editing, setEditing]     = useState(null) // 'new' | template object | null
  const [form, setForm]           = useState({ title: '', meals: emptyMeals(), active: true })
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  // Bewaart welk lid het meest recent is opgevraagd — voorkomt dat een
  // trage respons van een eerder geselecteerd lid de weergave van een
  // inmiddels geselecteerd ander lid overschrijft (race condition bij snel
  // wisselen van lid).
  const requestedMemberRef = useRef(null)

  const loadTemplates = (memberId) => {
    requestedMemberRef.current = memberId
    if (!memberId) { setTemplates([]); return }
    setLoading(true)
    api.get(`/voortgang/admin/templates/${memberId}`)
      .then(r => { if (requestedMemberRef.current === memberId) setTemplates(r.data.templates || []) })
      .catch(() => { if (requestedMemberRef.current === memberId) setTemplates([]) })
      .finally(() => { if (requestedMemberRef.current === memberId) setLoading(false) })
  }

  const selectMember = (m) => { setMember(m); setEditing(null); loadTemplates(m.id) }
  const clearMember  = () => { setMember(null); setTemplates([]); setEditing(null) }

  const startNew = () => {
    setEditing('new')
    setForm({ title: '', meals: emptyMeals(), active: true })
    setErr('')
  }

  const startEdit = (t) => {
    setEditing(t)
    setForm({
      title: t.title,
      meals: MEAL_KEYS.map(mk => {
        const existing = t.meals.find(m => m.key === mk.key)
        return { ...mk, description: existing?.description || '' }
      }),
      active: !!t.active,
    })
    setErr('')
  }

  const updateMealDesc = (key, value) => {
    setForm(f => ({ ...f, meals: f.meals.map(m => m.key === key ? { ...m, description: value } : m) }))
  }

  const save = async () => {
    if (!form.title.trim()) { setErr('Titel is verplicht.'); return }
    setSaving(true); setErr('')
    try {
      if (editing === 'new') {
        await api.post('/voortgang/admin/templates', { member_id: member.id, title: form.title.trim(), meals: form.meals })
      } else {
        await api.put(`/voortgang/admin/templates/${editing.id}`, { title: form.title.trim(), meals: form.meals, active: form.active })
      }
      setEditing(null)
      loadTemplates(member.id)
    } catch (e) {
      setErr(e.response?.data?.error || 'Opslaan mislukt.')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (id) => {
    if (!confirm('Dit schema deactiveren?')) return
    await api.delete(`/voortgang/admin/templates/${id}`)
    loadTemplates(member.id)
  }

  const activate = async (t) => {
    await api.put(`/voortgang/admin/templates/${t.id}`, { active: true })
    loadTemplates(member.id)
  }

  return (
    <div>
      {!member && <MemberSearchPicker onSelect={selectMember} />}
      {!member && <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>Zoek en selecteer een lid om schema's te beheren.</p>}

      {member && (
        <>
          <SelectedMemberBar member={member} onClear={clearMember} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {loading ? 'Laden…' : `${templates.length} schema${templates.length !== 1 ? "'s" : ''}`}
            </span>
            {editing === null && (
              <button className="btn btn-primary btn-sm" onClick={startNew}><Plus size={13} /> Nieuw schema</button>
            )}
          </div>

          {editing !== null && (
            <div className="card" style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>{editing === 'new' ? 'Nieuw voedingsschema' : 'Schema bewerken'}</h3>
              {err && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{err}</div>}

              <div style={{ marginBottom: '0.75rem' }}>
                <label className="input-label">Titel</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="bijv. Cutting schema — week 1" />
              </div>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {form.meals.map(m => (
                  <div key={m.key}>
                    <label className="input-label">{m.label}</label>
                    <textarea
                      className="input"
                      rows={2}
                      style={{ resize: 'vertical' }}
                      value={m.description}
                      onChange={e => updateMealDesc(m.key, e.target.value)}
                      placeholder={`Omschrijving voor ${m.label.toLowerCase()}…`}
                    />
                  </div>
                ))}
              </div>

              {editing !== 'new' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ accentColor: 'var(--primary)' }} />
                  Actief (lid ziet dit schema als checklist)
                </label>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}><Check size={13} /> Opslaan</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><X size={13} /> Annuleren</button>
              </div>
            </div>
          )}

          {templates.map(t => (
            <div key={t.id} className="card" style={{ marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {t.title}
                    <span className={`badge ${t.active ? 'badge-success' : 'badge-muted'}`}>{t.active ? 'Actief' : 'Inactief'}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {t.meals.filter(m => m.description).map(m => m.label).join(' · ') || 'Geen omschrijvingen ingevuld'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  {!t.active && (
                    <button className="btn btn-sm" style={{ background: 'var(--success-dim)', color: 'var(--success)' }} onClick={() => activate(t)}>Activeren</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}><Edit2 size={13} /></button>
                  {!!t.active && (
                    <button className="btn btn-danger btn-sm" onClick={() => deactivate(t.id)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!loading && templates.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>Nog geen voedingsschema's voor dit lid.</p>
          )}
        </>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// TAB: MEETRESULTATEN
// ════════════════════════════════════════════════════════════════════
const GOAL_METRICS = [
  { value: 'weight_kg',      label: 'Gewicht (kg)' },
  { value: 'body_fat_pct',   label: 'Lichaamsvet (%)' },
  { value: 'muscle_mass_kg', label: 'Spiermassa (kg)' },
]

const VALUE_FIELDS = [
  { key: 'weight_kg',      label: 'Gewicht',      unit: 'kg' },
  { key: 'bmi',            label: 'BMI',           unit: ''   },
  { key: 'body_fat_pct',   label: 'Lichaamsvet',  unit: '%'  },
  { key: 'muscle_mass_kg', label: 'Spiermassa',   unit: 'kg' },
]

function fmtDate(s) {
  return s ? new Date(s).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

function DeltaBadge({ value, unit, higherIsBetter }) {
  if (value == null || value === 0) return null
  const isUp = value > 0
  const good = higherIsBetter ? isUp : !isUp
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.72rem', fontWeight: 700, color: good ? 'var(--success)' : 'var(--error)' }}>
      <Icon size={11} />{isUp ? '+' : ''}{value}{unit}
    </span>
  )
}

function ValuesSummary({ values, deltas }) {
  const present = VALUE_FIELDS.filter(f => values?.[f.key] != null)
  if (present.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.7rem', fontSize: '0.75rem', color: 'var(--text-2, var(--text))' }}>
      {present.map(f => (
        <span key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {f.label}: <strong>{values[f.key]}{f.unit}</strong>
          <DeltaBadge value={deltas?.[f.key]} unit={f.unit} higherIsBetter={f.key === 'muscle_mass_kg'} />
        </span>
      ))}
    </div>
  )
}

function MeetresultatenAdmin() {
  const [member, setMember]         = useState(null)
  const [reports, setReports]       = useState([])
  const [badges, setBadges]         = useState([])
  const [goal, setGoal]             = useState(null)
  const [loadingData, setLoadingData] = useState(false)

  const [title, setTitle]           = useState('')
  const [date, setDate]             = useState(new Date().toISOString().split('T')[0])
  const [preview, setPreview]       = useState(null) // { dataUrl, mime }
  const [uploadErr, setUploadErr]   = useState('')
  const [uploading, setUploading]   = useState(false)
  const [justUploaded, setJustUploaded] = useState(false)

  const [goalMetric, setGoalMetric]   = useState('body_fat_pct')
  const [goalDirection, setGoalDirection] = useState('lower')
  const [goalValue, setGoalValue]     = useState('')
  const [goalSaving, setGoalSaving]   = useState(false)

  // Review/bevestig-modal voor de AI-uitgelezen cijfers van één rapport
  const [reviewReport, setReviewReport] = useState(null)
  const [reviewForm, setReviewForm]     = useState({})
  const [reviewNotes, setReviewNotes]   = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [viewingImage, setViewingImage] = useState(null)
  // Bewaart welk lid het meest recent is opgevraagd — zonder deze guard kan
  // een trage respons voor eerder-geselecteerd lid A de badges/meetresultaten
  // van inmiddels geselecteerd lid B overschrijven ("badges op het verkeerde
  // leden-dashboard" bij snel wisselen van lid).
  const requestedMemberRef = useRef(null)

  const loadMemberData = async (m) => {
    requestedMemberRef.current = m.id
    setLoadingData(true)
    try {
      const [repRes, badgeRes, goalRes] = await Promise.all([
        api.get(`/admin/members/${m.id}/measurement-reports`),
        api.get(`/voortgang/admin/badges/${m.id}`),
        api.get(`/voortgang/admin/goals/${m.id}`),
      ])
      if (requestedMemberRef.current !== m.id) return // een nieuwer lid is intussen geselecteerd
      setReports(repRes.data.reports || [])
      setBadges(badgeRes.data.badges || [])
      setGoal((goalRes.data.goals || []).find(g => !g.achieved_at) || null)
    } catch (_) {
      if (requestedMemberRef.current === m.id) { setReports([]); setBadges([]); setGoal(null) }
    } finally {
      if (requestedMemberRef.current === m.id) setLoadingData(false)
    }
  }

  const selectMember = (m) => {
    setMember(m)
    setPreview(null); setTitle(''); setUploadErr(''); setJustUploaded(false)
    loadMemberData(m)
  }

  const clearMember = () => {
    setMember(null); setReports([]); setBadges([]); setGoal(null)
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    setUploadErr(''); setJustUploaded(false)
    if (!file) { setPreview(null); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadErr('Alleen JPG, PNG of WEBP toegestaan.'); setPreview(null); return
    }
    if (file.size > 8 * 1024 * 1024) {
      setUploadErr('Bestand is te groot (max. 8MB).'); setPreview(null); return
    }
    const reader = new FileReader()
    reader.onload = ev => setPreview({ dataUrl: ev.target.result, mime: file.type })
    reader.readAsDataURL(file)
  }

  const openReviewForm = (report, values) => {
    const form = {}
    VALUE_FIELDS.forEach(f => { form[f.key] = values?.[f.key] ?? '' })
    setReviewForm(form)
    setReviewNotes(values?.extraction_notes || '')
    setReviewStatus(values?.extraction_status || 'pending')
    setReviewReport(report)
  }

  const openExistingReview = async (rep) => {
    setReviewLoading(true)
    setReviewReport(rep)
    try {
      const r = await api.get(`/admin/measurement-reports/${rep.id}/values`)
      openReviewForm(rep, r.data.values)
    } catch (_) {
      alert('Kon meetgegevens niet laden.')
      setReviewReport(null)
    } finally {
      setReviewLoading(false)
    }
  }

  const doUpload = async () => {
    if (!preview) { setUploadErr('Kies eerst een afbeelding.'); return }
    setUploading(true); setUploadErr('')
    try {
      const r = await api.post(`/admin/members/${member.id}/measurement-reports`, {
        measured_at: date,
        image_data: preview.dataUrl,
        title: title.trim() || undefined,
      })
      setJustUploaded(true)
      setTitle(''); setDate(new Date().toISOString().split('T')[0]); setPreview(null)
      await loadMemberData(member)
      // Meteen de uitgelezen cijfers laten controleren — dit is de stap die
      // eerder ontbrak: zonder bevestiging bleven waarden onzichtbaar bij het lid.
      openReviewForm(r.data.report, r.data.values)
    } catch (e) {
      setUploadErr(e.response?.data?.error || 'Uploaden mislukt.')
    } finally {
      setUploading(false)
    }
  }

  const doConfirmValues = async () => {
    setReviewSaving(true)
    try {
      await api.put(`/admin/measurement-reports/${reviewReport.id}/values`, reviewForm)
      setReviewReport(null)
      await loadMemberData(member)
    } catch (e) {
      alert(e.response?.data?.error || 'Bevestigen mislukt.')
    } finally {
      setReviewSaving(false)
    }
  }

  const doDelete = async (reportId) => {
    if (!confirm('Dit meetresultaat definitief verwijderen?')) return
    try {
      await api.delete(`/admin/measurement-reports/${reportId}`)
      loadMemberData(member)
    } catch (e) { alert(e.response?.data?.error || 'Verwijderen mislukt.') }
  }

  const doSetGoal = async () => {
    const value = Number(String(goalValue).replace(',', '.'))
    if (!Number.isFinite(value)) { alert('Geef een geldige doelwaarde op.'); return }
    setGoalSaving(true)
    try {
      const r = await api.post('/voortgang/admin/goals', {
        member_id: member.id, metric: goalMetric, target_value: value, direction: goalDirection,
      })
      setGoal(r.data.goal)
      setGoalValue('')
    } catch (e) {
      alert(e.response?.data?.error || 'Doel instellen mislukt.')
    } finally {
      setGoalSaving(false)
    }
  }

  return (
    <div>
      {!member && <MemberSearchPicker onSelect={selectMember} />}
      {!member && <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>Zoek en selecteer een lid om meetresultaten te beheren.</p>}

      {member && (
        <>
          <SelectedMemberBar member={member} onClear={clearMember} />

          {loadingData ? <p style={{ color: 'var(--text-muted)' }}>Laden…</p> : (
            <>
              {/* ── Upload ── */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Nieuw meetresultaat uploaden</h3>
                <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr', marginBottom: '0.75rem' }}>
                  <div>
                    <label className="input-label">Datum meting</label>
                    <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <label className="input-label">Titel (optioneel)</label>
                    <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="bijv. Maandmeting augustus" />
                  </div>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="input-label">Afbeelding (JPG, PNG of WEBP, max. 8MB)</label>
                  <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
                </div>

                {uploadErr && <div className="alert alert-error" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>{uploadErr}</div>}
                {justUploaded && (
                  <div className="alert alert-success" style={{ fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Check size={15} /> Meetresultaat succesvol opgeslagen. Controleer hieronder de uitgelezen cijfers.
                  </div>
                )}

                {preview && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Voorbeeld:</div>
                    <img src={preview.dataUrl} alt="Voorbeeld" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'block' }} />
                  </div>
                )}

                <button className="btn btn-primary btn-sm" onClick={doUpload} disabled={uploading || !preview}>
                  {uploading ? 'Uploaden…' : <><Plus size={13} /> Uploaden</>}
                </button>
              </div>

              {/* ── Bestaande resultaten ── */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ marginBottom: '0.75rem' }}>Bestaande meetresultaten ({reports.length})</h3>
                {reports.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Nog geen meetresultaten voor dit lid.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {reports.map(rep => (
                    <div key={rep.id} style={{ background: 'var(--surface-2)', borderRadius: 'var(--r)', padding: '0.6rem', display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
                      <AuthedImage
                        src={`/admin/measurement-reports/${rep.id}/image`}
                        alt={rep.title || fmtDate(rep.measured_at)}
                        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--r-sm)', cursor: 'pointer', flexShrink: 0 }}
                        onClick={() => setViewingImage(rep)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{rep.title || 'Meetresultaat'}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{fmtDate(rep.measured_at)}</div>
                        {rep.extraction_status === 'confirmed' ? (
                          <ValuesSummary values={rep} deltas={rep.deltas} />
                        ) : (
                          <button className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem', padding: '3px 7px' }} onClick={() => openExistingReview(rep)}>
                            <Camera size={10} /> {rep.extraction_status === 'failed' ? 'Handmatig invullen' : 'Controleer meetgegevens'}
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', flexShrink: 0 }}>
                        {rep.extraction_status === 'confirmed' && (
                          <button className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem', padding: '3px 7px' }} onClick={() => openExistingReview(rep)}><Edit2 size={10} /></button>
                        )}
                        <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.7rem', padding: '3px 7px' }} onClick={() => doDelete(rep.id)}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Doel instellen ── */}
              <div className="card" style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><Target size={16} /> Doel</h3>
                {goal ? (
                  <p style={{ fontSize: '0.85rem' }}>
                    Actief doel: <strong>{GOAL_METRICS.find(m => m.value === goal.metric)?.label}</strong> {goal.direction === 'lower' ? '≤' : '≥'} <strong>{goal.target_value}</strong>
                  </p>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nog geen actief doel ingesteld.</p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '0.6rem' }}>
                  <div>
                    <label className="input-label">Metriek</label>
                    <select className="input" value={goalMetric} onChange={e => setGoalMetric(e.target.value)}>
                      {GOAL_METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Richting</label>
                    <select className="input" value={goalDirection} onChange={e => setGoalDirection(e.target.value)}>
                      <option value="lower">Lager of gelijk aan</option>
                      <option value="higher">Hoger of gelijk aan</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Doelwaarde</label>
                    <input className="input" style={{ width: 100 }} type="text" inputMode="decimal" value={goalValue} onChange={e => setGoalValue(e.target.value)} placeholder="bijv. 18" />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={doSetGoal} disabled={goalSaving}>Doel instellen</button>
                </div>
              </div>

              {/* ── Badges ── */}
              <div className="card">
                <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}><Award size={16} /> Badges</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                  {badges.map(b => (
                    <div key={b.key} style={{ padding: '0.5rem 0.6rem', borderRadius: 'var(--r)', background: b.earned ? 'var(--surface-2)' : 'transparent', border: `1px solid ${b.earned ? 'var(--accent)' : 'var(--border)'}`, opacity: b.earned ? 1 : 0.5 }}>
                      <div style={{ fontSize: '1.1rem' }}>{b.icon} <strong style={{ fontSize: '0.82rem' }}>{b.label}</strong></div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{b.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Volledige afbeelding ── */}
      {viewingImage && (
        <div className="modal-overlay" onClick={() => setViewingImage(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', width: 'auto' }}>
            <div className="modal-header">
              <h3>{viewingImage.title || fmtDate(viewingImage.measured_at)}</h3>
              <button className="btn-icon" onClick={() => setViewingImage(null)}><X size={18} /></button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center' }}>
              <AuthedImage
                src={`/admin/measurement-reports/${viewingImage.id}/image`}
                alt={viewingImage.title || fmtDate(viewingImage.measured_at)}
                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 'var(--r)' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Review/bevestig meetgegevens ── */}
      {reviewReport && (
        <div className="modal-overlay" onClick={() => !reviewSaving && setReviewReport(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: '100%' }}>
            <div className="modal-header">
              <h3>Controleer meetgegevens</h3>
              <button className="btn-icon" onClick={() => setReviewReport(null)}><X size={18} /></button>
            </div>
            {reviewLoading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Laden…</div>
            ) : (
              <div style={{ padding: '1rem 1.25rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  {reviewStatus === 'failed'
                    ? 'Automatische uitlezing is niet gelukt. Vul de waarden handmatig in.'
                    : 'Automatisch uitgelezen uit de afbeelding — controleer elke waarde voordat je bevestigt.'}
                  {reviewNotes && <span style={{ display: 'block', marginTop: 4, fontStyle: 'italic' }}>{reviewNotes}</span>}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  {VALUE_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="input-label">{f.label}{f.unit && ` (${f.unit})`}</label>
                      <input
                        className="input" type="text" inputMode="decimal" placeholder="—"
                        value={reviewForm[f.key] ?? ''}
                        onChange={e => setReviewForm(v => ({ ...v, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={doConfirmValues} disabled={reviewSaving}>
                    {reviewSaving ? 'Bevestigen…' : <><Check size={13} /> Bevestigen</>}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setReviewReport(null)} disabled={reviewSaving}>Later</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
