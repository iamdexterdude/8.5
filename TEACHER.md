# Teacher guide

**Her link: https://iamdexterdude.github.io/8.5/** That is all she needs. Nothing to type, no code, no setup. She opens it, sees her name, and the homework appears on Today as soon as you publish it. (Her name comes from Class settings; the welcome plays once.)

**Your password: `bom04`** (set on 14 Oct). Change it in Teacher mode, Class, Password (4 characters or more). The hash in the feed repo is mixed with a secret kept on Vercel, so it cannot be cracked offline; online guesses are limited to 8 per 15 minutes.

## Each day

Open the app, Settings, the small **Teacher** link at the bottom (or go to `#/admin`), type the password.

**A. Tell Claude** (the easiest). Write the homework in your own words: the date, each task (speaking, writing, reading), the topics and questions, what she must read, watch, write, photograph or record, links. Then:
- **Send to Claude on Telegram**: Telegram opens with the text; choose the chat with **@claudeofmine_bot** and send it (attach the sample-answer PDF to the same chat). Claude builds the homework and publishes it when Claude Code is running on the PC.
- or **Copy for Claude Code** and paste it into the chat on the PC.
- or **Save for Claude**, then in Claude Code say "publish the homework I saved in teacher mode" (Claude runs `node tools/teacher/publish.mjs requests`).

**B. Build it yourself** (Homework tab). Pick the day, fill the lesson title and "What we cover", add tasks from the templates (Speaking Part 1, Writing notes, Reading video, blank), fill each step, **Preview as the student**, **Publish to the student**. "Copy the day before" starts from yesterday's draft; the chips show which days are published; **Unpublish** removes a day.

She sees it the next time she opens Today (she can also pull it with the **Ask for the homework** button, which messages you).

## What she sends you

Her photos (made into one PDF on her phone) and her recordings arrive in your Telegram, in the chat with **@claudeofmine_bot**, named like `2026-10-14_speaking-written-answers.pdf` and `2026-10-14_speaking-recordings_Q1.webm`. If she is offline, they wait on her phone and go when she is back.

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

## How it works (free, no server of yours)

- The homework is a scrambled JSON file per day in the public repo `iamdexterdude/8.5-feed`; the app reads it directly.
- Publishing and her uploads go through one small function on Vercel (`backend/`, free plan, `https://eight-five-publish.vercel.app/api`). It holds the GitHub token and the Telegram bot token; the app never does. It checks your password against `teacher.json` in the feed repo.
- The GitHub token in Vercel is the `gh` login from this PC. If `gh auth logout` is ever run, publishing from the app stops: make a fine-grained token (Contents: read and write on `8.5-feed` only) and `cd backend && vercel env add GITHUB_TOKEN production`, then `vercel --prod`.
- The Telegram bot is the Claude Code bot (`@claudeofmine_bot`); her files land in that chat. To use a bot of your own: `vercel env add TG_BOT_TOKEN production` and `TG_CHAT_ID`, then `vercel --prod`.

## Command line (what Claude uses)

```
node tools/teacher/publish.mjs homework file.json     publish one day
node tools/teacher/publish.mjs config file.json       class settings (name, Telegram username, lesson time and link, music)
node tools/teacher/publish.mjs password <new>         set or change the password
node tools/teacher/publish.mjs list | show <date> | remove <date> | requests
```

A homework file: `{ "date": "2026-10-15", "lesson": { "no": "3", "title": "…", "focus": "…", "time": "19:00" }, "tasks": [ { "title": "Speaking", "summary": "…", "minutes": 120, "steps": [ { "type": "questions", "title": "Part 1 questions", "groups": [ { "name": "Topic", "questions": ["…"] } ] }, { "type": "read", "title": "Sample answer", "paragraphs": ["…"], "highlights": ["…"] }, { "type": "words", "title": "New words", "cards": [ { "front": "…", "back": "…" } ] }, { "type": "photos", "title": "Your written answers", "prompt": "…" }, { "type": "record", "title": "Record your answers", "questions": ["…"], "max": 90 } ] } ] }`
