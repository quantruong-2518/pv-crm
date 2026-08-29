/** Comments must be written in English.
 *
 *  Identifiers, comments, JSDoc and log strings leave the building — they end up
 *  in stack traces, in JSON, and in the hands of developers who do not read
 *  Vietnamese. Display labels and fixture data are the opposite: they are
 *  content, not keys, and stay Vietnamese.
 *
 *  COMMENTS ONLY, on purpose. A string literal cannot be judged from its
 *  characters alone — `'Đang chạy'` is a legitimate UI label and `'Trần Văn
 *  Bình'` is legitimate fixture data. Comments carry no such exception, so they
 *  are the part a machine can decide.
 *
 *  What this rule CANNOT see: an identifier spelled in Vietnamese without
 *  diacritics (`textNhapTuyChon`). No regex separates that from English, so it
 *  stays a human check — see the code-generation rules in the root CLAUDE.md. */

/** Precomposed Vietnamese letters plus đ/Đ.
 *
 *  Deliberately NOT a broad non-ASCII test: `≥`, `·`, `—` and `→` appear all
 *  over this repo's comments and are fine. Only letters that mark the text as
 *  Vietnamese count. */
const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Comment phải viết bằng tiếng Anh (§ Luật khi sinh code)' },
    schema: [],
    messages: {
      vietnamese:
        'Comment phải viết bằng tiếng Anh — thấy "{{ch}}". Nhãn hiển thị và dữ liệu fixture thì giữ tiếng Việt, nhưng comment thì không (CLAUDE.md § Luật khi sinh code).',
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode()

    return {
      // One report per comment block, not per line: the suppressions file counts
      // reports, and a 30-line docblock is one decision, not thirty.
      Program() {
        for (const comment of source.getAllComments()) {
          const hit = comment.value.match(VIETNAMESE)
          if (hit) {
            context.report({ loc: comment.loc, messageId: 'vietnamese', data: { ch: hit[0] } })
          }
        }
      },
    }
  },
}
