# 8.5

A private, local-first IELTS training companion that installs on a phone or a PC.

- Plain HTML, CSS and ES modules. No framework, no backend, no tracking.
- Everything she does lives in IndexedDB on her own device. Export and import a backup from Settings.
- Works offline once opened (service worker). FSRS spaced repetition through [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), bundled once into `app/vendor/`.

## Run it

```
python -m http.server 8123 --directory app
```

Open http://localhost:8123. Add `?date=2026-10-14` to pretend it is another day (testing only, never saved).

## Layout

| Path | What |
| --- | --- |
| `app/` | the site: `index.html`, `css/`, `js/` (store, router, views), `data/` (plan, config, speaking bank) |
| `content/month-1-plan.md` | the plan, exported from the source document |
| `tools/parse-plan.mjs` | turns the plan into `app/data/plan.json` (run after re-exporting the plan) |
| `tools/build.mjs` | copies `app/` to `dist/` and stamps the service worker |
| `tests/` | `node --test tests/*.test.mjs`: band maths and the plan parser, against the real plan |

## Notes

Course material is not part of this repository. The app can load a private *course pack* file from Settings; it stays in the browser that loaded it.

## Progress report

Progress, Settings and the Sunday rest screen can build a single self-contained HTML dashboard (`app/js/report.js`, `app/report/template.html`): scores against her aims (9, 9, 8, 8 for an overall 8.5), a day-by-day calendar, effort, essays she can open and read, recordings, reading causes, review stats and the error log, with a list of what needs the teacher's attention. It is built on her device and shared by her.
