// The daily cards on Today: a song (a film on Sundays) and a word. Each one ends in English: a phrase for Anki,
// a line she keeps, a sentence she writes for the teacher.
import { h, icon } from "../util.js";
import * as D from "../daily.js";
import { toast } from "../ui.js";

export async function dailyBlock(ctx) {
  let day; try { day = await D.forDay(/^\d{4}-\d{2}-\d{2}$/.test(ctx?.query?.day || "") ? ctx.query.day : undefined); } catch { return null; }   // ?day= lets the teacher preview another day
  const st = D.state(day.date);
  const box = h("section", { class: "daily" }, h("div", { class: "daily-k" }, day.film ? "Sunday: a film and a word" : "A song and a word"));
  const cards = h("div", { class: "dcards" });
  cards.append(day.film ? filmCard(day.film, st, ctx) : songCard(day.song, st, ctx), wordCard(day.word, st, ctx));
  box.append(cards);
  return box;
}

const open = (href, label, cls = "btn small") => h("a", { class: cls, href, target: "_blank", rel: "noopener" }, label);

// the record: the album cover turning slowly on a disc; the drawn rings when there is no cover (or until it loads)
function disc(s) {
  const el = h("div", { class: "vinyl", "aria-hidden": "true" }, h("i"));
  const show = (url) => { if (!url) return; const img = new Image(); img.alt = ""; img.onload = () => { el.append(img); el.classList.add("art"); }; img.src = url; };
  if (s.art) show(s.art); else D.artFor(s).then(show).catch(() => {});
  return el;
}
// the poster, with the reel behind it until it loads
function poster(f) {
  const el = h("div", { class: "reel", "aria-hidden": "true" });
  if (f.poster) { const img = new Image(); img.alt = ""; img.onload = () => { el.append(img); el.classList.add("poster"); }; img.src = f.poster; }
  return el;
}

// a phrase that opens to its meaning, with a way into Anki
function phrase(p, source, done, onKeep) {
  const meaning = h("div", { class: "ph-m", hidden: true }, p.m);
  const keep = h("button", { class: "btn small quiet", disabled: !!done, onclick: async () => { await D.keepPhrase(p, source); keep.disabled = true; keep.textContent = "In Anki"; toast("Kept in Anki, From songs and films."); onKeep?.(); } }, done ? "In Anki" : "+ Anki");
  const btn = h("button", { class: "ph", "aria-expanded": "false", onclick: () => { const on = meaning.hidden; meaning.hidden = !on; btn.setAttribute("aria-expanded", String(on)); btn.classList.toggle("on", on); } }, h("span", { class: "ph-p" }, p.p), h("span", { class: "ph-arrow" }, icon("chevron", 14)));
  return h("div", { class: "phrase" }, h("div", { class: "ph-row" }, btn, keep), meaning);
}

// a line of her own that goes to the teacher, and optionally to Anki
function write({ prompt, ph, kind, done, toAnki = null, source = "" }) {
  const sec = h("div", { class: "dwrite" }, h("div", { class: "dw-k" }, prompt));
  if (done) { sec.replaceChildren(h("div", { class: "dw-k sent" }, toAnki ? "Kept in Anki and sent to your teacher" : "Sent to your teacher"), h("p", { class: "ask-echo" }, h("span", { class: "muted" }, prompt + " "), h("b", null, done))); return sec; }
  const ta = h("textarea", { rows: 2, placeholder: ph, "aria-label": prompt, maxLength: 300 });
  const send = async () => {
    const text = ta.value.trim(); if (!text) return;
    if (toAnki) await toAnki(text);
    await D.tell(kind, prompt, text); await D.mark(kind, text);
    sec.replaceChildren(h("div", { class: "dw-k" }, toAnki ? "Kept in Anki and sent to your teacher" : "Sent to your teacher"), h("p", { class: "ask-echo" }, h("b", null, text)));
  };
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  sec.append(ta, h("div", { class: "row-actions" }, h("button", { class: "btn primary small", onclick: send }, icon("send", 16), toAnki ? "Keep" : "Send")));
  return sec;
}

