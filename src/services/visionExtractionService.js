/**
 * visionExtractionService.js — leest meetwaarden uit een lichaamsanalyse-/
 * weegschaalrapport-afbeelding.
 *
 * Hergebruikt de bestaande Anthropic-integratie (zelfde patroon en API-key
 * als chatController.js/"Maya") in plaats van een nieuwe, aparte betaalde
 * OCR-dienst — er bestaat nog geen los OCR/vision-abonnement in dit project,
 * en Claude ondersteunt afbeeldingen native, dus dit hergebruikt bestaande
 * infrastructuur i.p.v. iets nieuws toe te voegen.
 *
 * Dit bestand is bewust de ENIGE plek die de AI-provider kent — de rest van
 * de app roept alleen `extractMeasurementValues()` aan. Een latere overstap
 * naar een andere OCR/vision-provider vereist dus alleen een wijziging hier.
 *
 * Belangrijk: als een waarde niet betrouwbaar valt af te lezen, geeft het
 * model `null` terug — er wordt nooit een waarde verzonnen. Elke teruggegeven
 * waarde wordt bovendien op een redelijk bereik gecontroleerd voordat hij
 * wordt geaccepteerd (bescherming tegen bv. een percentage dat als kg wordt
 * teruggegeven of omgekeerd).
 */

const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Veldnaam → [min, max] redelijk bereik. Alles buiten dit bereik wordt als
// onbetrouwbaar beschouwd en op null gezet — nooit gokken, nooit een verkeerde
// eenheid (bv. percentage vs. kg) laten doorglippen.
const FIELD_RANGES = {
  weight_kg:            [20, 300],
  bmi:                  [10, 60],
  body_fat_pct:         [2, 70],
  fat_mass_kg:          [1, 150],
  fat_free_weight_kg:   [10, 250],
  muscle_mass_kg:       [10, 150],
  muscle_rate_pct:      [10, 70],
  skeletal_muscle_kg:   [5, 100],
  bone_mass_kg:         [0.5, 10],
  protein_mass_kg:      [1, 30],
  protein_pct:          [5, 40],
  water_weight_kg:      [5, 100],
  body_water_pct:       [20, 80],
  subcutaneous_fat_pct: [2, 70],
  visceral_fat_rating:  [1, 30],
  bmr_kcal:             [500, 5000],
  body_age:             [5, 100],
  whr:                  [0.5, 1.5],
  ideal_weight_kg:      [20, 200],
  segment_fat_left_arm_pct:     [2, 70],
  segment_fat_right_arm_pct:    [2, 70],
  segment_fat_trunk_pct:        [2, 70],
  segment_fat_left_leg_pct:     [2, 70],
  segment_fat_right_leg_pct:    [2, 70],
  segment_muscle_left_arm_pct:  [10, 70],
  segment_muscle_right_arm_pct: [10, 70],
  segment_muscle_trunk_pct:     [10, 70],
  segment_muscle_left_leg_pct:  [10, 70],
  segment_muscle_right_leg_pct: [10, 70],
};

const FIELD_NAMES = Object.keys(FIELD_RANGES);

const SYSTEM_PROMPT = `Je bent een assistent die uitsluitend numerieke meetwaarden overneemt van een foto van een lichaamsanalyse-/weegschaalrapport (zoals Fitdays of vergelijkbare apparaten).

Geef ALLEEN een geldig JSON-object terug, met exact deze sleutels (geen andere tekst, geen uitleg, geen markdown):
${FIELD_NAMES.map(f => `"${f}"`).join(', ')}

Regels:
- Elke waarde is een getal (gebruik een punt als decimaalteken, bv. 77.3), of null als je het niet zeker en duidelijk kunt aflezen.
- Verzin NOOIT een waarde. Bij twijfel, onleesbaarheid, of als een veld niet op het rapport voorkomt: gebruik null.
- Verwar percentages nooit met kilogrammen of andersom — lees het eenheidsymbool (% of kg) dat op het rapport zelf staat.
- body_age en whr zijn optioneel (Lichaamsleeftijd, Waist-Hip Ratio) — null als niet aanwezig.
- De segment_*-velden zijn de segmentale vet-/spieranalyse per lichaamsdeel (linkerarm/rechterarm/romp/linkerbeen/rechterbeen) — null als het rapport geen segmentale analyse toont.

Geef daarnaast een sleutel "notes": een korte (max 1 zin) toelichting in het Nederlands als iets opvallend onleesbaar was, anders een lege string.

Geef UITSLUITEND het JSON-object terug, niets ervoor of erna.`;

/** Ontleedt en valideert het door het model teruggegeven JSON-object. */
function parseAndValidate(rawText) {
  let parsed;
  try {
    const match = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : rawText);
  } catch (_) {
    return null;
  }

  const values = {};
  for (const field of FIELD_NAMES) {
    const raw = parsed[field];
    const num = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseFloat(raw.replace(',', '.')) : NaN);
    const [min, max] = FIELD_RANGES[field];
    values[field] = (Number.isFinite(num) && num >= min && num <= max) ? num : null;
  }

  const notes = typeof parsed.notes === 'string' ? parsed.notes.slice(0, 500) : null;
  return { values, notes };
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType — 'image/jpeg' | 'image/png' | 'image/webp'
 * @returns {Promise<{ status: 'extracted'|'failed', values: object, notes: string|null }>}
 */
async function extractMeasurementValues(imageBuffer, mimeType) {
  const emptyValues = Object.fromEntries(FIELD_NAMES.map(f => [f, null]));

  const client = getClient();
  if (!client) {
    return { status: 'failed', values: emptyValues, notes: 'ANTHROPIC_API_KEY is niet geconfigureerd — automatische uitlezing is niet beschikbaar.' };
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') } },
          { type: 'text', text: 'Lees de meetwaarden van dit rapport af volgens de instructies.' },
        ],
      }],
    });

    const text = response.content?.[0]?.text || '';
    const result = parseAndValidate(text);
    if (!result) {
      return { status: 'failed', values: emptyValues, notes: 'Kon de uitlezing niet interpreteren.' };
    }
    return { status: 'extracted', values: result.values, notes: result.notes || null };
  } catch (err) {
    // status/type meeloggen (bv. 401 = ongeldige key, 404 = onbekend model,
    // 429 = rate limit) — cruciaal om dit soort storingen te kunnen
    // onderscheiden zonder dat de admin-UI interne foutdetails hoeft te tonen.
    console.error('[VisionExtraction] Fout:', err.status || err.name, err.message);
    return { status: 'failed', values: emptyValues, notes: 'Automatische uitlezing is mislukt. Vul de waarden zo nodig handmatig in.' };
  }
}

module.exports = { extractMeasurementValues, FIELD_NAMES, parseAndValidate };
