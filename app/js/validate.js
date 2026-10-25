// Checks before anything is published. Pure, so the app, the teacher's command-line tool and the watcher share it.
export function validateHomework(hw) {
  const errs = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hw.date || "")) errs.push("Pick the date.");
  if (!hw.tasks?.length) errs.push("Add at least one task.");
  const ids = new Set();
  for (const t of hw.tasks || []) {
    if (!t.title) errs.push("Every task needs a title.");
    if (!t.steps?.length) errs.push(`"${t.title || "A task"}" has no steps.`);
    for (const s of t.steps || []) {
      if (!s.id) errs.push(`A step in "${t.title}" has no id.`);
      else if (ids.has(s.id)) errs.push(`Step id "${s.id}" is used twice.`); else ids.add(s.id);
      if (!["questions", "read", "words", "watch", "photos", "record", "check", "text", "link"].includes(s.type)) errs.push(`"${s.title}": unknown step type "${s.type}".`);
      if (s.type === "questions" && !(s.groups || []).some((g) => g.questions?.length)) errs.push(`"${s.title}": add questions.`);
      if (s.type === "read" && !(s.paragraphs || []).length) errs.push(`"${s.title}": add the text.`);
      if (s.type === "words" && !(s.cards || []).length) errs.push(`"${s.title}": add words.`);
      if (s.type === "watch" && !s.url) errs.push(`"${s.title}": add the video link.`);
      if (s.type === "record" && !(s.questions || []).length) errs.push(`"${s.title}": add questions to record.`);
    }
  }
  return errs;
}

const GROUP_TYPES = ["gap", "table", "mcq", "multi", "match", "headings", "tfng", "ynng", "short"];
function groupNumbers(groups, errs, where) {
  const out = [];
  for (const g of groups || []) {
    if (!GROUP_TYPES.includes(g.type)) { errs.push(`${where}: unknown question type "${g.type}".`); continue; }
    if (g.type === "gap" || g.type === "table") {
      const ns = (g.lines || []).flatMap((l) => [...String(l).matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1])));
      if (!ns.length) errs.push(`${where}: a ${g.type} group has no [[n]] blanks.`); out.push(...ns);
    } else if (g.type === "multi") {
      if (!(g.n || []).length || !(g.options || []).length) errs.push(`${where}: a multi group needs n and options.`); out.push(...(g.n || []).map(Number));
    } else {
      if (!(g.items || []).length) errs.push(`${where}: a ${g.type} group has no items.`);
      if ((g.type === "match" || g.type === "headings") && !(g.options || []).length) errs.push(`${where}: a ${g.type} group needs options.`);
      for (const it of g.items || []) { if (it.n == null) errs.push(`${where}: an item has no number.`); if (g.type === "mcq" && !(it.options || []).length) errs.push(`${where}: question ${it.n} has no options.`); out.push(Number(it.n)); }
    }
  }
  return out;
}
export function validateMock(m) {
  const errs = [];
  if (!/^[a-z0-9-]{2,40}$/.test(m.id || "")) errs.push("The mock needs an id like mock-01 (lower-case letters, digits, dashes).");
  if (!m.title) errs.push("Give the mock a title.");
  if (m.date && !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) errs.push("The date must be YYYY-MM-DD.");
  if (!m.listening && !m.reading && !m.writing && !m.speaking) errs.push("The mock has no parts.");
  for (const [sec, key] of [["listening", "parts"], ["reading", "passages"]]) {
    const s = m[sec]; if (!s) continue;
    if (!(s[key] || []).length) errs.push(`${sec}: add ${key}.`);
    const nums = [];
    for (const p of s[key] || []) {
      nums.push(...groupNumbers(p.groups, errs, `${sec} ${key.slice(0, -1)} ${p.no || "?"}`));
      if (sec === "reading" && !p.text) errs.push(`reading passage ${p.no || "?"}: add the text.`);
    }
    const dup = nums.filter((n, i) => nums.indexOf(n) !== i); if (dup.length) errs.push(`${sec}: question numbers used twice: ${[...new Set(dup)].join(", ")}.`);
    const missing = nums.filter((n) => !(s.answers || {})[String(n)]); if (missing.length) errs.push(`${sec}: no answer key for ${missing.join(", ")}.`);
    if (sec === "listening" && !(s.audio || []).length) errs.push("listening: no audio file.");
  }
  if (m.writing && !(m.writing.tasks || []).every((t) => t.prompt && t.no)) errs.push("writing: every task needs no and prompt.");
  if (m.speaking) { const sp = m.speaking; if (!(sp.part1 || []).length && !sp.part2 && !(sp.part3 || []).length) errs.push("speaking: add part1, part2 or part3."); if (sp.part2 && !(sp.part2.card || sp.part2.title)) errs.push("speaking: part2 needs the card text."); }
  return errs;
}
export function validateDeck(d) {
  const errs = [];
  if (!/^[a-z0-9-]{2,40}$/.test(d.id || "")) errs.push("The deck needs an id like lesson-03-words.");
  if (!d.name) errs.push("Give the deck a name.");
  if (!(d.cards || []).length) errs.push("The deck has no cards.");
  for (const c of d.cards || []) if (!c.front || !c.back) errs.push("Every card needs front and back.");
  return errs;
}
