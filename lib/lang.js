// dsh-persona-kit language: one process-wide choice, "zh" or "en".
//
// Everything the user reads (menus, titles, achievements) and the text the model is given (intensity lines, the
// relationship sentence, suggestion prompts, notices) follows it. A role card's own texts are the author's: they are
// shown as written, whatever the language setting is.
let current = 'zh'

export const setLang = (l) => { current = l === 'en' ? 'en' : 'zh' }
export const getLang = () => current
/** The Chinese or the English text for the current language. */
export const pick = (zh, en) => (current === 'en' ? en : zh)

/** "zh" / "en" from the config value; "auto" (or anything else) follows the machine's locale. */
export function resolveLang(configured, locale) {
  if (configured === 'zh' || configured === 'en') return configured
  let loc = locale
  if (loc === undefined) {
    try { loc = Intl.DateTimeFormat().resolvedOptions().locale } catch { loc = '' }
    loc = loc || (typeof process !== 'undefined' ? process.env.LANG || process.env.LC_ALL || '' : '')
  }
  return /^zh/i.test(String(loc)) ? 'zh' : 'en'
}
