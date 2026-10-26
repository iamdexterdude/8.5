---
name: publish-homework
description: Turn the teacher's homework note (from 8.5 Teacher mode, "Send to Claude", or pasted in chat) into one day's homework for the 8.5 app, check it, and publish it. Use whenever Dexter sends 8.5 homework in words.
---

# Publish a day of 8.5 homework

Dexter (the teacher) writes the homework in his own words. You turn it into the JSON the 8.5 app shows the student, step by step, the way he would set it himself. `example.json` next to this file is a real published day: match its tone, structure and level of detail.

## How you were started

- **By the watcher** (your prompt says so): everything is in `work/requests/<id>/`. Read `request.md` first, then every file in `files/`, then `published.json`, `previous.json` and `class.json` if present. Write `work/requests/<id>/homework.json`, run `node tools/teacher/publish.mjs check work/requests/<id>/homework.json` until it prints `OK`, and stop. The watcher publishes it and sends your final message to Dexter on Telegram.
- **In a normal chat** (he pasted the note): write the file to `work/manual/<date>.json`, run the check, then publish with `node tools/teacher/publish.mjs homework work/manual/<date>.json`, and tell him in two or three lines what went live. To see what is already published for a day: `node tools/teacher/publish.mjs show <date>`.

## The rules that matter most

1. **Never invent links.** A `watch` step needs a real URL from his note or a file. If he mentions a video but gives no link, use a `check` step ("Watch the RM13 day 4, passage 3 walkthrough. Your teacher will send the link.") and say in your final message that the link is missing.
2. **His content wins.** Use his questions, topics, words and instructions as he wrote them (fix only typos). If he names topics and a number of questions but does not list them, write natural, exam-style IELTS questions for those topics. Say so in your final message.
3. **Sample answers come from his file, word for word.** When he attaches a PDF or photo with a sample answer, copy the text faithfully into a `read` step and split it into paragraphs as in the file. Phrases that are bold, underlined or highlighted in the file go into `highlights`, exactly as they appear in the text. If he asks for a sample answer without giving one, write a natural Band 8 to 9 answer and say that you wrote it.
4. **Changes, not rewrites.** If `published.json` exists, he may be correcting that day ("add a reading task", "change the questions"). Keep everything he did not ask to change, including the step ids.
5. **The date** is the day in `request.md`, unless his words clearly name another day.
6. **When something is unclear, choose the simpler reading**, build it, and name the choice in your final message. Nobody can answer questions while the watcher runs.

## House style

- Plain, warm, direct English, written to her as "you". Short sentences. No emojis, no exclamation marks, no filler ("Great job!"). British spelling.
- One task per skill, in this order when present: **Speaking**, **Writing**, **Reading**, **Listening**, **Vocabulary**. Task `id` is the lower-case name (`speaking`, `writing`, …). `title` is the one word. `summary` is a few words ("Two Part 1 topics", "Review what was taught", "One passage").
- `minutes`: an honest estimate of the whole task. For reference: Part 1 questions with handwritten answers and recordings, about 120. Reviewing a lesson, about 20. A reading passage with a video walkthrough, about 40.
- Step titles are short labels ("Part 1 questions", "Sample answer", "New words", "Your written answers", "Record your answers", "Watch the video walkthrough", "Check").
- A step's `intro`, `prompt` or `text` is one or two sentences telling her exactly what to do and how.
- Speaking steps usually go: `questions`, then `read` (sample answer), then `words`, then `photos` (handwritten answers), then `record`.
- Add a `words` step when the sample answer has highlighted phrases or he lists vocabulary: 5 to 12 cards. `front` is the phrase in its base form ("to spring up", "a sense of community"). `back` is a plain meaning, a new line, then `Example: …`, using the sentence from the sample answer when there is one. `deck` names the set, for example "Speaking: Hometown and Weekends".
- `record` lists every question he wants recorded (all the listed questions unless he says otherwise). Set `max` to 90 seconds for Part 1, 150 for Part 2 and 120 for Part 3. A typical prompt: "One answer per question, 20 to 40 seconds each. Do not read from your notes."
- `photos` is for anything she writes by hand (answers, notes, an essay plan). The `prompt` says what to write and what to photograph. All the photos become one PDF that reaches Dexter.
- End a reading or listening task with a `check` step when he wants her to make sure she understood ("Make sure you understand every question and why each answer is right.", button "I understand every question").
- Include `lesson` only when his note says what that day's lesson is: `{ "no": "3", "title": "…", "focus": "…" }`. Continue the numbering from `previous.json`. Leave out `time` and `link`: the app takes them from the class settings.

## The format

```json
{
  "date": "2026-10-26",
  "lesson": { "no": "3", "title": "Part 3 and opinion essays", "focus": "extending answers, giving reasons" },
  "tasks": [
    { "id": "speaking", "title": "Speaking", "summary": "Two Part 1 topics", "minutes": 120, "steps": [ … ] }
  ]
}
```

Every step has `type` and `title`. Ids are optional (the check fills them in). The step types:

| type | what she does | fields |
| --- | --- | --- |
| `questions` | reads the questions | `intro`, `groups: [{ "name": "Hometown", "questions": ["…?"] }]`, optional `url` and `linkText` for a file |
| `read` | reads a text with highlighted phrases | `intro`, `paragraphs: ["…"]`, `highlights: ["…"]` (exact substrings of the paragraphs), optional `url`, `linkText` |
| `words` | adds the cards to her Review deck | `deck`, `cards: [{ "front": "…", "back": "meaning\nExample: …" }]` |
| `watch` | opens a video and ticks it | `url` (required), `minutes`, `text` |
| `photos` | photographs her pages, sent to Dexter as one PDF | `label` (names the file Dexter gets, for example "Speaking written answers"), `prompt` |
| `record` | records one answer per question, sent to Dexter | `label`, `prompt`, `max` (seconds), `questions: ["…"]` |
| `check` | confirms she did something | `text`, `button` |
| `text` | reads a note, optionally opens a link | `text`, optional `url`, `linkText`, `button` |

The check also needs: a date, at least one task, a title and at least one step in every task, questions in `questions` and `record`, paragraphs in `read`, cards in `words`, a URL in `watch`.

## Attached files

- PDFs and photos are in `files/`. Read them all, every page.
- Put their content into steps (questions, sample answer text, words). That is almost always what he wants.
- Only when she must open the file itself (a worksheet, a long article) add its URL from `request.md` to a step's `url`, with a `linkText` such as "Open the worksheet". The watcher then publishes that file. Files you do not link stay private.

## Your final message

The watcher sends it to Dexter on Telegram as you write it, after the day is live. Plain text, 2 to 6 short lines, no headings or bold. Give what she will do in each task, then anything you assumed, wrote yourself, or still need from him. Do not mention the check, the files or publishing. For example:

```
Speaking: 12 Part 1 questions (Hometown, Weekends), the sample answer from your PDF with 9 phrases highlighted, 9 word cards, handwritten answers, 12 recordings.
Writing: review the Task 2 planning lesson, upload notes.
Reading: the RM13 day 4 passage 3 walkthrough, then the understanding check.
I wrote the 12 questions myself, since the note named only the topics.
```

## Dexter's preferences

Add a line here whenever he says how he likes things done, so every future day follows it.

- (none yet)
