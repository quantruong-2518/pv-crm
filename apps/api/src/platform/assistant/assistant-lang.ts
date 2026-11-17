import type { AssistantLang } from '@pv/contracts'

/** The reply language of a chat, read once from its first message and stored on the
 *  session (no AI call, so it costs nothing and cannot be talked into a switch).
 *
 *  Script first, since it is certain: any Hangul is Korean, any Vietnamese letter is
 *  Vietnamese. Unaccented text is decided by two small closed word lists, and only
 *  when exactly one side is present: a tie or no hit leaves the screen's language. */

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/u
const VIETNAMESE = /[đăâêôơưĩũàáèéìíòóùúýãõẠ-ỹ]/iu

const ENGLISH_WORDS: ReadonlySet<string> = new Set(
  'the what how which who when where why my me i is are do does show list give many much of for this that please can with'.split(
    ' ',
  ),
)
const PLAIN_VIETNAMESE_WORDS: ReadonlySet<string> = new Set(
  'toi cua bao nhieu khong nhung cho xem hom nay nao gi duoc cac mot voi thang quy hop dong khach hang co la'.split(
    ' ',
  ),
)

export function detectLang(question: string, fallback: AssistantLang): AssistantLang {
  const text = question.normalize('NFC')
  if (HANGUL.test(text)) return 'ko'
  if (VIETNAMESE.test(text)) return 'vi'
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  const english = words.some((word) => ENGLISH_WORDS.has(word))
  const vietnamese = words.some((word) => PLAIN_VIETNAMESE_WORDS.has(word))
  if (english === vietnamese) return fallback
  return english ? 'en' : 'vi'
}
