// Consistente eurobedrag-weergave (bv. €1.099,00) — duizendtal-punt + 2 decimalen.
// Gedeeld tussen PersonalTrainingPage.jsx, PtPricingCards.jsx en PtPurchaseWizard.jsx
// zodat prijzen overal identiek geformatteerd worden.
export function formatEuro(n) {
  return `€${Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
