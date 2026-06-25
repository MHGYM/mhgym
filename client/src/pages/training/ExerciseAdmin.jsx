import { useState, useEffect } from 'react'
import { Plus, Edit2, Eye, EyeOff, Save, X, Video, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../api'
import { useTraining } from '../TrainingPage'

const CATEGORIES = ['borstspieren','rugspieren','schouders','armen','buik','benen','billen','rug onderrug','cardio','overig']
const EQUIPMENT  = ['gym','home','both']
const DIFFICULTY = ['beginner','intermediate','advanced']

const EMPTY = {
  name:'', category:'overig', muscle_groups:[], description:'', instructions:[],
  bunny_video_id:'', equipment:'gym', difficulty:'beginner',
  default_sets:3, default_reps:'10', default_rest_seconds:60,
  home_alternative_notes:'', active:1,
}

function BunnyEmbed({ videoId, libraryId }) {
  if (!videoId) return <div style={{ background:'#1a1a2e', borderRadius:8, padding:24, textAlign:'center', color:'#666', fontSize:'0.8rem' }}>Geen video-ID ingesteld</div>
  if (!libraryId) return <div style={{ background:'#1a1a2e', borderRadius:8, padding:24, textAlign:'center', color:'#f59e0b', fontSize:'0.8rem' }}>Stel BUNNY_LIBRARY_ID in als Railway env-variabele</div>
  return (
    <div style={{ position:'relative', paddingTop:'56.25%', borderRadius:8, overflow:'hidden', background:'#000' }}>
      <iframe
        src={`https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}?autoplay=false`}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}

export default function ExerciseAdmin() {
  const { bunnyLibraryId } = useTraining()
  const [exercises, setExercises] = useState([])
  const [loading, setLoading]     = useState(true)
  const [editing, setEditing]     = useState(null) // null | 'new' | exercise object
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [previewEx, setPreviewEx] = useState(null)
  const [instrInput, setInstrInput] = useState('')
  const [mgInput, setMgInput]     = useState('')

  const load = () => {
    setLoading(true)
    api.get('/training/admin/exercises').then(r => { setExercises(r.data.exercises); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const openNew = () => {
    setForm({ ...EMPTY })
    setInstrInput(''); setMgInput('')
    setEditing('new'); setErr('')
  }

  const openEdit = (ex) => {
    setForm({ ...ex, muscle_groups: Array.isArray(ex.muscle_groups) ? ex.muscle_groups : [], instructions: Array.isArray(ex.instructions) ? ex.instructions : [] })
    setInstrInput(''); setMgInput('')
    setEditing(ex); setErr('')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try {
      if (editing === 'new') {
        await api.post('/training/admin/exercises', form)
      } else {
        await api.put(`/training/admin/exercises/${editing.id}`, form)
      }
      setEditing(null); load()
    } catch (e) { setErr(e.response?.data?.error || 'Fout bij opslaan.') }
    finally { setSaving(false) }
  }

  const toggleActive = async (ex) => {
    await api.put(`/training/admin/exercises/${ex.id}`, { active: ex.active ? 0 : 1 })
    load()
  }

  const addMg = () => {
    if (!mgInput.trim()) return
    setForm(f => ({ ...f, muscle_groups: [...(f.muscle_groups||[]), mgInput.trim()] }))
    setMgInput('')
  }
  const removeMg = (i) => setForm(f => ({ ...f, muscle_groups: f.muscle_groups.filter((_,j)=>j!==i) }))

  const addInstr = () => {
    if (!instrInput.trim()) return
    setForm(f => ({ ...f, instructions: [...(f.instructions||[]), instrInput.trim()] }))
    setInstrInput('')
  }
  const removeInstr = (i) => setForm(f => ({ ...f, instructions: f.instructions.filter((_,j)=>j!==i) }))

  const filtered = exercises.filter(ex =>
    (!search || ex.name.toLowerCase().includes(search.toLowerCase())) &&
    (!catFilter || ex.category === catFilter)
  )

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h2 style={{ margin:0, fontSize:'1.1rem' }}>Oefeningen ({exercises.length})</h2>
        <button className="btn btn-primary" onClick={openNew} style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Plus size={14} />Nieuwe oefening
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <input placeholder="Zoeken op naam..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{ flex:1, minWidth:180, padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem' }} />
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
          style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem' }}>
          <option value="">Alle categorieën</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Preview modal */}
      {previewEx && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={() => setPreviewEx(null)}>
          <div style={{ background:'var(--surface)', borderRadius:12, padding:24, maxWidth:600, width:'100%', maxHeight:'85vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <h3 style={{ margin:0 }}>{previewEx.name}</h3>
              <button className="btn" onClick={() => setPreviewEx(null)}><X size={14} /></button>
            </div>
            <BunnyEmbed videoId={previewEx.bunny_video_id} libraryId={bunnyLibraryId} />
            {previewEx.description && <p style={{ marginTop:12, color:'var(--text-muted)', fontSize:'0.85rem' }}>{previewEx.description}</p>}
            {Array.isArray(previewEx.instructions) && previewEx.instructions.length > 0 && (
              <ol style={{ marginTop:12, paddingLeft:20 }}>
                {previewEx.instructions.map((step, i) => <li key={i} style={{ fontSize:'0.85rem', marginBottom:4 }}>{step}</li>)}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* Edit/Create form */}
      {editing && (
        <form onSubmit={handleSave} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20, marginBottom:20 }}>
          <h3 style={{ margin:'0 0 16px', fontSize:'0.95rem' }}>{editing==='new' ? 'Nieuwe oefening' : `Bewerken: ${editing.name}`}</h3>
          {err && <div style={{ color:'var(--error,#dc2626)', fontSize:'0.83rem', marginBottom:10 }}>{err}</div>}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Naam *</label>
              <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={inp} />
            </div>

            <div>
              <label style={lbl}>Categorie</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={inp}>
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Materiaal</label>
              <select value={form.equipment} onChange={e=>setForm(f=>({...f,equipment:e.target.value}))} style={inp}>
                {EQUIPMENT.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Niveau</label>
              <select value={form.difficulty} onChange={e=>setForm(f=>({...f,difficulty:e.target.value}))} style={inp}>
                {DIFFICULTY.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Sets (standaard)</label>
              <input type="number" min={1} max={20} value={form.default_sets} onChange={e=>setForm(f=>({...f,default_sets:Number(e.target.value)}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Reps (bv. "10" of "8-12")</label>
              <input value={form.default_reps} onChange={e=>setForm(f=>({...f,default_reps:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Rusttijd (sec)</label>
              <input type="number" min={0} value={form.default_rest_seconds} onChange={e=>setForm(f=>({...f,default_rest_seconds:Number(e.target.value)}))} style={inp} />
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>
                <Video size={13} style={{ marginRight:4 }} />
                Bunny Video ID
              </label>
              <input placeholder="bijv. abc123-def456 (Bunny.net video GUID)" value={form.bunny_video_id} onChange={e=>setForm(f=>({...f,bunny_video_id:e.target.value}))} style={inp} />
              {form.bunny_video_id && (
                <div style={{ marginTop:8 }}>
                  <BunnyEmbed videoId={form.bunny_video_id} libraryId={bunnyLibraryId} />
                </div>
              )}
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Beschrijving</label>
              <textarea rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={{ ...inp, resize:'vertical' }} />
            </div>

            {/* Muscle groups */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Spiergroepen</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                {(form.muscle_groups||[]).map((mg,i)=>(
                  <span key={i} style={{ background:'var(--primary-muted,#ede9fe)', color:'var(--primary)', borderRadius:99, padding:'2px 10px', fontSize:'0.78rem', display:'flex', alignItems:'center', gap:4 }}>
                    {mg}<button type="button" onClick={()=>removeMg(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:0, lineHeight:1 }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <input placeholder="Spiergroep toevoegen..." value={mgInput} onChange={e=>setMgInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addMg() }}}
                  style={{ flex:1, ...inp }} />
                <button type="button" className="btn" onClick={addMg}><Plus size={14} /></button>
              </div>
            </div>

            {/* Instructions */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Stappenplan (instructies)</label>
              <ol style={{ margin:'0 0 8px', paddingLeft:20 }}>
                {(form.instructions||[]).map((step,i)=>(
                  <li key={i} style={{ fontSize:'0.83rem', marginBottom:4, display:'flex', alignItems:'flex-start', gap:6 }}>
                    <span style={{ flex:1 }}>{step}</span>
                    <button type="button" onClick={()=>removeInstr(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--error,#dc2626)', padding:0, lineHeight:1 }}>×</button>
                  </li>
                ))}
              </ol>
              <div style={{ display:'flex', gap:6 }}>
                <input placeholder="Stap toevoegen..." value={instrInput} onChange={e=>setInstrInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); addInstr() }}}
                  style={{ flex:1, ...inp }} />
                <button type="button" className="btn" onClick={addInstr}><Plus size={14} /></button>
              </div>
            </div>

            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Thuis-alternatief (notitie)</label>
              <input placeholder="Bijv. 'Vervangen door bodyweight squats'" value={form.home_alternative_notes} onChange={e=>setForm(f=>({...f,home_alternative_notes:e.target.value}))} style={inp} />
            </div>
          </div>

          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Save size={14} />{saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button type="button" className="btn" onClick={()=>setEditing(null)} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <X size={14} />Annuleren
            </button>
          </div>
        </form>
      )}

      {/* Exercise list */}
      {loading ? (
        <div style={{ color:'var(--text-muted)', textAlign:'center', padding:40 }}>Laden...</div>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          {filtered.map(ex => (
            <div key={ex.id} style={{
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px',
              display:'flex', alignItems:'center', gap:12, flexWrap:'wrap',
              opacity: ex.active ? 1 : 0.55,
            }}>
              <div style={{ flex:1, minWidth:140 }}>
                <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{ex.name}</div>
                <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:2 }}>
                  {ex.category} · {ex.equipment} · {ex.difficulty} · {ex.default_sets}×{ex.default_reps} · {ex.default_rest_seconds}s rust
                </div>
              </div>
              {Array.isArray(ex.muscle_groups) && ex.muscle_groups.length > 0 && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                  {ex.muscle_groups.slice(0,3).map((mg,i)=>(
                    <span key={i} style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:99, padding:'1px 7px', fontSize:'0.7rem', color:'var(--text-muted)' }}>{mg}</span>
                  ))}
                </div>
              )}
              {ex.bunny_video_id && (
                <span style={{ background:'#fef3c7', color:'#92400e', borderRadius:99, padding:'2px 8px', fontSize:'0.7rem', fontWeight:600 }}>
                  <Video size={10} style={{ verticalAlign:'middle', marginRight:3 }} />video
                </span>
              )}
              <div style={{ display:'flex', gap:6 }}>
                {ex.bunny_video_id && (
                  <button className="btn" onClick={()=>setPreviewEx(ex)} style={{ padding:'4px 8px', fontSize:'0.75rem' }}>
                    Preview
                  </button>
                )}
                <button className="btn" onClick={()=>openEdit(ex)} style={{ padding:'4px 8px', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:4 }}>
                  <Edit2 size={12} />Bewerk
                </button>
                <button className="btn" onClick={()=>toggleActive(ex)} style={{ padding:'4px 8px', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:4 }}>
                  {ex.active ? <EyeOff size={12} /> : <Eye size={12} />}
                  {ex.active ? 'Verberg' : 'Toon'}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ color:'var(--text-muted)', textAlign:'center', padding:32 }}>Geen oefeningen gevonden.</div>}
        </div>
      )}
    </div>
  )
}

const lbl = { fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:4 }
const inp = { width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', background:'var(--bg)', color:'var(--text)', boxSizing:'border-box' }
