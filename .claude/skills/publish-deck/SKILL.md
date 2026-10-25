---
name: publish-deck
description: Turn the teacher's word list (after a lesson, in a note or a PDF) into an Anki deck in Muslima's 8.5 app, check it, and publish it. Use whenever Dexter sends vocabulary, phrases or "new words" for Anki.
---

# Publish an Anki deck

Dexter names the words or phrases to learn; you make the deck. It appears in her Anki with every card new.

## How you were started

- **By the watcher**: everything is in `work/requests/<id>/`. Read `request.md` and the files. Write `work/requests/<id>/deck.json` and stop; the watcher checks and publishes it.
- **In a normal chat**: write `work/manual/<deck-id>.json`, then `node tools/teacher/publish.mjs deck work/manual/<deck-id>.json`.

## The format

```json
{ "id": "lesson-03-part2", "name": "Lesson 3: Part 2 phrases", "note": "From tonight's lesson",
  "cards": [ { "front": "to spring up", "back": "to appear suddenly", "example": "New cafes have sprung up everywhere." } ] }
```

- `id`: lower-case letters, digits and dashes; from the lesson number or the topic.
- `name`: short, how it should read in her deck list.
- `front`: the phrase in its base form ("a sense of community", "to put up with"). `back`: a plain meaning, one line. `example`: a natural sentence; use Dexter's when he gave one.
- Use his words and meanings as he wrote them; fix only typos. If he gave only the words, write the meanings and examples yourself and say so.
- 5 to 25 cards is a good deck; more becomes a chore.

## Your final message

One or two plain lines: the deck name and how many cards, and anything you wrote yourself.
