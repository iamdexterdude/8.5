# Teacher guide

**Her link: https://iamdexterdude.github.io/8.5/** That is all she needs. Nothing to type, no code, no setup. She opens it, sees her name, and the homework appears on Today as soon as you publish it. (Her name comes from Class settings; the welcome plays once.)

**Your password** is the one you chose (it is never written in this repository). Change it in Teacher mode, Class, Password (4 characters or more). The hash in the feed repo is mixed with a secret kept on Vercel, so it cannot be cracked offline; online guesses are limited to 8 per 15 minutes.

## Each day

Open the app, Settings, the small **Teacher** link at the bottom (or go to `#/admin`), type the password.

**A. Tell Claude** (the easiest). Write the homework in your own words: the date, each task (speaking, writing, reading), the topics and questions, what she must read, watch, write, photograph or record, links. Attach the PDFs or photos it needs, and press **Send to Claude**. That is all:
- the screen shows where it has got to (waiting for the PC, Claude is building it, publishing, published) and Telegram tells you when the day is live, with a few lines on what Claude set;
- it needs the PC switched on (the watcher runs there, hidden, from logon). If the PC is off, the request waits in the feed and goes through when the PC is back;
- to correct a day, send a note for the same day ("change the Part 1 questions to …"): Claude sees what is published and changes only that;
- how Claude builds the day is written in `.claude/skills/publish-homework/SKILL.md`. Tell Claude in chat how you like things ("always add a words step", "record only five questions") and it adds the line to that file, so every later day follows it.
- **Copy for Claude Code** is the fallback: paste the text into Claude Code in this folder.

**B. Build it yourself** (Homework tab). Pick the day, fill the lesson title and "What we cover", add tasks from the templates (Speaking Part 1, Writing notes, Reading video, blank), fill each step, **Preview as the student**, **Publish to the student**. "Copy the day before" starts from yesterday's draft; the chips show which days are published; **Unpublish** removes a day.

She sees it the next time she opens Today (she can also pull it with the **Ask for the homework** button, which messages you).

## What she sends you

Her photos (made into one PDF on her phone) and her recordings arrive in your Telegram, from the 8.5 bot, named like `2026-10-14_speaking-written-answers.pdf` and `2026-10-14_speaking-recordings_Q1.webm`. If she is offline, they wait on her phone and go when she is back.

## Step types

| Step | What she does | What reaches you |
| --- | --- | --- |
| `questions` | reads the topics and questions (optional link to a file) | nothing |
| `read` | reads a sample answer with your highlighted phrases (optional link) | nothing |
| `words` | adds the words as a named deck in Review | nothing |
| `watch` | opens the video link, ticks "I watched it" | nothing |
| `photos` | photographs her pages; the app makes **one PDF** | the PDF, on Telegram |
| `record` | records one audio answer per question | one audio file per question |
| `check` | confirms she did something | nothing |
| `text` | a note or link | nothing |

Until you publish a day she sees "No homework yet". When every step is done she gets the finish screen: the time, one line, and the next track from your **Music** list (Teacher mode, Music; publish the list; 30 tracks fit fine).

## Send to Claude, behind the scenes

1. Teacher mode sends your note (and the files, in pieces) through the relay into `requests/<id>/` in the feed repo, scrambled like everything else there.
2. `tools/teacher/watch.mjs` on the PC looks there every 15 seconds. Task Scheduler starts it hidden at logon and every five minutes makes sure it is running ("8.5 homework watcher"). Install or reinstall it with `tools/teacher/install-watcher.cmd`; remove it with `install-watcher.cmd -Remove`. Its log is `tools/teacher/watch.log`; while it runs, http://127.0.0.1:47185 says what it is doing.
3. It puts the note, the files and some context (what is published for that day, the day before, the class settings) into `work/requests/<id>/` and runs Claude Code headless (`claude -p`, your own Claude login, no extra cost). Claude may only read, write that folder's `homework.json`, and run `publish.mjs check`.
4. The watcher checks the file (Claude gets one chance to fix a problem), publishes it with `publish.mjs homework`, writes `requests/<id>/status.json` (what the Teacher mode screen shows), and sends the Telegram message through the relay.
5. Telegram is only used to *tell* you; nothing listens to the bot, so no Claude Code session has to be open.

## Your own Telegram bot

Her files and Claude's messages come from the bot whose token is in the relay. To use a new bot just for 8.5: in Telegram open @BotFather, send `/newbot`, copy the token, then double-click `tools/teacher/set-bot.cmd`, paste the token, and press Start in the new bot when it asks. It finds your chat, saves both in Vercel, redeploys the relay and sends a test message.

## How it works (free, no server of yours)

- The homework is a scrambled JSON file per day in the public repo `iamdexterdude/8.5-feed`; the app reads it directly.
- Publishing and her uploads go through one small function on Vercel (`backend/`, free plan, `https://eight-five-publish.vercel.app/api`). It holds the GitHub token and the Telegram bot token; the app never does. It checks your password against `teacher.json` in the feed repo.
- The GitHub token in Vercel is the `gh` login from this PC. If `gh auth logout` is ever run, publishing from the app stops: make a fine-grained token (Contents: read and write on `8.5-feed` only) and `cd backend && vercel env add GITHUB_TOKEN production`, then `vercel --prod`.
- The Telegram bot is set in the relay (`TG_BOT_TOKEN`, `TG_CHAT_ID`); `tools/teacher/set-bot.cmd` changes it.

## Command line (what Claude uses)

```
node tools/teacher/publish.mjs homework file.json     publish one day
node tools/teacher/publish.mjs check file.json        check a day without publishing
node tools/teacher/publish.mjs config file.json       class settings (name, Telegram username, lesson time and link, music)
node tools/teacher/publish.mjs password <new>         set or change the password
node tools/teacher/publish.mjs list | show <date> | remove <date> | requests (what is waiting for the watcher)
node tools/teacher/watch.mjs --once                   handle waiting requests now, in this window
```

A homework file: `{ "date": "2026-10-15", "lesson": { "no": "3", "title": "…", "focus": "…", "time": "19:00" }, "tasks": [ { "title": "Speaking", "summary": "…", "minutes": 120, "steps": [ { "type": "questions", "title": "Part 1 questions", "groups": [ { "name": "Topic", "questions": ["…"] } ] }, { "type": "read", "title": "Sample answer", "paragraphs": ["…"], "highlights": ["…"] }, { "type": "words", "title": "New words", "cards": [ { "front": "…", "back": "…" } ] }, { "type": "photos", "title": "Your written answers", "prompt": "…" }, { "type": "record", "title": "Record your answers", "questions": ["…"], "max": 90 } ] } ] }`
