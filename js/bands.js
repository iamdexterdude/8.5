// Band maths. Pure functions, no DOM, so they can be unit-tested in Node.

// Overall band: the four skills are averaged and rounded to the nearest half band.
// An average ending in .25 rounds up to the next half band, .75 up to the next whole band.
// For positive numbers Math.round(avg * 2) / 2 does exactly this.
export function overall(listening, reading, writing, speaking) {
  const avg = (listening + reading + writing + speaking) / 4;
  return Math.round(avg * 2) / 2;
}

// Writing: Task 2 counts double.
export function writingBand(task1, task2) {
  if (task1 == null && task2 == null) return null;
  if (task1 == null) return roundHalf(task2);
  if (task2 == null) return roundHalf(task1);
  return roundHalf((task1 + 2 * task2) / 3);
}

// Speaking: mean of the four criteria, to the nearest half band.
export function speakingBand(criteria) {
  const v = criteria.filter((x) => x != null);
  if (v.length === 0) return null;
  return roundHalf(v.reduce((a, b) => a + b, 0) / v.length);
}

export function roundHalf(x) { return Math.round(x * 2) / 2; }

// table = [[minRaw, band], ...] sorted from the highest raw score down
export function rawToBand(table, raw) {
  for (const [min, band] of table) if (raw >= min) return band;
  return 2;
}

// Which of the plan's routes are still open given the current estimates.
// A route is "within reach" when every skill it needs is at or above the current estimate.
export function routeStatus(route, current) {
  return {
    reading: route.reading - (current.reading ?? 0),
    writing: route.writing - (current.writing ?? 0),
    speaking: route.speaking - (current.speaking ?? 0),
  };
}

// What would each next half band change? (adding 0.5 to one skill, others unchanged)
export function nextHalfBand(skills) {
  const base = overall(skills.listening, skills.reading, skills.writing, skills.speaking);
  const out = {};
  for (const k of ["listening", "reading", "writing", "speaking"]) {
    if (skills[k] >= 9) { out[k] = null; continue; }
    const s = { ...skills, [k]: skills[k] + 0.5 };
    out[k] = { overall: overall(s.listening, s.reading, s.writing, s.speaking), gain: overall(s.listening, s.reading, s.writing, s.speaking) - base };
  }
  return { base, bySkill: out };
}

// The lowest four-skill average that still rounds up to the given overall band (7.75 for an 8).
export function minAverageFor(overallBand) { return overallBand - 0.25; }
