# Teacher guide

**Her link: https://iamdexterdude.github.io/8.5/** That is all she needs. Nothing to type, no code, no setup. She opens it, sees her name, and whatever you publish (homework, a mock, a deck, a note) appears the next time she opens the app.

**Your password** is the one you chose (it is never written in this repository). Change it in Teacher mode, Class, Password (4 characters or more). The hash in the feed repo is mixed with a secret kept on Vercel, so it cannot be cracked offline; online guesses are limited to 8 per 15 minutes.

## What she sees (25 Oct layout)

| Tab | What it is |
| --- | --- |
| **Today** | A greeting for the time of day over the ikat from the welcome, the lesson (countdown, Join), your short note if you set one, then **the next small thing** (today's or yesterday's homework, the unfinished mock, the cards due, or, when nothing is waiting, one small idea for the day, Sundays included), one **observation** about her own days (late nights, homework finished after midnight or days late, a chain about to break, days away, coming early, a steady week) with a one-tap reply that reaches you, and one or two check-in questions that change every day. The week line shows her active days, reviews, homework and mock parts. No homework steps here. |
| **Homework** | The day's tasks, done fully in the app, step by step. The tab icon gives a small jump now and then while homework is waiting. Older days are listed below. |
| **Mock** | The full tests you publish, one card each: Listening, Reading, Writing, Speaking, in that order, each in the screens of the computer-delivered IELTS (clock, Hide, question palette, Review flags, passage beside the questions, highlighter, essay editor with word count, recorded speaking parts). Listening and Reading are marked at once; Writing and Speaking go to you. Every time she leaves the screen is counted and shown to her at the end, kindly. |
| **Anki** | Starts empty. She makes her own decks and cards (name, edit, delete, suspend, forget, practise all), reviews with four grades (FSRS). Your decks arrive here after lessons; your note shows once, at the top. |
| **Progress** | Only the mocks: bands per part, the overall once all four are in, the trend across mocks, her speaking recordings kept so she can hear herself months apart, and your note on each mock. |

## Teacher mode

Open the app, Settings, the small **Teacher** link at the bottom (or go to `#/admin`), type the password.

- **Send to Claude**: pick what you are sending, **Homework**, **Mock** or **Deck**, write it in your own words, attach the files (up to 60 MB; for a mock: the PDFs of the Listening, Reading and Writing papers, the answer keys, the listening audio, the speaking questions), press **Send**. The screen shows where it has got to and Telegram tells you when it is live. It needs the PC on (the watcher runs there, hidden). To correct something, send a note for the same day or mock.
- **Her work**: what she has done, from the small report her app sends: her habits (active days this week, the hour she usually starts, nights after 23:00, homework finished late or at night, last active day), Anki (decks, cards, due, reviews in the last 14 days), each mock part with band and leaves, homework days, her check-in and observation answers, her streak.
- **Mocks**: for each mock she has finished, type the Writing band, the Speaking band and a short note. The bands appear on her Mock and Progress screens and complete the overall.
- **Anki**: a note for her Anki tab (shown once, as one quiet notification) and a quick deck (one line per card, `front — back`), published straight away.
- **Class**: her name, your Telegram username, lesson days, time and link, a note for Today, a Telegram test, the password.
- **Music**: the list the finish screen draws from.

## What she sends you

Everything arrives in your Telegram from the 8.5 bot, named so it sorts itself:
- homework: `2026-10-14_speaking-written-answers.pdf`, `2026-10-14_speaking-recordings_Q1.webm`;
- mocks: `mock-01_writing_task1.txt`, `mock-01_writing_task2.txt`, `mock-01_speaking_1_part1.webm` … plus one line per part ("Muslima finished Mock 1 Listening: band 7.5 (33/40), left the screen 1×");
- her check-in answers, one line each.
If she is offline, files wait on her phone and go when she is back.

## Homework step types

| Step | What she does | What reaches you |
| --- | --- | --- |
| `questions` | reads the topics and questions (optional link to a file) | nothing |
| `read` | reads a sample answer with your highlighted phrases (optional link) | nothing |
| `words` | adds the words as a named deck in Anki | nothing |
| `watch` | opens the video link, ticks "I watched it" | nothing |
| `photos` | photographs her pages; the app makes **one PDF** | the PDF, on Telegram |
| `record` | records one audio answer per question | one audio file per question |
| `check` | confirms she did something | nothing |
| `text` | a note or link | nothing |

Until you publish a day she sees "No homework yet" and can ask (a Telegram line to you). When every step is done she gets the finish screen: the time, one line, and the next track from your Music list.

## Mocks, in detail

