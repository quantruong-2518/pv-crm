import { MAIL_MERGE_KEYS, type MailMergeKey } from '@pv/contracts'
import { getLang, message, translate, type Lang, type Message } from '@/app/i18n'

/** WHAT WOULD MAKE THIS LETTER BETTER — a checklist, not a gate.
 *
 *  ==================================================================
 *  NOTHING IN THIS FILE MAY STOP A SEND
 *  ==================================================================
 *  The compose panel used to LOCK the send button while the body still held a
 *  `[…]` slot from the seeded template. The intent was right — that template is
 *  a skeleton with the product facts left visibly blank — but the mechanism was
 *  wrong in a way that showed up the first time somebody wrote their own
 *  letter: a template is a STARTING POINT, and a person who deleted the parts
 *  they did not need was refused a send for a slot that was no longer in their
 *  letter's way. A suggestion the machine enforces stops being a suggestion.
 *
 *  So the hard gate is elsewhere and stays small — no recipients, no subject,
 *  no body, a broken CTA link, a schedule in the past (`mas-mail-modal.tsx`).
 *  Everything a human should merely LOOK at before pressing send lives here and
 *  is advisory. `tone` says which is which, and even `warn` never blocks.
 *
 *  ------------------------------------------------------------------
 *  ONE SHORT LINE EACH, AND THAT SHAPE IS THE POINT
 *  ------------------------------------------------------------------
 *  What was here before was three separate paragraphs of prose, each in its own
 *  coloured box, each long enough that the eye skipped it. Prose reads as
 *  something to agree with; a list reads as something to work through. `text`
 *  is the claim — a few words, scannable in a column of ten — and `detail`
 *  carries the why for whoever stops on that one. A hint that needs a sentence
 *  in `text` is a hint that has not decided what it is saying.
 *
 *  ------------------------------------------------------------------
 *  EVERY RULE HERE COSTS A LETTER SOMEBODY WOULD OTHERWISE SEND WRONG
 *  ------------------------------------------------------------------
 *  None of them is style advice. A `{{contact-name}}` that the merge does not
 *  know becomes the empty string in two hundred letters; a link pasted into the
 *  body is not clickable in the shell that renders it; a subject past the
 *  inbox's cut is written for nobody. Anything that would only be taste was
 *  left out — a checklist that cries about everything is a checklist people
 *  turn off. */

/** What a merge chip or quick-insert button says, one label per value across both spellings. */
const COMPANY_NAME = message('Tên công ty', 'Company name', '회사명')
const CONTACT_NAME = message('Tên khách', 'Customer name', '고객명')
const MERGE_LABEL_COPY: Record<MailMergeKey, Message> = {
  account: COMPANY_NAME,
  company: COMPANY_NAME,
  contactName: CONTACT_NAME,
  contact_name: CONTACT_NAME,
  email: message('Email khách', 'Customer email', '고객 이메일'),
}

export const mergeLabel = (key: MailMergeKey, lang: Lang = getLang()) =>
  translate(MERGE_LABEL_COPY[key], lang)

export type MailHintTone = 'warn' | 'tip'

export type MailHint = {
  /** Stable across re-renders and unique in one list — it is the React key and
   *  it is what a screen would use to let somebody dismiss a single hint. */
  id: string
  tone: MailHintTone
  /** The claim. A few words. */
  text: string
  /** Why it matters, or which values tripped it. One sentence. */
  detail?: string
}

export type MailDraft = {
  subject: string
  body: string
  /** The CTA button's destination, exactly as typed. Optional because a letter
   *  without a button is ordinary, and because the field is half-typed on most
   *  keystrokes — the checks below parse it and stay silent when they cannot. */
  ctaUrl?: string
  /** Merge keys the SERVER reported it had no value for, from the last preview.
   *  Empty until a preview has run — this file never guesses at them, because
   *  whether a key resolves depends on the lead, which only the server has. */
  missing?: readonly string[]
}

/** An unfilled slot left by the seeded template, e.g. `[product line name]`.
 *
 *  Square brackets and not `{{…}}` — the seed migration explains the choice at
 *  length. In short: `{{…}}` is the REAL merge syntax, and a key the merge does
 *  not know is replaced with the empty string, so a blank written that way
 *  disappears without a trace. A bracket survives into the letter and is
 *  legible as unfinished even if every warning in this file is ignored.
 *
 *  Three characters minimum so an ordinary `[1]` or `[x]` in prose is not one. */
const SLOT = /\[[^\]\n]{3,}\]/g

