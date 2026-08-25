// Meetrapport-velden — uitsluitend labels/eenheden, waarden komen altijd uit de API.
// Gedeeld tussen AdminPage.jsx (controleer/bevestig meetgegevens) en
// DashboardPage.jsx (uitgebreide lichaamsanalyse), zodat beide exact dezelfde
// veldnamen/labels tonen.
export const MEASUREMENT_FIELDS = [
  { key: 'weight_kg',           label: 'Gewicht',                  unit: 'kg'   },
  { key: 'bmi',                 label: 'BMI',                      unit: ''     },
  { key: 'body_fat_pct',        label: 'Lichaamsvet',              unit: '%'    },
  { key: 'fat_mass_kg',         label: 'Vetmassa',                 unit: 'kg'   },
  { key: 'fat_free_weight_kg',  label: 'Vetvrij lichaamsgewicht',  unit: 'kg'   },
  { key: 'muscle_mass_kg',      label: 'Spiermassa',               unit: 'kg'   },
  { key: 'muscle_rate_pct',     label: 'Spiersnelheid',            unit: '%'    },
  { key: 'skeletal_muscle_kg',  label: 'Skeletspier',              unit: 'kg'   },
  { key: 'bone_mass_kg',        label: 'Botmassa',                 unit: 'kg'   },
  { key: 'protein_mass_kg',     label: 'Eiwitmassa',               unit: 'kg'   },
  { key: 'protein_pct',         label: 'Eiwit',                    unit: '%'    },
  { key: 'water_weight_kg',     label: 'Watergewicht',             unit: 'kg'   },
  { key: 'body_water_pct',      label: 'Lichaamswater',            unit: '%'    },
  { key: 'subcutaneous_fat_pct',label: 'Onderhuids vet',           unit: '%'    },
  { key: 'visceral_fat_rating', label: 'Visceraal vet',            unit: ''     },
  { key: 'bmr_kcal',            label: 'BMR',                      unit: 'kcal' },
  { key: 'body_age',            label: 'Lichaamsleeftijd',         unit: 'jaar' },
  { key: 'whr',                 label: 'WHR',                      unit: ''     },
  { key: 'ideal_weight_kg',     label: 'Ideaal lichaamsgewicht',   unit: 'kg'   },
]

export const SEGMENT_FIELDS = [
  { key: 'segment_fat_left_arm_pct',     label: 'Vet — linkerarm',    unit: '%' },
  { key: 'segment_fat_right_arm_pct',    label: 'Vet — rechterarm',   unit: '%' },
  { key: 'segment_fat_trunk_pct',        label: 'Vet — romp',         unit: '%' },
  { key: 'segment_fat_left_leg_pct',     label: 'Vet — linkerbeen',   unit: '%' },
  { key: 'segment_fat_right_leg_pct',    label: 'Vet — rechterbeen',  unit: '%' },
  { key: 'segment_muscle_left_arm_pct',  label: 'Spier — linkerarm',  unit: '%' },
  { key: 'segment_muscle_right_arm_pct', label: 'Spier — rechterarm', unit: '%' },
  { key: 'segment_muscle_trunk_pct',     label: 'Spier — romp',       unit: '%' },
  { key: 'segment_muscle_left_leg_pct',  label: 'Spier — linkerbeen', unit: '%' },
  { key: 'segment_muscle_right_leg_pct', label: 'Spier — rechterbeen',unit: '%' },
]

export const ALL_MEASUREMENT_KEYS = [...MEASUREMENT_FIELDS, ...SEGMENT_FIELDS].map(f => f.key)
