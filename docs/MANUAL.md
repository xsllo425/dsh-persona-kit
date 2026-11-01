# dsh-persona-kit — 使用手册 / Manual

回到首页 / Back to the [README](../README.md).

> Requires DeepSeek Harness 0.2.1-rc.x and Node ≥ 22.13. Everything runs on your machine. MIT licensed.

## What it does / 功能

| | |
|---|---|
| **Roles** | A role is a folder with `ROLE.md` (who she is). `/role <id>`, `/role list`, `/role none`, `/role default <id>`. Each session remembers its own role across restarts. A short notice is written into the chat on a switch so the model stops imitating the old role. |
| **Intensity slider (1–5)** | One slider per session and role, with the role's own picture as the knob. Plain → Full. Level texts live in the role card. Level 1 never sends stickers, level 5 sends one with every reply. |
| **Stickers** | Each role has its own sticker packs (`~/.dsh/meme-packs/<id>`). Picked by tone, with a cadence set by the level; the model can also call `send_sticker`. Stickers are identified by file, never by description, so packs cannot get mixed up. |
| **Relationship** | Per role, per kind of bond: **friend, partner, family (she is your daughter / younger sister / elder sister / mother), lover**. Each keeps its own history, titles and way of growing. Family bonds are strictly familial; the lover bond is gentle, non-explicit and assumes nobody's gender. The model only ever sees a title, never numbers. |
| **Rebirth** | When the context is nearly full, the role offers to continue in a fresh session; affinity, titles and the role carry over. Replaces `dsh-handoff`. |
| **Achievements** | 40 milestones for chatting and getting things done together, grouped into seven series (chat, days, meetings, bond, working together, role, secrets). Plain data (`defaults/achievements.json`; a definition may name its `series` and be `hidden`) plus per-role achievements in the role card, including phrases she says. The panel is a seal wall with a stats header (badges, days, current streak, best streak, turns), per-series counts and a details line; a **hidden** badge's description, threshold and progress are withheld by the server until it is earned. Counted by the plugin from real events — the model cannot announce an unlock. |
| **Avatars** | A picture and name above (or beside) each reply, with her relationship or affinity under the name; your own picture on your side. Size, position and what is shown are all editable; click an avatar to open the panel. Optionally replaces the name and picture on the sidebar's account button. |
| **Grey suggestions** | An optional grey "what you might say next" in the input box (Tab / → to take it, Esc to drop it, ↑ / ↓ for your sent history). Two modes: *normal* predicts your next message; *affinity* writes a literary line that would bring you closer, in the voice that suits the relationship. Off by default — it costs one short model call per reply. |
| **Tool gate** | Optional: heavy tool groups start hidden and come back for one session when asked for, then go away again when idle. Does nothing until you configure groups. |

## Install / 安装

```
node ~/.dsh/skills/plugin-manager/dsh-plugin.cjs install link:/path/to/dsh-persona-kit
```

(or add `dsh-persona-kit` to your profile with `dsh plugin --profile <profile> add ...`). Restart DeepSeek Harness.

Try it with the example role and stickers:

```
node tools/install-examples.mjs              # example role + sticker pack, never overwrites
node tools/install-examples.mjs --presets    # also the five ready-made roles with their sticker packs (or --presets=whale,doubao)
```

Then enable the role switcher in `~/.dsh/persona-kit/config.json` (see below), restart, and type `/role example-sage`.

> **Replacing other plugins.** The kit includes a role switcher. If `dsh-persona-switcher` is installed, leave
> `roles.enabled` off (two `/role` commands clash). The kit also stands in for `dsh-handoff`, `dsh-tool-gate`,
> `dsh-meme-auto` and `dsh-next-prompt`; remove those if you use the matching feature here. `dsh-meme`'s sticker
> *picker* is still needed if you want to send stickers yourself.

## Configuration / 配置

`~/.dsh/persona-kit/config.json` (all keys optional; the file is read at start-up):

```jsonc
{
  "roles":  { "enabled": true, "defaultRole": "example-sage" },   // own /role switcher (default: off)
  "ghost":  { "defaultMode": "off",   // "off" | "normal" | "affinity" – the first mode until you pick one in the menu
              "provider": "", "model": "",   // pin a cheap model for suggestions; empty = the session's own model
              "timeoutMs": 20000 },
  "language": "zh",                    // "zh" (default) | "en" | "auto" (follow the machine's locale)  (menus, titles, achievements and the text sent to the model)
  "countSessions": "^session-",        // which session ids are chats with you (workers and automations never raise affinity)
  "triggerTokens": 400000,             // context size at which a rebirth is first offered
  "secondTriggerTokens": 500000,       // a firmer second notice if the first one was ignored (never below triggerTokens)
  "rolesDir": "", "packsDir": "", "roleSessionsFile": ""   // override the default locations
}
```

Everything you set from the UI is saved next to it: `settings.json` (avatars, name, size), `state.json` (levels,
affinity, achievements — pruned of sessions older than 90 days), `avatars/` and `user-avatar.*` (your pictures),
`tool-gate.json` (optional gate groups).

### Role card — `~/.dsh/roles/<id>/card.json`

```jsonc
{
  "accent": "#4f8a6e", "image": "knob.png", "order": 1,
  "packs": ["example-faces"],                       // sticker packs this role uses (and only these)
  "titles": ["…", "…", "…", "…", "…"],              // optional: five friend-stage titles
  "levels": [ { "name": "Plain", "line": "…" }, … ],// five of them; missing ones fall back to the defaults
  "achievements": [ { "id": "…", "name": "…", "metric": "phrase", "gte": 3, "pattern": "regex", "series": "role" } ]
}
```

A role without `card.json` still works as a plain persona; it just has no picture, packs or own achievements.

### Sticker packs

A folder with `manifest.json`, `index.db` (a `memes` table: `path, tag, file_name, caption, keywords, ...`) and the images.
Tags the picker understands: `happy, sad, angry, shy, confused, daily`. See `tools/build-example-pack.mjs`.

## Privacy and cost / 隐私与花费

* Nothing leaves your machine except the model calls DeepSeek Harness already makes.
* Grey suggestions send the **last six messages** (secrets such as `sk-…`, bearer tokens and `api_key=` are masked first)
  to the session's model, once per finished reply, only while a mode is on. Pin a cheap model with `ghost.provider`/`model`.
* All HTTP routes answer only to `localhost`: a request through a proxy, with another `Host`, or from another website is refused.
* Pictures you upload are checked by their first bytes (png/jpeg/webp/gif, ≤ 2 MB) and never executed or served from anywhere else.

## Known limits / 已知限制

* Chinese by default; English with `"language": "en"`. A role card's own texts are shown as written; `/role` command replies are English.
* Two open pages (desktop plus web) would each ask for a sticker and double-count one reply.
* A user message that is a sticker from `dsh-meme` can flicker for a moment while that plugin turns its text into a picture.

## Development

```
npm test        # the automated tests (run them with `npm test`), no host needed
```

Layout: `lib/index.js` (host half: routes, tools, events), `lib/client.js` (browser half: no build step),
`lib/{core,store,bond,tracks,achievements,avatars,timeline,ghost,roles,handoff,toolgate,gate,http}.js`.

## Credits / 致谢

See [CONTRIBUTORS.md](../CONTRIBUTORS.md) (people **and the AI models** that wrote it) and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
