/** Comments must be written in English.
 *
 *  Identifiers, comments, JSDoc and log strings leave the building — they end up
 *  in stack traces, in JSON, and in the hands of developers who do not read
 *  Vietnamese.
 *
 *  COMMENTS ONLY, on purpose — not because string literals are exempt, but
 *  because a literal cannot be judged from its characters alone: the same
 *  sentence may be a label being migrated, a quoted column value, or evidence
 *  cited in a test. Comments carry no such ambiguity, so they are the part a
 *  machine can decide. The literals are a separate, human-driven pass.
 *
 *  What this rule CANNOT see: an identifier spelled in Vietnamese without
 *  diacritics (`textNhapTuyChon`). No regex separates that from English, so it
 *  stays a human check — see the code-generation rules in the root CLAUDE.md. */

/** Precomposed Vietnamese letters, plus the Vietnamese d-with-stroke (lower and upper case).
 *
 *  Deliberately NOT a broad non-ASCII test: `≥`, `·`, `—` and `→` appear all
 *  over this repo's comments and are fine. Only letters that mark the text as
 *  Vietnamese count. */
const VIETNAMESE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Comments must be written in English (§ code-generation rules)' },
    schema: [],
    messages: {
      vietnamese:
        'Comments must be written in English — found "{{ch}}". Rewrite the sentence in English; stripping the diacritics is not a translation and defeats the point of this rule.',
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
