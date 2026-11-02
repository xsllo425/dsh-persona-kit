# Changelog

## Unreleased

- The grey suggestion no longer fails "now and then". Three causes stacked up: the server cached an **empty** answer under the same key as a real one, so the client's own retry was answered from the cache in a millisecond and could never produce a line; the *normal* prompt told the model to output nothing when the next step was unclear, which is most of the time; and the client asked only on the single frame where "running" flipped to false, so a remount or a box that had been typed into never asked again. Now only a real line is cached, the prompt always asks for something to press Tab on, and an empty, idle box asks again once per finished turn (throttled to 9 s, so an empty answer cannot become a poll). `tests/ghost-cache.test.mjs` pins the cache rule.
- Saving state no longer loses an update when Windows briefly holds the file open. Replacing `state.json` and the role-session file used a bare `writeFileSync` + `renameSync`, which fails with `EPERM` when another handle has the target open; the debounced flush then swallowed the error and left the change queued until the next user action. Both now go through `lib/atomic-write.js`, which retries the transient Windows codes and falls back to an in-place write instead of dropping the data. A failed flush also reschedules itself on a backoff (1s doubling to 30s) instead of waiting for the next `touch()`.
- Rebirth now reminds **twice** instead of once: the first notice at `triggerTokens` (default raised 300k → **400k**), a firmer second one at the new `secondTriggerTokens` (default **500k**) if the first was ignored, then nothing more. `asked.json` now records a notice count per session (`{sid: n}`); files written by older versions (a plain id list) still read as one notice already sent.
- A session whose token meter could not be reached used to skip silently — indistinguishable from "below the threshold". It now logs one warning naming the reason, so a dead meter cannot hide the reminder forever.
- The reminder measures what is actually in the context. It used to read whatever number came first, which for a long session was the *lifetime* total (every step re-sends the whole context — a 16 % session showed 189 million tokens and fired the final notice at once). It now reads the context-pressure projection, rejects anything larger than the window, and takes percentages when configured: `triggerPercent` / `secondPercent` (1-99) win over `triggerTokens` / `secondTriggerTokens` whenever the window is known.

- Achievements grew into a catalog: **40 badges in 7 series** (chat, days, meetings, bond, working together, role, secrets). The panel is now a seal wall with a stats header (badges, days, current streak, best streak, turns), per-series counts, filters for earned / still waiting, and a details line under the filters. Four **secret** badges keep their condition — description, threshold and progress — on the server until they are earned; the panel only learns the name before that.
- Switching sessions no longer makes the composer pill fall back to the plain 「人设」 label: a new `GET /sessions` answer says which role every session is on, so the pill draws that role straight away while `/session` for the new session is still in flight.
- Chinese is now the default language (`"language": "zh"`; `"auto"` still follows the machine).
- Five ready-made roles in `presets/roles` (`node tools/install-examples.mjs --presets`), with each role's own sticker pack in `presets/meme-packs`.
- README rewritten as a landing page; the full reference moved to `docs/MANUAL.md`.
- Folds in `dsh-meme`: the sticker picker, multi-pack library, ZIP import/export, the ops panel and click-to-zoom. `send_meme`, the market, AI learning and IM delivery are intentionally left out.

## 0.1.0 — first release

A single plugin for DeepSeek Harness that brings together:

- **Roles**: library of `ROLE.md` folders, `/role`, a role remembered per session, a short notice written into the chat on a switch.
- **Intensity slider (1–5)** with the role's own picture on the knob; level texts live in the role card.
- **Stickers** bound to the role's own packs, picked by tone with a cadence set by the level; `send_sticker` for the model; stickers are identified by file, never by description.
- **Relationship tracks** — friend, partner, family (daughter / younger sister / elder sister / mother, purely familial) and lover (gentle, non-explicit, no assumptions about anyone's gender) — each with its own history, titles and way of growing.
- **Rebirth**: continue in a fresh session when the context fills up; affinity, titles and the role carry over.
- **Achievements**: plain-data definitions plus per-role ones in the role card, including phrases a role says.
- **Avatars**: a picture and name above or beside each reply, relationship or affinity under the name; optionally replaces the name and picture on the sidebar account button.
- **Grey suggestions** (off by default): *normal* predicts your next message, *affinity* writes a literary line that brings you closer in the voice that suits the relationship; Tab / → to take it, ↑ / ↓ for your sent history.
- **Tool gate** (optional): heavy tool groups start hidden and come back per session on request.
- **Chinese and English**: menus, titles, achievements and the text sent to the model (`language`: `auto` | `zh` | `en`).
- Example role and an original 12-face sticker pack; `tools/install-examples.mjs` copies them into your DSH home.

Folds in and replaces the author's earlier local plugins `dsh-handoff`, `dsh-tool-gate`, `dsh-meme-auto` and the persona button of `dsh-local-tweaks`.
