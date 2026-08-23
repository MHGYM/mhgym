/**
 * badges.js — centrale badge-catalogus.
 *
 * Puur data: icoon, label en omschrijving per badge. De toekenningsregel
 * (wanneer een badge wordt verdiend) staat bewust NIET hier, maar geïsoleerd
 * in src/services/badgeService.js — zo blijft "wat een badge is" gescheiden
 * van "hoe je hem verdient", en kan een nieuwe badge later worden toegevoegd
 * door hier één regel toe te voegen plus één case in badgeService.js, zonder
 * de frontend te hoeven aanpassen (die itereert simpelweg over deze lijst).
 *
 * Geen medische claims: omschrijvingen benoemen uitsluitend meetbare feiten
 * (aantal metingen, geregistreerde verandering), nooit een gezondheidsoordeel.
 */

const BADGES = [
  {
    key: 'eerste_meting',
    icon: '🏆',
    label: 'Eerste Meting',
    description: 'Eerste meetresultaat toegevoegd.',
  },
  {
    key: 'consistent',
    icon: '🔥',
    label: 'Consistent',
    description: 'Meerdere meetmomenten geregistreerd.',
  },
  {
    key: 'progressie',
    icon: '📈',
    label: 'Progressie',
    description: 'Meetbare verandering vastgesteld tussen twee meetmomenten.',
  },
  {
    key: 'sterke_start',
    icon: '💪',
    label: 'Sterke Start',
    description: 'Eerste complete meetresultaat opgeslagen.',
  },
  {
    key: 'doel_bereikt',
    icon: '🎯',
    label: 'Doel Bereikt',
    description: 'Een door de trainer ingesteld doel is bereikt.',
  },
  {
    key: 'toegewijd',
    icon: '⭐',
    label: 'Toegewijd',
    description: 'Meerdere opeenvolgende meetmomenten geregistreerd.',
  },
];

const BADGE_BY_KEY = Object.fromEntries(BADGES.map(b => [b.key, b]));

module.exports = { BADGES, BADGE_BY_KEY };