/** `{{key}}`, spelled exactly as `mas-letter.ts` spells it, because the whole
 *  value of this check is catching a key that file would silently blank. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g

/** Most clients stop drawing a subject somewhere around here. Past it a person
 *  is writing for the archive, not for the inbox row. */
const SUBJECT_CUT = 60
const SUBJECT_THIN = 20

/** Word counts for a first-touch letter. Not laws — the hint says so — but the
 *  two ends are real: nobody reads 250 words from a stranger, and 30 words is
 *  not enough to say why they should answer. */
const BODY_LONG = 160
const BODY_SHORT = 45

/** A paragraph this long with no blank line before it is a wall. The shell
 *  renders one `<Text>` per blank-line-separated block, so an unbroken body is
 *  literally one paragraph in the letter, not just visually dense. */
const WALL = 420

/** Words that move a letter toward the spam folder in Vietnamese B2B mail.
 *
 *  Deliberately short, and deliberately not a filter: these are perfectly
 *  ordinary words that are also what bulk marketing overuses, so the hint names
 *  them and decides nothing. A long list would fire on every honest letter and
 *  train people to ignore the whole checklist. */
// i18n-ignore: matcher vocabulary for Vietnamese letters, not display text
const SPAM_WORDS = [
  'miễn phí', // i18n-ignore
  'khuyến mãi', // i18n-ignore
  'giảm giá', // i18n-ignore
  'trúng thưởng', // i18n-ignore
  'cơ hội cuối', // i18n-ignore
  'nhanh tay', // i18n-ignore
  'cam kết 100%', // i18n-ignore
  'lợi nhuận', // i18n-ignore
]

type Ctx = {
  draft: MailDraft
  subject: string
  body: string
  merged: string
  usedKeys: string[]
  hints: MailHint[]
  msg: (vi: string, en: string, ko: string) => string
}

function mergeHints({ draft, subject, body, usedKeys, hints, msg }: Ctx) {
  const slots = unique([...subject.matchAll(SLOT), ...body.matchAll(SLOT)].map((m) => m[0]))
  if (slots.length > 0) {
    hints.push({
      id: 'slots',
      tone: 'warn',
      text: msg(
        'Mẫu còn chỗ trống chưa điền',
        'The template still has blanks to fill',
        '템플릿에 채우지 않은 빈칸이 있습니다',
      ),
      detail: `${slots.join(' · ')}. ${msg('Điền hoặc xoá.', 'Fill in or delete.', '채우거나 지워 주세요.')}`,
    })
  }

  /* A SLOT LEFT IN THE LINK IS NOT THE SAME MISTAKE AS ONE LEFT IN THE PROSE,
     so it is a second hint and not two more entries in the list above.
     An unfilled slot in a sentence embarrasses; an unfilled slot in the button's
     address sends every recipient to a page that does not exist, and "delete it
     if you don't need it" — the advice the hint above gives — is exactly the
     wrong move here. */
  const linkSlots = unique([...(draft.ctaUrl ?? '').matchAll(SLOT)].map((m) => m[0]))
  if (linkSlots.length > 0) {
    hints.push({
      id: 'link-slot',
      tone: 'warn',
      text: msg(
        'Link của nút còn chỗ trống chưa điền',
        'The button link still has blanks to fill',
        '버튼 링크에 채우지 않은 빈칸이 있습니다',
      ),
      detail: `${linkSlots.join(' · ')}. ${msg('Thay bằng địa chỉ thật.', 'Replace with the real address.', '실제 주소로 바꿔 주세요.')}`,
    })
  }

  const unknown = usedKeys.filter((key) => !(MAIL_MERGE_KEYS as readonly string[]).includes(key))
  if (unknown.length > 0) {
    hints.push({
      id: 'unknown-merge',
      tone: 'warn',
      /* The strongest hint in the file: this one is invisible in the letter.
         The others leave something odd on the page; this leaves a gap. */
      text: msg(
        'Biến không hợp lệ, sẽ để trống',
        'Invalid variable, it will be left blank',
        '유효하지 않은 변수입니다. 비워서 발송됩니다',
      ),
      detail: `${unknown.map((key) => `{{${key}}}`).join(' · ')}. ${msg('Chỉ dùng', 'Use only', '사용 가능한 변수:')} ${MAIL_MERGE_KEYS.map((key) => `{{${key}}}`).join(' · ')}.`,
    })
  }

  if (draft.missing && draft.missing.length > 0) {
    hints.push({
      id: 'missing-merge',
      tone: 'warn',
      text: msg(
        'Lead đang xem trước chưa có dữ liệu cho biến',
        'The previewed lead has no data for the variable',
        '미리보기 중인 리드에 변수 데이터가 없습니다',
      ),
      detail: `${draft.missing.map((key) => `{{${key}}}`).join(' · ')} ${msg('sẽ để trống trong thư gửi người này.', 'will be blank in the letter sent to this person.', '은(는) 이 사람에게 보내는 메일에서 비워집니다.')}`,
    })
  }
}

