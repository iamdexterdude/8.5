---
name: publish-mock
description: Turn the teacher's mock exam materials (PDFs of the Listening, Reading, Writing and Speaking papers, the answer keys, the listening audio) into one mock for Muslima's 8.5 app, check it, and publish it. Use whenever Dexter sends a full mock, a practice test, or "Mock N" materials.
---

# Publish a mock exam

Dexter attaches the papers of a full IELTS practice test (Academic) and the audio. You turn them into `mock.json`, the structured test the app shows in the same screens as the computer-delivered IELTS, with the answer keys so Listening and Reading are marked at once. Writing and Speaking are recorded and sent to Dexter.

## How you were started

- **By the watcher** (your prompt says so): everything is in `work/requests/<id>/`. Read `request.md`, then every file in `files/` (every page of every PDF; the answer keys matter most). Write `work/requests/<id>/mock/mock.json`, copy or move the audio file(s) into `work/requests/<id>/mock/`, run `node tools/teacher/publish.mjs checkmock work/requests/<id>/mock` until it prints `OK`, and stop. The watcher publishes it (audio included) and tells Dexter on Telegram.
- **In a normal chat**: write the folder under `work/manual/<mock-id>/`, run the check, then `node tools/teacher/publish.mjs mock work/manual/<mock-id>`.

## The rules that matter most

1. **Copy, do not invent.** Questions, options, passages and keys come from the files, word for word. If a part is missing (no reading paper, no key for Listening), leave that section out of the mock and say so in your final message. Never write questions of your own for a mock.
2. **Question numbers are the ones on the paper** (1 to 40 for Listening, 1 to 40 for Reading). Every number must have an answer key entry.
3. **Keys accept what the official key accepts.** Put every accepted form in the list: `["7.30", "7:30", "half past seven"]`. Optional words in brackets become two forms: `(the) library` → `["library", "the library"]`. Letters for multiple choice: `["B"]`. TRUE/FALSE/NOT GIVEN and YES/NO/NOT GIVEN in capitals.
4. **The id** is `mock-NN`, continuing from the mocks already published (see `request.md`). The title is what Dexter calls it ("Mock 3", "Cambridge 18 Test 2").
5. **Audio**: the listening recording file Dexter attached (mp3/m4a). If he attached one file per part, list them in order; if one file for the whole test, one entry. If no audio arrived, leave `listening` out and say so.
6. **When something is unclear, choose the simpler reading**, build it, and name the choice in your final message. Nobody can answer questions while the watcher runs.

## The format

```json
{
  "id": "mock-01", "title": "Mock 1", "date": "2026-10-27",
  "listening": {
    "audio": ["listening.mp3"],
    "parts": [ { "no": 1, "intro": "Questions 1–10", "groups": [ GROUP, … ] }, … ],
    "answers": { "1": ["Harrison"], "2": ["7.30", "7:30"], "11": ["B"], "15": ["A"], "16": ["C"] }
  },
  "reading": {
    "passages": [ { "no": 1, "title": "The history of glass", "subtitle": "optional", "text": "paragraph\n\nparagraph…", "groups": [ GROUP, … ] }, … ],
    "answers": { "1": ["TRUE"], "14": ["iv"], "27": ["C"] }
  },
  "writing": { "tasks": [ { "no": 1, "minutes": 20, "words": 150, "prompt": "The chart below shows…", "image": "files/2026-10-27/task1.png" }, { "no": 2, "minutes": 40, "words": 250, "prompt": "Some people think…" } ] },
  "speaking": {
    "part1": [ { "topic": "Work", "questions": ["What do you do?", "…"] } ],
    "part2": { "card": "Describe a book you enjoyed.", "points": ["what it was about", "when you read it", "why you chose it"], "and": "explain why you enjoyed it", "prep": 60, "talk": 120 },
    "part3": [ { "topic": "Reading", "questions": ["…"] } ]
  }
}
```

Reading passage `text`: paragraphs separated by a blank line. When paragraphs are lettered (A, B, C… for matching information or headings), start each paragraph with its letter and a space.

### Question groups

Each group has `type`, `instructions` (the paper's instruction line, for example "Write ONE WORD AND/OR A NUMBER for each answer.") and, for completion tasks, a `title`.

| type | used for | fields |
| --- | --- | --- |
| `gap` | form, note, sentence, summary and flow-chart completion | `lines`: one string per line, blanks written as `[[7]]`; a blank line is `""` |
| `table` | table completion | same as `gap`; each line is one row, cells separated by `  ·  ` |
| `mcq` | multiple choice, one answer | `items: [{ "n": 11, "text": "…", "options": ["A …", "B …", "C …"] }]` |
| `multi` | choose TWO (or THREE) letters | `n: [15, 16]`, `text`, `options: ["A …", …]`; the key for 15 and 16 is the pair, in any order |
| `match` | matching features, information, sentence endings, map labels described in words | `options: ["A …", "B …"]`, `items: [{ "n": 21, "text": "…" }]` |
| `headings` | matching headings | `options: ["i …", "ii …"]`, `items: [{ "n": 1, "text": "Paragraph A" }]` |
| `tfng` / `ynng` | TRUE/FALSE/NOT GIVEN, YES/NO/NOT GIVEN | `items: [{ "n": 5, "text": "…" }]` |
| `short` | short-answer questions | `items: [{ "n": 36, "text": "…" }]` |

Maps and diagrams that need the picture: describe the labelled places in words as `match` options; if that is impossible, put the question numbers in the key and add `"note": "The map is in the PDF your teacher sent."` to the group, so she can look at the file.

## Writing images

If Task 1 has a chart or diagram and Dexter attached it as an image (or a PDF page you can crop), the watcher publishes files you reference: use `files/<date>/<name>` as in `request.md`. If there is no usable image, describe the figure in the prompt text and say so.

## Your final message

Plain text, 2 to 6 short lines, to Dexter on Telegram. Which parts the mock has, how many questions each, what you left out or assumed.
