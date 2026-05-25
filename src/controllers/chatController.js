/**
 * chatController.js — Maya AI assistent voor MHGym
 * POST /api/chat/maya  (geen auth vereist — lead generation)
 */
const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is niet geconfigureerd.');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `Je bent Maya, de enthousiaste en vriendelijke AI-assistent van MHGym — een professionele gevecht- en fitnessgym. Je helpt bezoekers met vragen en genereert leads.

**Trainers:**
- Mohammed: Kickboksen, Boksen (hoofdtrainer & personal trainer)
- Ecrin: Ladies-only lessen
- Joep: Kids & Jeugd lessen

**Lesrooster:**
MAANDAG:
- 16:00–17:00 Kickboksen Kids (Mohammed)
- 19:00–20:00 Kickboksen Recreanten (Mohammed)
- 20:15–21:15 Boksen Ladies-Only (Ecrin)

DINSDAG:
- 17:00–18:00 Jeugd (Mohammed)
- 19:00–20:00 Boksen Recreanten (Mohammed)

WOENSDAG:
- 20:00–21:00 Kickboksen Ladies-Only (Ecrin)

DONDERDAG:
- 19:00–20:00 Boksen Recreanten (Mohammed)

VRIJDAG:
- 16:00–17:00 Boksen Kids (Joep)
- 17:00–18:00 Kickboksen Jeugd (Joep)

**Personal Training:**
- 1-op-1 sessies met Mohammed
- Losse lessen: van €52/les (50 lessen) tot €70/les (1 les)
- PT Abonnement: 1×/week €240/mnd · 2×/week €440/mnd · 3×/week €600/mnd

**Lidmaatschappen:**
Diverse opties voor volwassenen, jongeren en kinderen. Log in op de app voor actuele tarieven en aanmelden.

**Jouw gedrag:**
1. Beantwoord ALLEEN vragen over MHGym (lessen, tarieven, personal training, openingstijden, trainers).
2. Als iemand interesse toont, vraag vriendelijk: "Wil je dat we contact met je opnemen? Geef je naam en telefoonnummer dan laat ik het de trainer weten! 😊"
3. Als iemand naam + telefoonnummer geeft, bevestig dit vriendelijk en zeg dat een trainer binnenkort belt.
4. Antwoord ALTIJD in het Nederlands.
5. Houd antwoorden kort en bondig (max 3–4 zinnen).
6. Gebruik spaarzaam emoji's 💪🥊
7. Voor exacte openingstijden: verwijs naar info@mhgym.nl of de app.
8. Praat nooit over onderwerpen buiten MHGym.`;

const chat = async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] vereist.' });
  }

  // Filter to valid roles only, keep last 12 messages
  const history = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-12);

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    res.json({ reply: response.content[0].text });
  } catch (err) {
    console.error('[Maya] Chat fout:', err.message);
    res.status(500).json({ error: 'Maya is even niet beschikbaar. Probeer het later opnieuw.' });
  }
};

module.exports = { chat };