function subjectHints({ subject, body, usedKeys, hints, msg }: Ctx) {
  if (subject.length > SUBJECT_CUT) {
    hints.push({
      id: 'subject-long',
      tone: 'tip',
      text: msg('Tiêu đề quá dài', 'Subject is too long', '제목이 너무 깁니다'),
      detail: msg(
        `${subject.length} ký tự. Hộp thư thường cắt ở khoảng ${SUBJECT_CUT}.`,
        `${subject.length} characters. Inboxes usually cut off around ${SUBJECT_CUT}.`,
        `${subject.length}자입니다. 받은편지함에서는 보통 ${SUBJECT_CUT}자 정도에서 잘립니다.`,
      ),
    })
  } else if (subject !== '' && subject.length < SUBJECT_THIN) {
    hints.push({
      id: 'subject-thin',
      tone: 'tip',
      text: msg('Tiêu đề quá ngắn', 'Subject is too short', '제목이 너무 짧습니다'),
      detail: msg(
        'Tiêu đề nên nói một điều cụ thể.',
        'The subject should say one specific thing.',
        '제목에는 구체적인 한 가지를 담아 주세요.',
      ),
    })
  }

  if (
    /\b[A-ZĐÀÁẢÃẠÂẦẤẨẪẬĂẰẮẲẴẶÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]{4,}\b/.test(subject)
  ) {
    hints.push({
      id: 'subject-caps',
      tone: 'tip',
      text: msg(
        'Tiêu đề có cụm viết hoa toàn bộ',
        'Subject has a fully capitalised phrase',
        '제목에 전체 대문자 구절이 있습니다',
      ),
      detail: msg(
        'Viết hoa cả cụm dễ bị vào hộp thư rác.',
        'A fully capitalised phrase tends to land in spam.',
        '전체를 대문자로 쓰면 스팸함으로 가기 쉽습니다.',
      ),
    })
  }

  const bangs = (subject + body).split('!').length - 1
  if (bangs > 1) {
    hints.push({
      id: 'exclamations',
      tone: 'tip',
      text: msg(
        `Có ${bangs} dấu chấm than`,
        `${bangs} exclamation marks`,
        `느낌표가 ${bangs}개 있습니다`,
      ),
      detail: msg('Chỉ nên dùng một dấu.', 'Use only one.', '하나만 사용하세요.'),
    })
  }

  if (usedKeys.length === 0) {
    hints.push({
      id: 'no-personalisation',
      tone: 'tip',
      text: msg(
        'Thư không gọi tên người nhận',
        'The letter does not address the recipient',
        '받는 사람을 부르는 말이 없습니다',
      ),
      detail: msg(
        'Chèn {{contactName}} hoặc {{account}} để thư có tên người nhận.',
        'Insert {{contactName}} or {{account}} to put the recipient name in the letter.',
        '{{contactName}} 또는 {{account}}를 넣어 받는 사람 이름이 보이게 하세요.',
      ),
    })
  }
}