function songCard(s, st, ctx) {
  const src = D.sourceOf(s);
  const card = h("article", { class: "dcard song", style: { "--i": 0 } },
    h("div", { class: "dc-top" }, disc(s), h("div", { class: "dc-head" }, h("div", { class: "dc-k" }, s.teacher ? "Your teacher's pick" : "Song of the day"), h("h3", null, s.title), h("p", { class: "dc-sub" }, [s.artist, s.year].filter(Boolean).join(" · ")))),
    h("p", { class: "dc-why" }, s.why),
    h("div", { class: "row-actions" }, open(D.listenLink(s), [icon("volume", 16), "Listen"], "btn small primary"), s.teacher ? null : open(D.lyricsLink(s), "Lyrics")),
    s.ask ? h("p", { class: "dc-ask" }, h("b", null, "While you listen: "), s.ask) : null,
    s.focus ? phrase(s.focus, src, st.songPhrase, () => D.mark("songPhrase", 1)) : null,
    write({ prompt: "A line you liked, as you heard it", ph: "Five to ten words is enough", kind: "song", done: st.song, toAnki: (t) => D.keepLine(t, src), source: src }));
  card.append(share(st));
  return card;
}

function filmCard(f, st, ctx) {
  const src = `“${f.title}” (${f.year})`;
  return h("article", { class: "dcard film", style: { "--i": 0 } },
    h("div", { class: "dc-top" }, poster(f), h("div", { class: "dc-head" }, h("div", { class: "dc-k" }, "Film for Sunday"), h("h3", null, f.title), h("p", { class: "dc-sub" }, `${f.year} · ${f.dir}`))),
    h("p", { class: "dc-why" }, f.why),
    h("div", { class: "row-actions" }, open(D.trailerLink(f), [icon("volume", 16), "Trailer"], "btn small primary"), open(D.watchLink(f), "Where to watch")),
    f.listen ? h("div", null, h("p", { class: "dc-ask" }, h("b", null, "Listen for: ")), phrase(f.listen, src, st.filmPhrase, () => D.mark("filmPhrase", 1))) : null,
    write({ prompt: "After the film: " + f.ask, ph: "Two or three sentences, as you would say them in Part 3", kind: "film", done: st.film }),
    share(st));
}

function wordCard(w, st, ctx) {
  const keep = h("button", { class: "btn small " + (st.word ? "quiet" : "primary"), disabled: !!st.word, onclick: async () => { await D.keepWord(w); await D.mark("word", 1); keep.disabled = true; keep.className = "btn small quiet"; keep.textContent = "In Anki"; toast("Kept in Anki, Word of the day."); } }, st.word ? "In Anki" : "+ Anki");
  return h("article", { class: "dcard word", style: { "--i": 1 } },
    h("div", { class: "dc-k" }, "Word of the day"),
    h("div", { class: "dword" }, w.w), h("div", { class: "dc-sub" }, w.pos),
    h("p", { class: "dc-m" }, w.m),
    h("p", { class: "dc-ex" }, w.ex),
    h("div", { class: "chips" }, (w.col || []).map((c) => h("span", { class: "chip static" }, c)), keep),
    write({ prompt: w.say, ph: "One sentence with the word in it", kind: "wordSay", done: st.wordSay }));
}

// her own pick of the day, for the teacher (and, through him, for the next student)
function share(st) {
  if (st.pick) return h("p", { class: "dc-pick done" }, h("span", { class: "dw-k" }, "Your pick today "), h("b", null, st.pick));
  const box = h("div", { class: "dc-pick" });
  const openIt = () => {
    const ta = h("textarea", { rows: 2, placeholder: "Song or film, who by, and one line on why", "aria-label": "Your pick", maxLength: 300 });
    const send = async () => { const t = ta.value.trim(); if (!t) return; await D.tell("pick", "Her pick of the day", t); await D.mark("pick", t); box.replaceChildren(h("span", { class: "dw-k" }, "Sent to your teacher "), h("b", null, t)); };
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    box.replaceChildren(h("div", { class: "dw-k" }, "Your pick for your teacher"), ta, h("div", { class: "row-actions" }, h("button", { class: "btn primary small", onclick: send }, icon("send", 16), "Send")));
  };
  box.append(h("button", { class: "linkbtn", onclick: openIt }, "Share your own pick of the day"));
  return box;
}
