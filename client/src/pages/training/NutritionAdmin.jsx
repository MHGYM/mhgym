import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Save, X, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../api'

const GOALS = ['algemeen','vetverbranding','spiermassa','kracht','hiit','bulk','cut']
const lbl = { fontSize:'0.78rem', fontWeight:600, display:'block', marginBottom:4 }
const inp = { width:'100%', padding:'7px 10px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem', background:'var(--bg)', color:'var(--text)', boxSizing:'border-box' }
const EMPTY_PLAN = { name:'', goal:'algemeen', description:'', calories_target:'', protein_g:'', carbs_g:'', fat_g:'', active:1 }
const EMPTY_MEAL = { name:'', description:'', calories:'', protein:'', carbs:'', fat:'' }

export default function NutritionAdmin() {
  const [plans, setPlans]     = useState([])
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [editPlan, setEditPlan] = useState(null)
  const [planForm, setPlanForm] = useState(EMPTY_PLAN)
  const [openPlan, setOpenPlan] = useState(null)  // full plan detail
  const [dayForm, setDayForm] = useState({ day_number:1, day_name:'Dag 1', meals:[] })
  const [showDayForm, setShowDayForm] = useState(false)
  const [meals, setMeals]     = useState([])       // temp meals for day form
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')
  const [assignForm, setAssignForm] = useState({ user_id:'', nutrition_plan_id:'' })
  const [showAssign, setShowAssign] = useState(false)

  const load = async () => {
    setLoading(true)
    const [ps, us] = await Promise.all([
      api.get('/training/admin/nutrition').then(r => r.data.plans),
      api.get('/training/admin/users').then(r => r.data.users),
    ])
    setPlans(ps); setUsers(us); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const loadDetail = async (id) => {
    const r = await api.get(`/training/admin/nutrition/${id}`)
    setOpenPlan(r.data.plan)
  }

  const savePlan = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    const body = { ...planForm }
    for (const k of ['calories_target','protein_g','carbs_g','fat_g']) body[k] = body[k] === '' ? null : Number(body[k])
    try {
      if (editPlan === 'new') await api.post('/training/admin/nutrition', body)
      else await api.put(`/training/admin/nutrition/${editPlan.id}`, body)
      setEditPlan(null); load()
      if (openPlan) loadDetail(openPlan.id)
    } catch(e) { setErr(e.response?.data?.error || 'Fout.') }
    finally { setSaving(false) }
  }

  const deletePlan = async (id) => {
    if (!confirm('Plan verwijderen?')) return
    await api.delete(`/training/admin/nutrition/${id}`)
    if (openPlan?.id === id) setOpenPlan(null)
    load()
  }

  const addMealToList = () => setMeals(ms => [...ms, { ...EMPTY_MEAL }])
  const updateMeal = (i, k, v) => setMeals(ms => ms.map((m, j) => j === i ? { ...m, [k]: v } : m))
  const removeMeal = (i) => setMeals(ms => ms.filter((_, j) => j !== i))

  const saveDay = async (e) => {
    e.preventDefault(); setSaving(true); setErr('')
    const mealsPayload = meals.map(m => ({
      name: m.name,
      description: m.description || null,
      calories: m.calories ? Number(m.calories) : null,
      protein:  m.protein  ? Number(m.protein)  : null,
      carbs:    m.carbs    ? Number(m.carbs)     : null,
      fat:      m.fat      ? Number(m.fat)       : null,
    }))
    try {
      await api.post(`/training/admin/nutrition/${openPlan.id}/days`, { ...dayForm, meals: mealsPayload })
      setShowDayForm(false); setMeals([]); setDayForm({ day_number: (openPlan.days?.length||0)+1, day_name:'Dag', meals:[] })
      loadDetail(openPlan.id)
    } catch(e) { setErr(e.response?.data?.error || 'Fout.') }
    finally { setSaving(false) }
  }

  const deleteDay = async (dayId) => {
    if (!confirm('Dag verwijderen?')) return
    await api.delete(`/training/admin/nutrition-days/${dayId}`)
    loadDetail(openPlan.id)
  }

  const handleAssign = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      await api.post('/training/admin/assign-nutrition', {
        user_id: Number(assignForm.user_id),
        nutrition_plan_id: assignForm.nutrition_plan_id ? Number(assignForm.nutrition_plan_id) : null,
      })
      setShowAssign(false)
    } catch(e) { alert(e.response?.data?.error || 'Fout.') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h2 style={{ margin:0, fontSize:'1.1rem' }}>Voedingsplannen ({plans.length})</h2>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn" onClick={() => setShowAssign(v=>!v)} style={{ fontSize:'0.82rem', display:'flex', alignItems:'center', gap:4 }}>
            Koppel aan lid
          </button>
          <button className="btn btn-primary" onClick={() => { setPlanForm(EMPTY_PLAN); setEditPlan('new'); setErr('') }}
            style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.82rem' }}>
            <Plus size={13} />Nieuw plan
          </button>
        </div>
      </div>

      {err && <div style={{ color:'var(--error,#dc2626)', fontSize:'0.83rem', marginBottom:10 }}>{err}</div>}

      {/* Assign plan form */}
      {showAssign && (
        <form onSubmit={handleAssign} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:16, marginBottom:16 }}>
          <h4 style={{ margin:'0 0 12px', fontSize:'0.88rem' }}>Voedingsplan koppelen aan lid</h4>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <div>
              <label style={lbl}>Lid *</label>
              <select required value={assignForm.user_id} onChange={e=>setAssignForm(f=>({...f,user_id:e.target.value}))} style={inp}>
                <option value="">-- kies lid --</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Plan</label>
              <select value={assignForm.nutrition_plan_id} onChange={e=>setAssignForm(f=>({...f,nutrition_plan_id:e.target.value}))} style={inp}>
                <option value="">-- plan ontkoppelen --</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize:'0.82rem' }}>{saving ? 'Opslaan...' : 'Koppelen'}</button>
            <button type="button" className="btn" onClick={() => setShowAssign(false)} style={{ fontSize:'0.82rem' }}>Annuleren</button>
          </div>
        </form>
      )}

      {/* Plan create/edit form */}
      {editPlan && (
        <form onSubmit={savePlan} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:20, marginBottom:16 }}>
          <h3 style={{ margin:'0 0 14px', fontSize:'0.95rem' }}>{editPlan==='new' ? 'Nieuw voedingsplan' : `Bewerken: ${editPlan.name}`}</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Naam *</label>
              <input required value={planForm.name} onChange={e=>setPlanForm(f=>({...f,name:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Doel</label>
              <select value={planForm.goal} onChange={e=>setPlanForm(f=>({...f,goal:e.target.value}))} style={inp}>
                {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Calorieën (kcal)</label>
              <input type="number" min={0} value={planForm.calories_target} onChange={e=>setPlanForm(f=>({...f,calories_target:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Eiwit (g)</label>
              <input type="number" min={0} value={planForm.protein_g} onChange={e=>setPlanForm(f=>({...f,protein_g:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Koolhydraten (g)</label>
              <input type="number" min={0} value={planForm.carbs_g} onChange={e=>setPlanForm(f=>({...f,carbs_g:e.target.value}))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Vetten (g)</label>
              <input type="number" min={0} value={planForm.fat_g} onChange={e=>setPlanForm(f=>({...f,fat_g:e.target.value}))} style={inp} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Beschrijving</label>
              <textarea rows={2} value={planForm.description} onChange={e=>setPlanForm(f=>({...f,description:e.target.value}))} style={{ ...inp, resize:'vertical' }} />
            </div>
            <div>
              <label style={{ ...lbl, display:'flex', alignItems:'center', gap:6 }}>
                <input type="checkbox" checked={!!planForm.active} onChange={e=>setPlanForm(f=>({...f,active:e.target.checked?1:0}))} />
                Actief (zichtbaar)
              </label>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.82rem' }}>
              <Save size={13} />{saving ? 'Opslaan...' : 'Opslaan'}
            </button>
            <button type="button" className="btn" onClick={() => setEditPlan(null)} style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.82rem' }}>
              <X size={13} />Annuleren
            </button>
          </div>
        </form>
      )}

      {/* Plans list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Laden...</div>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          {plans.map(plan => (
            <div key={plan.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:140 }}>
                  <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{plan.name}</div>
                  <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:1 }}>
                    {plan.goal}
                    {plan.calories_target ? ` · ${plan.calories_target} kcal` : ''}
                    {!plan.active && <span style={{ color:'var(--error,#dc2626)', marginLeft:8 }}>inactief</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:5 }}>
                  <button className="btn" onClick={() => { if(openPlan?.id===plan.id) setOpenPlan(null); else loadDetail(plan.id) }}
                    style={{ fontSize:'0.75rem', padding:'4px 10px', display:'flex', alignItems:'center', gap:3 }}>
                    {openPlan?.id===plan.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Dagen
                  </button>
                  <button className="btn" onClick={() => { setPlanForm({...plan, calories_target: plan.calories_target||'', protein_g: plan.protein_g||'', carbs_g: plan.carbs_g||'', fat_g: plan.fat_g||'' }); setEditPlan(plan); setErr('') }}
                    style={{ fontSize:'0.75rem', padding:'4px 8px' }}>
                    <Edit2 size={12} />
                  </button>
                  <button className="btn" onClick={() => deletePlan(plan.id)} style={{ fontSize:'0.75rem', padding:'4px 8px', color:'var(--error,#dc2626)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Days panel */}
              {openPlan?.id === plan.id && (
                <div style={{ borderTop:'1px solid var(--border)', padding:'12px 14px', background:'var(--bg)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <span style={{ fontSize:'0.83rem', fontWeight:600 }}>Dagschema's ({openPlan.days?.length||0})</span>
                    <button className="btn" onClick={() => { setShowDayForm(v=>!v); setMeals([]); setDayForm({ day_number:(openPlan.days?.length||0)+1, day_name:`Dag ${(openPlan.days?.length||0)+1}`, meals:[] }) }}
                      style={{ fontSize:'0.75rem', padding:'4px 10px', display:'flex', alignItems:'center', gap:3 }}>
                      <Plus size={11} />Dag toevoegen
                    </button>
                  </div>

                  {/* Add day form */}
                  {showDayForm && (
                    <form onSubmit={saveDay} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:14, marginBottom:12 }}>
                      <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:8, marginBottom:10 }}>
                        <div><label style={lbl}>Dag nr</label><input type="number" min={1} value={dayForm.day_number} onChange={e=>setDayForm(f=>({...f,day_number:Number(e.target.value)}))} style={inp} /></div>
                        <div><label style={lbl}>Naam</label><input value={dayForm.day_name} onChange={e=>setDayForm(f=>({...f,day_name:e.target.value}))} style={inp} /></div>
                      </div>

                      <div style={{ fontSize:'0.8rem', fontWeight:600, marginBottom:6 }}>Maaltijden</div>
                      {meals.map((m, i) => (
                        <div key={i} style={{ background:'var(--bg)', borderRadius:8, padding:10, marginBottom:8, border:'1px solid var(--border)' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                            <div>
                              <label style={{ ...lbl, fontWeight:500 }}>Naam *</label>
                              <input required value={m.name} onChange={e=>updateMeal(i,'name',e.target.value)} placeholder="bijv. Ontbijt" style={inp} />
                            </div>
                            <div>
                              <label style={{ ...lbl, fontWeight:500 }}>Calorieën (kcal)</label>
                              <input type="number" min={0} value={m.calories} onChange={e=>updateMeal(i,'calories',e.target.value)} style={inp} />
                            </div>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:6 }}>
                            <div><label style={{ ...lbl, fontWeight:500 }}>Eiwit (g)</label><input type="number" min={0} value={m.protein} onChange={e=>updateMeal(i,'protein',e.target.value)} style={inp} /></div>
                            <div><label style={{ ...lbl, fontWeight:500 }}>Koolhydr. (g)</label><input type="number" min={0} value={m.carbs} onChange={e=>updateMeal(i,'carbs',e.target.value)} style={inp} /></div>
                            <div><label style={{ ...lbl, fontWeight:500 }}>Vetten (g)</label><input type="number" min={0} value={m.fat} onChange={e=>updateMeal(i,'fat',e.target.value)} style={inp} /></div>
                          </div>
                          <div style={{ marginBottom:4 }}>
                            <label style={{ ...lbl, fontWeight:500 }}>Omschrijving</label>
                            <textarea rows={2} value={m.description} onChange={e=>updateMeal(i,'description',e.target.value)} style={{ ...inp, resize:'vertical' }} placeholder="Ingrediënten, bereiding, tips..." />
                          </div>
                          <button type="button" onClick={() => removeMeal(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--error,#dc2626)', fontSize:'0.75rem', padding:0 }}>
                            <X size={12} style={{ verticalAlign:'middle' }} /> Verwijder maaltijd
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={addMealToList} className="btn" style={{ fontSize:'0.78rem', padding:'4px 10px', display:'flex', alignItems:'center', gap:3, marginBottom:10 }}>
                        <Plus size={11} />Maaltijd toevoegen
                      </button>
                      <div style={{ display:'flex', gap:6 }}>
                        <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize:'0.8rem', padding:'5px 12px' }}>{saving ? 'Opslaan...' : 'Dag opslaan'}</button>
                        <button type="button" className="btn" onClick={() => setShowDayForm(false)} style={{ fontSize:'0.8rem', padding:'5px 10px' }}>Annuleer</button>
                      </div>
                    </form>
                  )}

                  {/* Days list */}
                  {(openPlan.days || []).map(day => {
                    const meals = Array.isArray(day.meals) ? day.meals : []
                    return (
                      <div key={day.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', marginBottom:6, display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:'0.83rem' }}>Dag {day.day_number}: {day.day_name}</div>
                          <div style={{ color:'var(--text-muted)', fontSize:'0.73rem', marginTop:1 }}>
                            {meals.length} maaltij{meals.length !== 1 ? 'den' : 'd'}
                            {meals.length > 0 && `: ${meals.map(m => m.name).join(', ')}`}
                          </div>
                        </div>
                        <button onClick={() => deleteDay(day.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:4 }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
          {plans.length === 0 && !loading && <div style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>Nog geen voedingsplannen.</div>}
        </div>
      )}
    </div>
  )
}