function bodyHints({ draft, body, merged, hints, msg }: Ctx) {
  const words = body === '' ? 0 : body.split(/\s+/).length
  if (words > BODY_LONG) {
    hints.push({
      id: 'body-long',
      tone: 'tip',
      text: msg('Thư dài', 'Long letter', '긴 메일'),
      detail: msg(
        `${words} từ. Thư quá ${BODY_LONG} từ thường chỉ được đọc lướt.`,
        `${words} words. Letters over ${BODY_LONG} words are usually only skimmed.`,
        `${words}단어입니다. ${BODY_LONG}단어를 넘으면 보통 훑어만 봅니다.`,
      ),
    })
  } else if (words > 0 && words < BODY_SHORT) {
    hints.push({
      id: 'body-short',
      tone: 'tip',
      text: msg('Thư ngắn', 'Short letter', '짧은 메일'),
      detail: msg(
        'Chưa đủ để nói vì sao người nhận nên trả lời.',
        'Not enough to say why the recipient should reply.',
        '받는 사람이 답해야 할 이유를 담기에는 부족합니다.',
      ),
    })
  }

  if (body !== '' && !body.includes('?')) {
    hints.push({
      id: 'no-ask',
      tone: 'tip',
      text: msg('Chưa có câu hỏi nào', 'No question yet', '질문이 아직 없습니다'),
      detail: msg(
        'Nên kết thư bằng một câu hỏi cụ thể.',
        'End the letter with one specific question.',
        '구체적인 질문 하나로 메일을 마무리하세요.',
      ),
    })
  }

  if (/https?:\/\//i.test(body)) {
    hints.push({
      id: 'raw-link',
      tone: 'warn',
      /* Repo-specific and not guessable: `Para` in `@pv/mail-templates` puts
         the string in a text node, so a pasted URL is not an `<a>`. Several
         desktop clients — Outlook among them — do not linkify it either. */
      text: msg(
        'Link dán trong thân thư có thể không bấm được',
        'A link pasted in the body may not be clickable',
        '본문에 붙여 넣은 링크는 클릭되지 않을 수 있습니다',
      ),
      detail: msg(
        'Đặt địa chỉ vào ô nút bên dưới.',
        'Put the address in the button field below.',
        '아래 버튼 칸에 주소를 넣어 주세요.',
      ),
    })
  }

  /* Not a mail-client problem — the letter renders either way. The cost lands
     on the reader: a page opened over http is one a browser marks unsafe. */
  if (parseUrl(draft.ctaUrl)?.protocol === 'http:') {
    hints.push({
      id: 'link-insecure',
      tone: 'warn',
      text: msg(
        'Link của nút dùng http thay vì https',
        'The button link uses http instead of https',
        '버튼 링크가 https가 아닌 http입니다',
      ),
      detail: msg(
        'Trình duyệt sẽ cảnh báo khi khách mở trang.',
        'Browsers will warn the customer who opens the page.',
        '고객이 페이지를 열면 브라우저가 경고합니다.',
      ),
    })
  }

  if (body.length > WALL && !body.includes('\n\n')) {
    hints.push({
      id: 'wall',
      tone: 'tip',
      text: msg(
        'Thân thư là một khối chữ đặc',
        'The body is one solid block of text',
        '본문이 빽빽한 글 덩어리입니다',
      ),
      detail: msg(
        'Cách một dòng trống giữa các đoạn cho dễ đọc.',
        'Leave a blank line between paragraphs to make it easier to read.',
        '읽기 쉽도록 문단 사이에 빈 줄을 넣어 주세요.',
      ),
    })
  }

  const found = SPAM_WORDS.filter((word) => merged.toLocaleLowerCase('vi').includes(word))
  if (found.length > 0) {
    hints.push({
      id: 'spam-words',
      tone: 'tip',
      text: msg(
        'Có từ dễ bị vào hộp thư rác',
        'Contains words that tend to land in spam',
        '스팸함으로 가기 쉬운 단어가 있습니다',
      ),
      detail: `${found.join(' · ')}. ${msg('Nên cân nhắc trong thư gửi lần đầu.', 'Think twice in a first-contact letter.', '첫 메일에서는 신중히 사용하세요.')}`,
    })
  }
}

/** `null` means "there is no letter yet", and it is NOT the same answer as `[]`
 *  ("looked, found nothing"). No caller may turn either into an all-clear —
 *  these rules see spelling, not judgement. Carried in the return type so the
 *  rule lives in one place for every compose box. */
export function mailHints(draft: MailDraft, lang: Lang = getLang()): MailHint[] | null {
  const msg = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  const subject = draft.subject.trim()
  const body = draft.body.trim()
  const hints: MailHint[] = []

  if (subject === '' && body === '') return null

  /* Read out ONCE and reused twice below. `matchAll` takes its own copy of the
     regex, so unlike `test()` it leaves `PLACEHOLDER.lastIndex` alone — which
     matters because this module-level regex is global and shared. */
  const merged = `${subject}\n${body}`
  const usedKeys = unique([...merged.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''))

  const ctx: Ctx = { draft, subject, body, merged, usedKeys, hints, msg }
  mergeHints(ctx)
  subjectHints(ctx)
  bodyHints(ctx)

  return hints
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

/** `undefined` while the field is still being typed, which is most keystrokes.
 *  A hint that fires on `https:/` would be advice about a URL nobody has
 *  finished writing. */
function parseUrl(value: string | undefined): URL | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  try {
    return new URL(raw)
  } catch {
    return undefined
  }
}
