import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronUp, Dumbbell, BedDouble } from 'lucide-react'
import api from '../../api'

const GOALS      = ['vetverbranding','spiermassa','kracht','hiit','full_body','splits','thuis']
const DIFFICULTY = ['beginner','intermediate','advanced']
const EQUIPMENT  = ['gym','home','both']

const EMPTY_PROG = { name:'', goal:'full_body', description:'', difficulty:'beginner', duration_weeks:4, sessions_per_week:3, equipment:'gym', thumbnail_url:'', sort_order:0, active:1 }
const EMPTY_DAY  = { week_number:1, day_number:1, day_name:'Training', focus:'', is_rest_day:0, sort_order:0 }

const lbl = { fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:4 }
const inp = { width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', background:'var(--bg)', color:'var(--text)', boxSizing:'border-box' }

export default function ProgramAdmin() {
  const [programs, setPrograms]   = useState([])
  const [exercises, setExercises] = useState([])
  const [loading, setLoading]     = useState(true)
  const [openProg, setOpenProg]   = useState(null)    // program detail id
  const [editProg, setEditProg]   = useState(null)    // null | 'new' | program
  const [progForm, setProgForm]   = useState(EMPTY_PROG)
  const [dayForm, setDayForm]     = useState(EMPTY_DAY)
  const [showDayForm, setShowDayForm] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [exSearch, setExSearch]   = useState('')
  const [addExDay, setAddExDay]   = useState(null)    // day id being edited for exercise add
  const [exForm, setExForm]       = useState({ exercise_id:'', sets:3, reps:'10', rest_seconds:60, notes:'', sort_order:0 })

  const load = async () => {
    setLoading(true)
    const [progs, exs] = await Promise.all([
      api.get('/training/admin/programs').then(r => r.data.programs),
      api.get('/training/admin/exercises').then(r => r.data.exercises),
    ])
    setPrograms(progs); setExercises(exs); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const loadDetail = async (id) => {
    const r = await api.get(`/training/admin/programs/${id}`)
    setOpenProg(r.data.program)
  }

  const saveProg = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try {
      if (editProg === 'new') {
        await api.post('/training/admin/programs', progForm)
      } else {
        await api.put(`/training/admin/programs/${editProg.id}`, progForm)
      }
      setEditProg(null); load()
      if (openProg) loadDetail(openProg.id)
    } catch(e) { setErr(e.response?.data?.error||'Fout.') }
    finally { setSaving(false) }
  }

  const deleteProg = async (id) => {
    if (!confirm('Programma verwijderen?')) return
    await api.delete(`/training/admin/programs/${id}`)
    if (openProg?.id === id) setOpenProg(null)
    load()
  }

  const saveDay = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    try {
      await api.post(`/training/admin/programs/${openProg.id}/days`, dayForm)
      setShowDayForm(false); setDayForm(EMPTY_DAY)
      loadDetail(openProg.id)
    } catch(e) { setErr(e.response?.data?.error||'Fout.') }
    finally { setSaving(false) }
  }

  const deleteDay = async (dayId) => {
    if (!confirm('Dag verwijderen?')) return
    await api.delete(`/training/admin/days/${dayId}`)
    loadDetail(openProg.id)
  }

  const addExerciseToDay = async (dayId) => {
    if (!exForm.exercise_id) return
    setSaving(true)
    try {
      await api.post(`/training/admin/days/${dayId}/exercises`, exForm)
      setAddExDay(null); setExForm({ exercise_id:'', sets:3, reps:'10', rest_seconds:60, notes:'', sort_order:0 })
      loadDetail(openProg.id)
    } catch(e) { setErr(e.response?.data?.error||'Fout.') }
    finally { setSaving(false) }
  }

  const removeEx = async (peId) => {
    await api.delete(`/training/admin/program-exercises/${peId}`)
    loadDetail(openProg.id)
  }

  const filteredEx = exercises.filter(ex => !exSearch || ex.name.toLowerCase().includes(exSearch.toLowerCase()))

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h2 style={{ margin:0, fontSize:'1.1rem' }}>Programma's beheren ({programs.length})</h2>
        <button className="btn btn-primary" onClick={() => { setProgForm(EMPTY_PROG); setEditProg('new'); setErr('') }}
          style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Plus size={14} />Nieuw programma
        </button>
      </div>

      {err && <div style={{ color:'var(--error,#dc2626)', fontSize:'0.83rem', marginBottom:10 }}>{err}</div>}

      {/* Program create/edit form */}
      {editProg && (
        <form onSubmit={saveProg} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20, marginBottom:20 }}>
          <h3 style={{ margin:'0 0 14px', fontSize:'0.95rem' }}>{editProg==='new' ? 'Nieuw programma' : `Bewerken: ${editProg.name}`}</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Naam *</label>
              <input required value={progForm.name} onChange={e=>setProgForm(f=>({...f,name:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Doel</label>
              <select value={progForm.goal} onChange={e=>setProgForm(f=>({...f,goal:e.target.value}))} style={inp}>
                {GOALS.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Niveau</label>
              <select value={progForm.difficulty} onChange={e=>setProgForm(f=>({...f,difficulty:e.target.value}))} style={inp}>
                {DIFFICULTY.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Materiaal</label>
              <select value={progForm.equipment} onChange={e=>setProgForm(f=>({...f,equipment:e.target.value}))} style={inp}>
                {EQUIPMENT.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Duur (weken)</label>
              <input type="number" min={1} max={52} value={progForm.duration_weeks} onChange={e=>setProgForm(f=>({...f,duration_weeks:Number(e.target.value)}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Sessies/week</label>
              <input type="number" min={1} max={7} value={progForm.sessions_per_week} onChange={e=>setProgForm(f=>({...f,sessions_per_week:Number(e.target.value)}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Volgorde</label>
              <input type="number" value={progForm.sort_order} onChange={e=>setProgForm(f=>({...f,sort_order:Number(e.target.value)}))} style={inp} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Beschrijving</label>
              <textarea rows={2} value={progForm.description} onChange={e=>setProgForm(f=>({...f,description:e.target.value}))} style={{ ...inp, resize:'vertical' }} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Thumbnail URL (optioneel)</label>
              <input value={progForm.thumbnail_url} onChange={e=>setProgForm(f=>({...f,thumbnail_url:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={{ ...lbl, display:'flex', alignItems:'center', gap:6 }}>
                <input type="checkbox" checked={!!progForm.active} onChange={e=>setProgForm(f=>({...f,active:e.target.checked?1:0}))} />
                Zichtbaar voor leden
              </label>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Save size={14} />{saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button type="button" className="btn" onClick={()=>setEditProg(null)} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <X size={14} />Annuleren
            </button>
          </div>
        </form>
      )}

      {/* Program list */}
      {loading ? (
        <div style={{ color:'var(--text-muted)', textAlign:'center', padding:40 }}>Laden...</div>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          {programs.map(prog => (
            <div key={prog.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              {/* Program row */}
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:140 }}>
                  <div style={{ fontWeight:700, fontSize:'0.95rem' }}>{prog.name}</div>
                  <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:2 }}>
                    {prog.goal} · {prog.difficulty} · {prog.equipment} · {prog.duration_weeks}w · {prog.sessions_per_week}x/week
                    {!prog.active && <span style={{ color:'var(--error,#dc2626)', marginLeft:8 }}>verborgen</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn" onClick={()=>{ if(openProg?.id===prog.id) setOpenProg(null); else loadDetail(prog.id) }}
                    style={{ padding:'4px 10px', fontSize:'0.78rem', display:'flex', alignItems:'center', gap:4 }}>
                    {openProg?.id===prog.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {openProg?.id===prog.id ? 'Sluit' : 'Beheer dagen'}
                  </button>
                  <button className="btn" onClick={()=>{ setProgForm({...prog}); setEditProg(prog); setErr('') }}
                    style={{ padding:'4px 8px', fontSize:'0.78rem', display:'flex', alignItems:'center', gap:4 }}>
                    <Edit2 size={12} />
                  </button>
                  <button className="btn" onClick={()=>deleteProg(prog.id)}
                    style={{ padding:'4px 8px', fontSize:'0.78rem', color:'var(--error,#dc2626)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Days panel */}
              {openProg?.id === prog.id && (
                <div style={{ borderTop:'1px solid var(--border)', padding:'12px 16px', background:'var(--bg)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <span style={{ fontSize:'0.83rem', fontWeight:600 }}>Dagen ({openProg.days?.length || 0})</span>
                    <button className="btn" onClick={()=>setShowDayForm(v=>!v)} style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.78rem', padding:'4px 10px' }}>
                      <Plus size={12} />Dag toevoegen
                    </button>
                  </div>

                  {showDayForm && (
                    <form onSubmit={saveDay} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:14, marginBottom:12 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8 }}>
                        <div><label style={lbl}>Week</label><input type="number" min={1} value={dayForm.week_number} onChange={e=>setDayForm(f=>({...f,week_number:Number(e.target.value)}))} style={inp} /></div>
                        <div><label style={lbl}>Dag nr</label><input type="number" min={1} value={dayForm.day_number} onChange={e=>setDayForm(f=>({...f,day_number:Number(e.target.value)}))} style={inp} /></div>
                        <div><label style={lbl}>Naam</label><input value={dayForm.day_name} onChange={e=>setDayForm(f=>({...f,day_name:e.target.value}))} style={inp} /></div>
                        <div><label style={lbl}>Focus</label><input placeholder="bv. Benen" value={dayForm.focus} onChange={e=>setDayForm(f=>({...f,focus:e.target.value}))} style={inp} /></div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, paddingTop:20 }}>
                          <input type="checkbox" id="restday" checked={!!dayForm.is_rest_day} onChange={e=>setDayForm(f=>({...f,is_rest_day:e.target.checked?1:0}))} />
                          <label htmlFor="restday" style={{ fontSize:'0.82rem' }}>Rustdag</label>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, marginTop:10 }}>
                        <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize:'0.8rem', padding:'5px 12px' }}>Opslaan</button>
                        <button type="button" className="btn" onClick={()=>setShowDayForm(false)} style={{ fontSize:'0.8rem', padding:'5px 10px' }}>Annuleer</button>
                      </div>
                    </form>
                  )}

                  {/* Day list */}
                  {(openProg.days||[]).map(day => (
                    <div key={day.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, marginBottom:8, overflow:'hidden' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px' }}>
                        {day.is_rest_day ? <BedDouble size={15} style={{ color:'var(--text-muted)' }} /> : <Dumbbell size={15} style={{ color:'var(--primary)' }} />}
                        <div style={{ flex:1 }}>
                          <span style={{ fontWeight:600, fontSize:'0.85rem' }}>W{day.week_number}D{day.day_number}: {day.day_name}</span>
                          {day.focus && <span style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginLeft:6 }}>— {day.focus}</span>}
                        </div>
                        <div style={{ display:'flex', gap:4 }}>
                          <button className="btn" onClick={()=>setAddExDay(addExDay===day.id ? null : day.id)} style={{ fontSize:'0.75rem', padding:'3px 8px', display:'flex', alignItems:'center', gap:3 }}>
                            <Plus size={11} />Oefening
                          </button>
                          <button className="btn" onClick={()=>deleteDay(day.id)} style={{ fontSize:'0.75rem', padding:'3px 7px', color:'var(--error,#dc2626)' }}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Exercise add form */}
                      {addExDay === day.id && (
                        <div style={{ borderTop:'1px solid var(--border)', padding:'10px 12px', background:'var(--bg)' }}>
                          <input placeholder="Zoek oefening..." value={exSearch} onChange={e=>setExSearch(e.target.value)}
                            style={{ ...inp, marginBottom:6 }} />
                          <select value={exForm.exercise_id} onChange={e=>setExForm(f=>({...f,exercise_id:e.target.value}))}
                            style={{ ...inp, marginBottom:8 }}>
                            <option value="">-- kies oefening --</option>
                            {filteredEx.map(ex=><option key={ex.id} value={ex.id}>{ex.name} ({ex.category})</option>)}
                          </select>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:8 }}>
                            <div><label style={lbl}>Sets</label><input type="number" min={1} value={exForm.sets} onChange={e=>setExForm(f=>({...f,sets:Number(e.target.value)}))} style={inp} /></div>
                            <div><label style={lbl}>Reps</label><input value={exForm.reps} onChange={e=>setExForm(f=>({...f,reps:e.target.value}))} style={inp} /></div>
                            <div><label style={lbl}>Rust(s)</label><input type="number" min={0} value={exForm.rest_seconds} onChange={e=>setExForm(f=>({...f,rest_seconds:Number(e.target.value)}))} style={inp} /></div>
                            <div><label style={lbl}>Volgorde</label><input type="number" value={exForm.sort_order} onChange={e=>setExForm(f=>({...f,sort_order:Number(e.target.value)}))} style={inp} /></div>
                          </div>
                          <input placeholder="Notities (optioneel)" value={exForm.notes} onChange={e=>setExForm(f=>({...f,notes:e.target.value}))} style={{ ...inp, marginBottom:8 }} />
                          <div style={{ display:'flex', gap:6 }}>
                            <button className="btn btn-primary" onClick={()=>addExerciseToDay(day.id)} disabled={saving||!exForm.exercise_id} style={{ fontSize:'0.8rem', padding:'5px 12px' }}>
                              Toevoegen
                            </button>
                            <button className="btn" onClick={()=>setAddExDay(null)} style={{ fontSize:'0.8rem', padding:'5px 10px' }}>Annuleer</button>
                          </div>
                        </div>
                      )}

                      {/* Exercises in day */}
                      {!day.is_rest_day && day.exercises?.length > 0 && (
                        <div style={{ borderTop:'1px solid var(--border)', padding:'6px 12px' }}>
                          {day.exercises.map((pe, idx) => (
                            <div key={pe.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0', borderBottom: idx < day.exercises.length-1 ? '1px solid var(--border)' : 'none', fontSize:'0.82rem' }}>
                              <span style={{ color:'var(--text-muted)', minWidth:20 }}>{pe.sort_order}.</span>
                              <span style={{ flex:1, fontWeight:500 }}>{pe.exercise?.name || `#${pe.exercise_id}`}</span>
                              <span style={{ color:'var(--text-muted)' }}>{pe.sets}×{pe.reps} · {pe.rest_seconds}s</span>
                              <button onClick={()=>removeEx(pe.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:2 }}>
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {programs.length === 0 && <div style={{ color:'var(--text-muted)', textAlign:'center', padding:32 }}>Nog geen programma's aangemaakt.</div>}
        </div>
      )}
    </div>
  )
}
