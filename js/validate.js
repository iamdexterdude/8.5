// Checks a homework object before it is published. Pure, so the app and the teacher's command-line tool share it.
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
