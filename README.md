# Game Night

Party games for the big screen: **Trivia** + **Anagrams**. One screen hosts (TV/laptop), everyone else plays on their phone via QR code or a 4-letter room code.

- **Trivia** — questions from Open Trivia DB (free, no key). Fastest correct answer scores most.
- **Anagrams** — 6 letters, 60 seconds, 3+ letter words validated against the Scrabble (ENABLE) dictionary. Longer words score more.

Stack: static site on GitHub Pages + Supabase (Postgres + Realtime Broadcast). No build step.

## Question packs (2.0)

`PACKS` in `app.js` abstracts the question source. `opentdb` is the v1 pack; a `custom` family pack slots in the same shape:

```
{ category, question, correct_answer, incorrect_answers[] }
```

## Supabase client

`vendor/supabase-js-<version>.umd.js` is a pinned, unmodified copy of the npm package's
`dist/umd/supabase.js` (MIT, see `vendor/supabase-js-LICENSE.txt`), so new supabase-js releases
never reach players untested. To upgrade: `npm pack @supabase/supabase-js@<new>`, copy
`dist/umd/supabase.js` over, update the `<script>` path in `index.html`, and host one game before merging.
