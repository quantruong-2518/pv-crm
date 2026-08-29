import { MAIL_MERGE_KEYS } from '@pv/contracts'

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
const SPAM_WORDS = [
  'miễn phí',
  'khuyến mãi',
  'giảm giá',
  'trúng thưởng',
  'cơ hội cuối',
  'nhanh tay',
  'cam kết 100%',
  'lợi nhuận',
]

/** `null` means "there is no letter yet", and it is NOT the same answer as `[]`.
 *
 *  `[]` says the checklist looked and found nothing, and the panel prints an
 *  all-clear line on the strength of it. Printing that over a blank form would
 *  be approving a letter nobody has written — the one sentence this whole file
 *  must never produce. `null` says there is nothing to judge yet, and the block
 *  does not draw at all.
 *
 *  Carried in the return type rather than left to each caller so the rule lives
 *  in one place: two compose boxes call this, and a third will. */
export function mailHints(draft: MailDraft): MailHint[] | null {
  const subject = draft.subject.trim()
  const body = draft.body.trim()
  const hints: MailHint[] = []

  if (subject === '' && body === '') return null

  const slots = unique([...subject.matchAll(SLOT), ...body.matchAll(SLOT)].map((m) => m[0]))
  if (slots.length > 0) {
    hints.push({
      id: 'slots',
      tone: 'warn',
      text: 'Còn chỗ trống của mẫu chưa điền',
      detail: `${slots.join(' · ')} — mẫu chỉ là gợi ý, xoá hoặc thay bằng câu của bạn đều được.`,
    })
  }

  /* Read out ONCE and reused twice below. `matchAll` takes its own copy of the
     regex, so unlike `test()` it leaves `PLACEHOLDER.lastIndex` alone — which
     matters because this module-level regex is global and shared. */
  const merged = `${subject}\n${body}`
  const usedKeys = unique([...merged.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''))

  const unknown = usedKeys.filter((key) => !(MAIL_MERGE_KEYS as readonly string[]).includes(key))
  if (unknown.length > 0) {
    hints.push({
      id: 'unknown-merge',
      tone: 'warn',
      /* The strongest hint in the file: this one is invisible in the letter.
         The others leave something odd on the page; this leaves a gap. */
      text: 'Biến trộn không có thật, sẽ thành khoảng trống',
      detail: `${unknown.map((key) => `{{${key}}}`).join(' · ')} — chỉ ${MAIL_MERGE_KEYS.map((key) => `{{${key}}}`).join(' · ')} là có dữ liệu.`,
    })
  }

  if (draft.missing && draft.missing.length > 0) {
    hints.push({
      id: 'missing-merge',
      tone: 'warn',
      text: 'Lead đang xem trước chưa có dữ liệu cho biến',
      detail: `${draft.missing.map((key) => `{{${key}}}`).join(' · ')} — chỗ đó sẽ trống trong thư gửi người này.`,
    })
  }

  if (subject.length > SUBJECT_CUT) {
    hints.push({
      id: 'subject-long',
      tone: 'tip',
      text: 'Tiêu đề dài hơn chỗ hộp thư hiển thị',
      detail: `${subject.length} ký tự — phần lớn hộp thư cắt quanh ${SUBJECT_CUT}, phần đuôi không ai đọc.`,
    })
  } else if (subject !== '' && subject.length < SUBJECT_THIN) {
    hints.push({
      id: 'subject-thin',
      tone: 'tip',
      text: 'Tiêu đề hơi trống nghĩa',
      detail: 'Nói được một điều cụ thể thì tỉ lệ mở khác hẳn một tiêu đề chung chung.',
    })
  }

  if (
    /\b[A-ZĐÀÁẢÃẠÂẦẤẨẪẬĂẰẮẲẴẶÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]{4,}\b/.test(subject)
  ) {
    hints.push({
      id: 'subject-caps',
      tone: 'tip',
      text: 'Tiêu đề có cụm viết hoa toàn bộ',
      detail: 'Bộ lọc thư rác chấm điểm cụm viết hoa, và người đọc thấy như bị quát.',
    })
  }

  const bangs = (subject + body).split('!').length - 1
  if (bangs > 1) {
    hints.push({
      id: 'exclamations',
      tone: 'tip',
      text: `Có ${bangs} dấu chấm than`,
      detail: 'Thư chào B2B giữ một dấu là nhiều nhất — nhiều hơn nghe như quảng cáo.',
    })
  }

  if (usedKeys.length === 0) {
    hints.push({
      id: 'no-personalisation',
      tone: 'tip',
      text: 'Thư không gọi tên người nhận',
      detail: 'Chèn {{contactName}} hoặc {{account}} để mỗi người thấy tên mình, tên công ty mình.',
    })
  }

  const words = body === '' ? 0 : body.split(/\s+/).length
  if (words > BODY_LONG) {
    hints.push({
      id: 'body-long',
      tone: 'tip',
      text: 'Thư dài',
      detail: `${words} từ — thư chào quá ${BODY_LONG} từ thường chỉ được đọc lướt đoạn đầu.`,
    })
  } else if (words > 0 && words < BODY_SHORT) {
    hints.push({
      id: 'body-short',
      tone: 'tip',
      text: 'Thư ngắn',
      detail: 'Chưa đủ chỗ để nói vì sao người nhận nên dành thời gian trả lời.',
    })
  }

  if (body !== '' && !body.includes('?')) {
    hints.push({
      id: 'no-ask',
      tone: 'tip',
      text: 'Chưa có câu hỏi nào',
      detail: 'Một câu hỏi cụ thể ở cuối thư là thứ tạo ra lượt trả lời, không phải lời chào.',
    })
  }

  if (/https?:\/\//i.test(body)) {
    hints.push({
      id: 'raw-link',
      tone: 'warn',
      /* Repo-specific and not guessable: `Para` in `@pv/mail-templates` puts
         the string in a text node, so a pasted URL is not an `<a>`. Several
         desktop clients — Outlook among them — do not linkify it either. */
      text: 'Link dán trong thân thư có thể không bấm được',
      detail:
        'Thân thư dựng thành chữ thuần. Đưa địa chỉ xuống ô nút bên dưới để chắc chắn bấm được.',
    })
  }

  if (body.length > WALL && !body.includes('\n\n')) {
    hints.push({
      id: 'wall',
      tone: 'tip',
      text: 'Thân thư là một khối chữ đặc',
      detail:
        'Một dòng trống là một đoạn trong thư gửi đi — cách đoạn ra thì thư dễ đọc hơn nhiều.',
    })
  }

  const found = SPAM_WORDS.filter((word) => merged.toLocaleLowerCase('vi').includes(word))
  if (found.length > 0) {
    hints.push({
      id: 'spam-words',
      tone: 'tip',
      text: 'Có từ hay bị hộp thư rác chấm điểm',
      detail: `${found.join(' · ')} — dùng được, chỉ là nên cân nhắc trong thư gửi lần đầu.`,
    })
  }

  return hints
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
