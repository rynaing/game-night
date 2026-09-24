# Game Night

Jackbox-style party games: **Trivia** + **Anagrams**. One screen hosts (TV/laptop), everyone else plays on their phone via QR code or a 4-letter room code.

- **Trivia** — questions from Open Trivia DB (free, no key). Fastest correct answer scores most.
- **Anagrams** — 6 letters, 60 seconds, 3+ letter words validated against the Scrabble (ENABLE) dictionary. Longer words score more.

Stack: static site on GitHub Pages + Supabase (Postgres + Realtime Broadcast). No build step.

## Question packs (2.0)

`PACKS` in `app.js` abstracts the question source. `opentdb` is the v1 pack; a `custom` family pack slots in the same shape:

```
{ category, question, correct_answer, incorrect_answers[] }
```
