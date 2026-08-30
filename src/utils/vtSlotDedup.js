/**
 * Sommige Vrij Trainen-slots zijn per ongeluk meerdere keren aangemaakt met
 * exact dezelfde datum, starttijd, eindtijd en capaciteit — bijvoorbeeld door
 * de herhaal-functie meerdere keren te gebruiken voor overlappende periodes.
 * Dit voegt zulke duplicaten samen tot één boekbaar tijdslot voor de
 * ledenweergave (Agenda + Les boeken), zonder de onderliggende records te
 * wijzigen of te verwijderen — elke boeking blijft gewoon gekoppeld aan zijn
 * eigen slot-record in de database.
 *
 * Gebruikt alleen voor lid-gerichte weergaven. Admin-overzichten blijven de
 * losse records tonen, zodat een admin duplicaten zelf kan opruimen.
 */
function dedupeVtSlots(slots) {
  const groups = new Map();
  for (const s of slots) {
    const key = `${s.date}|${s.start_time}|${s.end_time}|${s.max_bookings}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const result = [];
  for (const rows of groups.values()) {
    if (rows.length === 1) {
      result.push(rows[0]);
      continue;
    }

    // Eigen boeking (indien aanwezig) is altijd het weergegeven slot, anders
    // het eerst aangemaakte slot dat nog plek heeft.
    const mine = rows.find((r) => r.my_booking_id);
    const openSlot = rows
      .filter((r) => Number(r.booking_count || 0) < Number(r.max_bookings))
      .sort((a, b) => a.id - b.id)[0];
    const target = mine || openSlot || rows[0];

    // Werkelijke bezetting = som van alle boekingen over de duplicaten heen,
    // zodat de getoonde capaciteit klopt ook al staan boekingen verspreid
    // over meerdere identieke slot-records.
    const totalBooked = rows.reduce((sum, r) => sum + Number(r.booking_count || 0), 0);

    result.push({
      ...target,
      booking_count: Math.min(totalBooked, target.max_bookings),
    });
  }

  return result.sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date)));
}

module.exports = { dedupeVtSlots };
