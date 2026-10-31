// Builds examples/meme-packs/example-faces/{manifest.json,index.db} from the faces drawn by make-example-faces.py.
import { DatabaseSync } from 'node:sqlite'
import { writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../examples/meme-packs/example-faces/', import.meta.url))
const FACES = [
  ['happy', 'happy-grin', '大笑一下', '开心 哈哈 太好了 成功 完成 搞定 great awesome'],
  ['happy', 'happy-smile', '开心地笑', '高兴 不错 喜欢 好耶 nice good'],
  ['shy', 'shy-blush', '脸红害羞', '害羞 谢谢 夸 不好意思 thanks shy'],
  ['shy', 'shy-heart', '眼里冒心', '喜欢 爱 贴贴 感谢 love heart'],
  ['sad', 'sad-tear', '掉眼泪', '难过 委屈 失败 出错 抱歉 sad sorry'],
  ['sad', 'sad-down', '垂头丧气', '失落 可惜 遗憾 没成功 oops'],
  ['angry', 'angry-red', '生气', '生气 过分 讨厌 不行 angry'],
  ['angry', 'angry-puff', '鼓着腮帮', '哼 不满 不理你 烦 hmph'],
  ['confused', 'confused-q', '一脸问号', '困惑 为什么 不懂 怎么回事 what why'],
  ['confused', 'confused-sweat', '冒冷汗', '尴尬 无语 不确定 奇怪 hmm'],
  ['daily', 'daily-calm', '平静微笑', '好的 收到 你好 嗨 ok hello'],
  ['daily', 'daily-sleepy', '困了', '困 晚安 休息 累了 sleepy night'],
]
if (existsSync(join(dir, 'index.db'))) rmSync(join(dir, 'index.db'))
const db = new DatabaseSync(join(dir, 'index.db'))
db.exec('CREATE TABLE memes (path TEXT PRIMARY KEY, tag TEXT, file_name TEXT, caption TEXT, keywords TEXT, mtime REAL, captioned_at REAL)')
for (const [tag, name, caption, kw] of FACES) {
  const rel = `memes/${tag}/${name}.png`
  db.prepare('INSERT INTO memes VALUES (?,?,?,?,?,?,?)').run(rel, tag, `${name}.png`, `Example face｜${caption}`, kw, 0, 0)
}
db.close()
writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id: 'example-faces', name: 'Example faces', version: '1.0.0', maintainer: 'dsh-persona-kit', license: 'MIT', description: 'Twelve plain emoji-style faces drawn for this plugin (no third-party art), to try the sticker features.' }, null, 2) + '\n')
console.log('pack built:', FACES.length)
