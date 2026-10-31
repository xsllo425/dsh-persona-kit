# Contributors / 贡献名单

This plugin was built by one human working with several AI models. This file says, as exactly as the records allow,
who did what. Where something is an estimate it says so.

这个插件由一位人类发起人和几个 AI 模型协作完成。本文件尽量按记录如实写明谁做了什么；凡是估算的地方都会标出来。

## Humans / 人类

| Who | What |
|---|---|
| Project owner / 项目发起人 (**xsllo**, [@xsllo425](https://github.com/xsllo425)) | Product direction and every design decision (one plugin that merges persona switching, stickers, intensity, relationship, achievements, avatars, grey suggestions, rebirth and tool gating; the 5-level slider with the role's own picture on the knob; relationship tracks incl. family-only and same-sex-friendly romance; "literary, not literal" suggestion style). Chose which behaviours to keep or drop, tested every build on a real DeepSeek Harness desktop, and reported the bugs below (stale avatars after a role switch, blank band after `/role`, sticker flicker, ...). Picked the community sources for the character jokes. |
| 发起人 | 产品方向和全部设计取舍(把人设切换、表情、说话强度、关系、成就、头像、灰字建议、转生和工具闸门合成一个插件;滑块小人用角色自己的图;关系体系含纯亲情与对同性恋友好的恋人关系;攻略模式要"文学性而非现实逻辑");在真实的 DeepSeek Harness 桌面端逐版测试并提出问题(切换后头像归属、`/role` 后底部空白、表情闪烁等);指定角色梗的社区来源。 |

## AI models / AI 参与者

Evidence = the recorded Claude Code session logs of this workspace (`E:\DSH`), the plugin change log
(`~/.dsh/plugin-changelog*.md`) and the generation scripts. "Edits" counts file Write/Edit calls found in those logs;
a good share of the work was done through shell patch scripts, so edit counts understate the real amount.

| AI | Route | Contribution | Evidence |
|---|---|---|---|
| **Claude Sonnet 5.5** (`claude-sonnet-5-5`) | Claude Code desktop | Wrote the kit itself: every module under `lib/` (core, store, bond, tracks, achievements, avatars, timeline, ghost, roles, http, index host half, client half), the 87 automated tests, the default achievement list, the five example-level texts of every role card, the avatar header / settings panel, account-button restyling, the `/role` switcher, the rebirth flow, and the audit rounds. Also authored, in earlier sessions, the parts that were folded in: `persona-toggle` and the knob look (2026-10-17), `dsh-meme-auto` (2026-10-19), `dsh-handoff` (2026-10-31), and the persona/tool-gate decoupling and idle auto-unload of `dsh-tool-gate` (2026-10-31). Built the sticker pipeline (sheet cutting, caption overlay, pack builder) and wrote the persona texts and captions the owner's characters use. | ~2,490 assistant turns in the kit's own session; 25 recorded Write/Edit calls on `dsh-persona-kit` plus the patch scripts; earlier sessions as listed |
| **Claude Opus 5.5** (`claude-opus-5-5`) | Claude Code desktop | Wrote the first `dsh-tool-gate` (2026-10-20), whose pure decision logic (`lib/gate.js`) and the plugin body (now `lib/toolgate.js`) live on in this kit; wrote `dsh-prompt-gears` (2026-10-19), whose "gear menu" idea inspired the intensity slider (no code carried over). | 3 recorded edits on the gate in two sessions; 20 on `dsh-prompt-gears` |
| **Claude Haiku 5.5** (`claude-haiku-5-5`) | Claude Code sub-agent `web-fetch` | Read web pages while surveying the sticker sources (reading only, no code). | 1 sub-agent run in the kit session |
| **gpt-image-2.5-flare** | Image generation API | Drew the sticker sheets of the preset packs from the owner's reference pictures (the pictures themselves are not part of this repository). | `meme-gen/gen.mjs`, `sheet.mjs` call it; 6 sheets kept |

**Not contributors (checked):** the short probe sessions of 2026-10-22 that ran GPT-6 Luna / Astra / Sol, GLM-5.3,
MiMo, MiniMax, StepFun and other models are model smoke tests; none of them touched any file of this kit
(the only models whose edits appear on kit-related paths are the two Claude models above).

### Rough share of the code / 代码占比(估算)

By who first wrote the lines that are in `lib/` today (3,668 lines, counted 2026-11-01):

| Origin | Lines | Share |
|---|---|---|
| Written new for the kit by Claude Sonnet 5.5 | ~3,070 | ~84 % |
| Ported from `dsh-tool-gate` (first written by Claude Opus 5.5, later reworked by Sonnet 5.5): `gate.js` + `toolgate.js` | 598 | ~16 % |

Of the "new" part, ~150 lines (`handoff.js`) and the sticker-picking logic in `client.js` were adapted by the same
model from its own earlier plugins. These numbers say nothing about effort or value, only about authorship of lines.

## Ideas we learned from (not AI) / 受益于的其他作品

No code was copied from these, except where noted in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md):
`dsh-persona-switcher` (role library, `/role`, the role-change notice), `dsh-next-prompt` (grey next-sentence text),
`dsh-chat-avatars` (avatars and the "poke" idea), `dsh-account-identity` (name and picture for the sidebar account),
`dsh-meme` (sticker packs), and the character community works the personal packs were drawn from (Claude / GPT /
Doubao / Qianwen "AI girls" fan designs). The five preset roles (`presets/roles`: text, card and knob picture) **are shipped** as fan-made takes on those characters; their sticker packs (`presets/meme-packs`: 4×24 stickers and a 100-sticker pack) **are shipped** too, generated by gpt-image-2.5-flare from the owner's reference pictures.
