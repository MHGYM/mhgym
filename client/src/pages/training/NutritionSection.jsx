import { useState, useEffect } from 'react'
import { Salad, Flame, Beef, Wheat, Droplets, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../api'

function MacroBadge({ label, value, unit = 'g', color }) {
  return (
    <div style={{ textAlign:'center', padding:'10px 14px', background:'var(--bg)', borderRadius:8 }}>
      <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:2 }}>{label}</div>
      <div style={{ fontWeight:800, fontSize:'1.1rem', color }}>{value ?? '—'}</div>
      <div style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>{unit}</div>
    </div>
  )
}

export default function NutritionSection() {
  const [plan, setPlan]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState(null)

  useEffect(() => {
    api.get('/training/my/nutrition')
      .then(r => setPlan(r.data.plan))
      .catch(() => setPlan(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>Laden...</div>

  if (!plan) return (
    <div style={{ textAlign:'center', padding:48, color:'var(--text-muted)' }}>
      <Salad size={40} style={{ marginBottom:12, opacity:.4 }} />
      <div style={{ fontWeight:600, marginBottom:6 }}>Geen voedingsplan gekoppeld</div>
      <div style={{ fontSize:'0.83rem' }}>Jouw trainer koppelt een voedingsplan aan jouw programma.</div>
    </div>
  )

  return (
    <div>
      {/* Plan header */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginBottom:20 }}>
        <h2 style={{ margin:'0 0 4px', fontSize:'1.15rem' }}>{plan.name}</h2>
        {plan.description && <p style={{ color:'var(--text-muted)', margin:'0 0 16px', fontSize:'0.85rem', lineHeight:1.5 }}>{plan.description}</p>}

        {/* Macros */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))', gap:8 }}>
          <MacroBadge label="Calorieën" value={plan.calories_target} unit="kcal" color="var(--primary)" />
          <MacroBadge label="Eiwit"     value={plan.protein_g}       unit="g"    color="#ef4444" />
          <MacroBadge label="Koolhydr." value={plan.carbs_g}         unit="g"    color="#f59e0b" />
          <MacroBadge label="Vetten"    value={plan.fat_g}           unit="g"    color="#3b82f6" />
        </div>
      </div>

      {/* Days */}
      <h3 style={{ fontSize:'0.95rem', marginBottom:10 }}>Dagschema's ({plan.days?.length || 0})</h3>
      {(plan.days || []).length === 0 ? (
        <div style={{ color:'var(--text-muted)', textAlign:'center', padding:32, fontSize:'0.85rem' }}>Nog geen dagschema's toegevoegd.</div>
      ) : (
        (plan.days || []).map(day => {
          const meals = Array.isArray(day.meals) ? day.meals : []
          const totalCal = meals.reduce((sum, m) => sum + (m.calories || 0), 0)
          return (
            <div key={day.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, marginBottom:8, overflow:'hidden' }}>
              <button onClick={() => setOpenDay(openDay === day.id ? null : day.id)}
                style={{ width:'100%', background:'none', border:'none', cursor:'pointer', padding:'11px 16px', display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'var(--primary)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem', fontWeight:800, flexShrink:0 }}>
                  {day.day_number}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:'0.88rem' }}>{day.day_name}</div>
                  <div style={{ color:'var(--text-muted)', fontSize:'0.74rem', marginTop:1 }}>
                    {meals.length} maaltijden{totalCal > 0 ? ` · ~${totalCal} kcal` : ''}
                  </div>
                </div>
                {openDay === day.id ? <ChevronUp size={14} style={{ color:'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color:'var(--text-muted)' }} />}
              </button>

              {openDay === day.id && (
                <div style={{ borderTop:'1px solid var(--border)', padding:16 }}>
                  {meals.length === 0 ? (
                    <div style={{ color:'var(--text-muted)', fontSize:'0.83rem' }}>Geen maaltijden.</div>
                  ) : (
                    meals.map((meal, i) => (
                      <div key={i} style={{ marginBottom: i < meals.length-1 ? 16 : 0 }}>
                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                          <div>
                            <div style={{ fontWeight:600, fontSize:'0.88rem' }}>{meal.name}</div>
                            {meal.description && <div style={{ color:'var(--text-muted)', fontSize:'0.8rem', marginTop:2, lineHeight:1.5 }}>{meal.description}</div>}
                          </div>
                          {(meal.calories || meal.protein || meal.carbs || meal.fat) && (
                            <div style={{ display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
                              {meal.calories && <span style={{ background:'#ede9fe', color:'var(--primary)', borderRadius:99, padding:'1px 8px', fontSize:'0.7rem', fontWeight:700 }}>{meal.calories} kcal</span>}
                              {meal.protein  && <span style={{ background:'#fee2e2', color:'#dc2626', borderRadius:99, padding:'1px 8px', fontSize:'0.7rem' }}>E {meal.protein}g</span>}
                              {meal.carbs    && <span style={{ background:'#fef3c7', color:'#92400e', borderRadius:99, padding:'1px 8px', fontSize:'0.7rem' }}>K {meal.carbs}g</span>}
                              {meal.fat      && <span style={{ background:'#dbeafe', color:'#1d4ed8', borderRadius:99, padding:'1px 8px', fontSize:'0.7rem' }}>V {meal.fat}g</span>}
                            </div>
                          )}
                        </div>
                        {i < meals.length-1 && <hr style={{ margin:'12px 0', border:'none', borderTop:'1px solid var(--border)' }} />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
