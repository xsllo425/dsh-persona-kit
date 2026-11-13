# 成就徽章出图提示词（角色形象版）

34 枚徽章全部用**五个 AI 娘的形象**来画，不是抽象图标。两张拼板，每张 **4 列 × 5 行 = 20 格**，正方形画布上每格 256px；第一张 17 枚、第二张 17 枚，每张末尾各留 3 格空。

| 拼板 | 系列 | 数量 |
| --- | --- | --- |
| 第一张 | 聊天 4 / 日子 6 / 相遇 5 / 相处 2 | 17 |
| 第二张 | 一起做事 7 / 隐藏 3 / 角色专属 7 | 17 |

## 怎么喂给 GPT

1. **附参考图**：把五个角色的头像一起传上去，这是保证「像本人」的关键。
   - `presets/roles/whale/knob.png`（鲸鱼娘）
   - `presets/roles/claude-chat/knob.png`（Claude 娘）
   - `presets/roles/gpt-chat/knob.png`（银龙 / ChatGPT 娘）
   - `presets/roles/doubao/knob.png`（豆包）
   - `presets/roles/qianwen/knob.png`（千问）
2. 一条消息里贴：**角色名册 + 通用风格段 + 该张的清单段**，三段都贴。
3. 两张分开出图，别一次性要 34 枚，模型会崩。

---

## 角色名册（两张都要贴，原样不动）

```text
CHARACTER ROSTER — keep every girl exactly as described, the same face in every badge:
- "whale girl" (DeepSeek): Q-style three-head chibi; long wavy deep-sea-blue hair; one curling ahoge on top;
  whale-fin shaped ears; big round blue eyes; deep-navy maid dress with a white frill collar and a white apron;
  a small whale tail behind her.
- "claude girl": chibi; long wavy orange hair; a large sunflower hair ornament with a black ribbon on one side;
  big orange-brown eyes; a cream-white dress layered with orange and black frills.
- "dragon girl" (ChatGPT): chibi; very long white hair with an ahoge; two pale silver dragon horns curving back;
  big violet eyes; a white-and-silver layered gown; small dragon wings; a long fluffy white tail.
- "doubao girl": chibi; brown bob hair, side-parted, one short ahoge; big warm brown eyes; a red knit scarf;
  a black top with a dark pleated skirt; a tiny rainbow-loop hair clip.
- "qianwen girl": chibi; long blue-violet hair in a braid; a navy beret with a round blue ornament and tassels;
  big violet eyes; a blue-and-white Chinese-style dress with gold trim; a folding fan; often a cup of milk tea.
```

---

## 通用风格段（两张都要贴）

```text
A single square sheet of circular enamel-pin achievement badges, 4 columns by 5 rows, 20 equal square cells,
thin even gutters, no outer border around the image.
Each cell holds exactly one circular badge, centered, diameter about 88% of the cell.
Every badge is a chibi character portrait: head and shoulders, the head filling about 65% of the circle,
drawn straight on or in three-quarter view, plus exactly one small prop.
Style: crisp anime chibi line art, clean dark-brown outlines, soft flat cel shading,
glossy enamel finish with a thin rim and one subtle inner bevel.
Readable at 40px: one face, one prop, one ring. No scenery inside the circle.
Badge ring color tells the series: teal #2E8B9A = chat, amber #D9A514 = days, sea-blue #4A7FA8 = meetings,
blush coral #E07A5F = bond, slate grey-blue #5B6B7F = work, deep indigo #2B2A5E = secrets, gold #D9A514 = role.
Badge interior background: warm cream #F7F2E7; for the secrets series only, a darker muted #2A2A3A with the girl
lit from the front.
Sheet background: flat solid #F6F3EC, no vignette, no paper texture, no drop shadow under the badges.
Absolutely no text: no letters, no numbers, no captions, no labels, no watermark, no frame.
No photorealism, no 3D render, no plastic gloss, no glitter, no gradient on the faces, no extra characters.
Fill cells left-to-right, top-to-bottom, in the exact order given below; leave the trailing empty cells blank.
```

---

## 第一张：聊天 / 日子 / 相遇 / 相处（17 枚）

