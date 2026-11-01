# Changelog

## Unreleased

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
