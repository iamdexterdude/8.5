# Teacher guide: setting her homework

Everything here is free. Homework is published as **encrypted** files in a small public GitHub repo, `iamdexterdude/8.5-feed`. Anyone can open that repo, but only scrambled text is in it. Her app unlocks it with a **class code** that travels inside her join link, so she never types it.

## What she does

Nothing to type. She opens **her link** once, on her phone or computer, and her homework appears on Today from then on. Without the link, Today says "Open the link from your teacher".

Her link: `https://iamdexterdude.github.io/8.5/#/join/<class code>`. Send it to her privately, once. It contains the class code, so don't post it anywhere public. Teacher mode shows it (Class settings, "The student's link"); `node tools/teacher/publish.mjs link` prints it too.

## What you do, one time (about two minutes)

1. **Make the feed key.** GitHub, Settings, Developer settings, Fine-grained tokens, Generate new token.
   - Repository access: **Only select repositories**, choose `iamdexterdude/8.5-feed`.
   - Permissions: **Contents: Read and write** (nothing else).
   - Expiration: pick the longest you are comfortable with. Copy the token (it starts with `github_pat_`).
   This token can touch only the feed files. It cannot change the app, and it cannot see any other repository.
2. **Open her link in your own browser first** (once), so this browser has the class code.
3. Open the app, **Settings, Teacher mode**. The first time it says "Set up teacher mode, once.": choose a **password** (10+ characters) and paste the token. The token is locked with your password and saved as `vault.json` in the feed repo.

From then on, on any device, **teacher mode asks for the password and nothing else.** Tap **Lock** when you are done. The password is never stored or sent anywhere. If it is forgotten there is no recovery: delete `vault.json` from the feed repo and set up again.

Why a password and not a plain "teacher code"? Publishing from a web page needs a write key to GitHub. The password is what guards that key, so it is a real lock, not just a hidden screen. Make it a strong one: `vault.json` is public, so a short password could be guessed offline.

## Her work reaches you on Telegram (optional, recommended)

A bot of yours delivers her photos (as one PDF) and recordings. Without it her files wait on her phone until sent by hand.

1. In Telegram open **@BotFather**, send `/newbot`, choose a name, copy the **bot token**.
2. Open your new bot and send it any message.
3. In the app: **Teacher mode, Class settings**. Paste the bot token, tap **Find my chat id**, tap **Send a test message** (you should get it in Telegram).
4. Tap **Publish class settings**. Her app picks them up the next time it opens.

**Music:** Teacher mode, **Music**: add your tracks (title, artist, a YouTube/Spotify link, an optional line from you), then **Publish class settings** again. She gets the next track in your list each time she finishes a day. Only links are stored, never the songs.

## Each day: two ways

**A. In the app (Teacher mode, Homework tab).** Pick the day, fill the lesson, add tasks from a template (Speaking Part 1, Writing notes, Reading video, or blank), fill each step, **Preview as the student**, then **Publish to the student**. She sees it the next time she opens or reloads Today (allow up to 5 minutes).

**B. Send it to Claude in the chat.** Paste the day's content (questions, sample answer, words, the reading video link, what she must upload) and the date; Claude builds the homework file and runs `node tools/teacher/publish.mjs homework <file>`.

## Step types

| Step | What she does | What reaches you |
| --- | --- | --- |
| `questions` | reads the topics and questions to prepare | nothing |
| `read` | reads a sample answer, with your highlighted phrases | nothing |
| `words` | adds the words as a named deck in Review | nothing |
| `watch` | opens your video link, ticks "I watched it" | nothing |
| `photos` | photographs her handwritten pages; the app makes **one PDF** | the PDF, on Telegram |
| `record` | records one audio answer per question | one audio file per question, on Telegram |
| `check` | confirms she did something | nothing |
| `text` | a note or link | nothing |

Until you publish a day, she sees "No homework yet" and an **Ask for the homework** button that sends you a Telegram message.

## When she finishes everything

The finish screen shows the time she finished (with a quieter line if it is late at night) and one track from your list. Everything she did is also in the progress report she sends you from Progress.

## Files

`tools/teacher/publish.mjs`: `setup`, `homework <file>`, `config <file>`, `link`, `show <date>` (uses your logged-in `gh`). The class code is in `tools/teacher/.classcode` (never committed).