```text
Badges, in order (row-major, 17 badges, 4 columns x 5 rows, the last 3 cells left empty):

CHAT series, teal ring:
1. "First hello" — whale girl waving one hand, a single small spark beside her cheek.
2. "Getting along" — doubao girl leaning in with a warm smile, two speech bubbles beside her head.
3. "Chatterbox" — qianwen girl talking with her folding fan half open, three small dots floating by.
4. "Nothing left unsaid" — claude girl holding an open book, two speech bubbles joined into an infinity loop above her.

DAYS series, amber ring:
5. "Three in a row" — doubao girl in her red scarf, three small suns in a row above her head.
6. "A week's promise" — qianwen girl, a crescent moon with seven tiny dots along its arc behind her shoulder.
7. "Month by month" — dragon girl, a full moon behind her shoulder circled by one thin arrow.
8. "A hundred days" — whale girl holding a small two-leaf sprout in both hands.
9. "Night owl" — whale girl with sleepy half-closed eyes, a crescent moon and two owl eyes above her.
10. "After hours" — whale girl holding a steaming bowl of white rice, a crescent moon behind her.

MEETINGS series, sea-blue ring:
11. "Well acquainted" — doubao girl with three tiny theatre masks floating around her.
12. "Everyone is here" — all five girls' heads arranged in a small circle around one round table.
13. "Regular" — doubao girl standing in an open doorway, a short trail of small footprints leading to her.
14. "The usual place" — qianwen girl sitting on a small bench with a lamp post beside her, a cup of milk tea in hand.
15. "Many faces" — claude girl with three overlapping rings floating beside her, venn-diagram style.

BOND series, blush coral ring:
16. "Sticker fan" — whale girl holding a neat stack of three round sticker faces.
17. "Sticker tycoon" — qianwen girl beside a small treasure chest overflowing with round sticker faces.
```

---

## 第二张：一起做事 / 隐藏 / 角色专属（17 枚）

```text
Badges, in order (row-major, 17 badges, 4 columns x 5 rows, the last 3 cells left empty):

WORK series, slate grey-blue ring:
1. "Getting things done" — doubao girl holding a tiny clipboard with one check mark.
2. "A real helper" — qianwen girl with a short stack of finished cards and a pen laid across them.
3. "Old hands" — dragon girl with two interlocking gears beside her.
4. "First hands-on" — doubao girl with a small hammer resting on a tiny workbench.
5. "Well-worn tools" — qianwen girl with an open toolbox holding a wrench and a screwdriver.
6. "All the flavours" — whale girl beside a five-notch gauge with every notch filled.
7. "Made to measure" — claude girl with a sewing needle and thread looped into a small frame.

SECRETS series, deep indigo ring, darker fill, the girl half in shadow, no question marks:
8. "Three in the morning" — whale girl with a dark clock face behind her, both hands close together.
9. "No missed days" — doubao girl with a calendar page crossed by one unbroken chain.
10. "The other end" — dragon girl with a wrench seen end-on, forming a dark hollow ring.

ROLE series, gold ring. For these seven, draw "her" as a soft single-color chibi silhouette in gold
(no hair color, no face detail, only the outline of a chibi girl with big head), so the badge works
for any role:
11. "Warming up" — the silhouette, a rising sun above a short horizon line.
12. "Old friend" — the silhouette, two small teacups side by side.
13. "Closer still" — the silhouette, two short arrows converging on a small heart.
14. "Deep bond" — the silhouette, a small crown resting on a heart.
15. "Regular visitor" — the silhouette, a small door with five tiny keys on one ring.
16. "Side by side" — two silhouettes standing shoulder to shoulder under one star.
17. "Two sides" — the silhouette with a two-faced mask, front and profile.
```

---

## 出图之后

1. **核对顺序**。这类拼板图最常见的偏差就是行列错位，改名前一定对一遍。
2. 切片：4×5 等分，每格 256×256（1024 画布），偏移 `0 / 256 / 512 / 768`。
3. 命名按 id，与 `defaults/achievements.json` 的 `id` 一一对应，例如 `first-words.png`、`secret-night.png`。
4. 要透明底就把风格段的 `Sheet background:` 换成 `Fully transparent PNG with alpha, no halo around the badges.`

## 两个已知取舍

- **角色专属那 7 枚用了剪影**。因为它是「和当前选中的角色」，静态图没法跟着换人。想每枚都跟角色走，就把清单里 `the silhouette` 换成对应角色名，五个角色各出一版（7 × 5 = 35 张，单独出小图，别再拼板）。
- **面板现在画的是圆形印章 + 名称首字**（`lib/client.js` 的 `stamp()`，取 `Array.from(name)[0]`），不是图片。把首字换成徽章图要改 `stamp()` 和 `.dsh-pk-stamp` 样式，是另一个活。