- A mock is `mocks/<id>/mock.json` in the feed (scrambled), with the listening audio in scrambled 4 MB pieces next to it. The format, every question type (gap, table, mcq, multi, match, headings, tfng, ynng, short) and the rules Claude follows are in `.claude/skills/publish-mock/SKILL.md`. Ids are `mock-01`, `mock-02`, …
- She must do the parts in order. Listening: the recording plays once, then two minutes to check. Reading and Writing: 60 minutes each, the clock keeps running if she closes the screen, and the part is handed in by itself when time is up. Speaking: each question records by itself after it appears; Part 2 has the one-minute preparation with notes.
- Listening and Reading are marked on her device (spelling, "(the) library" and "colour/color" forms, numbers with or without spaces all accepted as in the key; a shorter test is scaled to 40). Writing texts and recordings come to you.
- Your estimate: Teacher mode, Mocks, or `node tools/teacher/publish.mjs estimate mock-01 file.json` with `{ "writing": { "band": 7.0 }, "speaking": { "band": 7.5 }, "note": "…" }`.

## Send to Claude, behind the scenes

1. Teacher mode sends your note, the kind (homework, mock, deck) and the files, in pieces, through the relay into `requests/<id>/` in the feed repo, scrambled like everything else there.
2. `tools/teacher/watch.mjs` on the PC looks there every 15 seconds. Task Scheduler starts it hidden at logon and every five minutes makes sure it is running ("8.5 homework watcher"). Install or reinstall it with `tools/teacher/install-watcher.cmd`; remove it with `install-watcher.cmd -Remove`. Its log is `tools/teacher/watch.log`; while it runs, http://127.0.0.1:47185 says what it is doing.
3. It puts the note, the files and some context (what is published, the class settings, the next mock id) into `work/requests/<id>/` and runs Claude Code headless (`claude -p`, your own Claude login, no extra cost) with the matching skill: `publish-homework`, `publish-mock` or `publish-deck`. Claude may only read, write inside that folder, and run the check commands.
4. The watcher checks the result (Claude gets one chance to fix a problem), publishes it (`publish.mjs homework|mock|deck`), writes `requests/<id>/status.json` (what the Teacher mode screen shows), and sends the Telegram message through the relay.
5. Telegram is only used to *tell* you; nothing listens to the bot, so no Claude Code session has to be open.

Tell Claude in chat how you like things ("always add a words step", "Part 2 gets 90 seconds") and it adds the line to the skill file, so every later request follows it.

## Your own Telegram bot

Her files and Claude's messages come from the bot whose token is in the relay. To use a new bot just for 8.5: in Telegram open @BotFather, send `/newbot`, copy the token, then double-click `tools/teacher/set-bot.cmd`, paste the token, and press Start in the new bot when it asks. It finds your chat, saves both in Vercel, redeploys the relay and sends a test message.

## How it works (free, no server of yours)

- Homework, mocks, decks, notes and your estimates are scrambled JSON files in the public repo `iamdexterdude/8.5-feed`; the app reads them directly. Her small progress report goes back into the same repo (`students/<name>.json`) through the relay, so Teacher mode can show it on any device.
- Publishing and her uploads go through one small function on Vercel (`backend/`, free plan, `https://eight-five-publish.vercel.app/api`). It holds the GitHub token and the Telegram bot token; the app never does. It checks your password against `teacher.json` in the feed repo.
- The GitHub token in Vercel is the `gh` login from this PC. If `gh auth logout` is ever run, publishing from the app stops: make a fine-grained token (Contents: read and write on `8.5-feed` only) and `cd backend && vercel env add GITHUB_TOKEN production`, then `vercel --prod`.
- The Telegram bot is set in the relay (`TG_BOT_TOKEN`, `TG_CHAT_ID`); `tools/teacher/set-bot.cmd` changes it.

## Command line (what Claude uses)

```
node tools/teacher/publish.mjs homework file.json        publish one day
node tools/teacher/publish.mjs check file.json           check a day without publishing
node tools/teacher/publish.mjs mock <folder>             publish a mock (mock.json + the audio files in the folder)
node tools/teacher/publish.mjs checkmock <folder>        check a mock without publishing
node tools/teacher/publish.mjs deck file.json            publish an Anki deck { id, name, note, cards: [{ front, back, example }] }
node tools/teacher/publish.mjs estimate <mockId> file.json   your Writing/Speaking bands and note for a mock
node tools/teacher/publish.mjs note anki|today "text"    a note for her Anki tab or for Today
node tools/teacher/publish.mjs config file.json          class settings (name, Telegram username, lesson days, time and link, music)
node tools/teacher/publish.mjs student                   print her latest report
node tools/teacher/publish.mjs password <new>            set or change the password
node tools/teacher/publish.mjs list | show <date> | remove <path> | requests
node tools/teacher/watch.mjs --once                      handle waiting requests now, in this window
```

A homework file: `{ "date": "2026-10-15", "lesson": { "no": "3", "title": "…", "focus": "…", "time": "19:00" }, "tasks": [ { "title": "Speaking", "summary": "…", "minutes": 120, "steps": [ { "type": "questions", "title": "Part 1 questions", "groups": [ { "name": "Topic", "questions": ["…"] } ] }, { "type": "read", "title": "Sample answer", "paragraphs": ["…"], "highlights": ["…"] }, { "type": "words", "title": "New words", "cards": [ { "front": "…", "back": "…" } ] }, { "type": "photos", "title": "Your written answers", "prompt": "…" }, { "type": "record", "title": "Record your answers", "questions": ["…"], "max": 90 } ] } ] }`
