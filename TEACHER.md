# Teacher guide: setting her homework

Everything here is free. Homework is published as **encrypted** files on a `data` branch of the GitHub repo `iamdexterdude/8.5`. Anyone can see that branch, but only scrambled text is in it. Her app unlocks it with the **class code**.

## One time

1. **Send her the link** (private, once). It contains the class code, so don't post it anywhere public:
   `node tools/teacher/publish.mjs link` prints it. She opens it, and the app remembers the code.
2. **Her work reaches you on Telegram** through a bot of yours (optional but recommended, otherwise her files wait on her phone until sent by hand):
   1. In Telegram, open **@BotFather**, send `/newbot`, choose a name, and copy the **bot token**.
   2. Open your new bot and send it any message.
   3. In the app, open **Settings, Teacher mode** (set a teacher code the first time), go to **Class settings**.
   4. Paste the bot token, tap **Find my chat id**, tap **Send a test message** (you should get it in Telegram).
   5. Also paste a GitHub token there (GitHub, Settings, Developer settings, Fine-grained tokens, repository `iamdexterdude/8.5`, **Contents: Read and write**) so the app can publish.
   6. Tap **Publish class settings**.
3. **Music:** Teacher mode, **Music**: add your tracks (title, artist, a YouTube/Spotify link, an optional line from you), then **Publish class settings** again. She gets the next track in your list each time she finishes a day. Only links are stored, never the songs.

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

`tools/teacher/publish.mjs`: `setup`, `homework <file>`, `config <file>`, `link`, `show <date>`. The class code is in `tools/teacher/.classcode` (never committed).
