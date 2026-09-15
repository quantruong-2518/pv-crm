import noRawHex from './rules/no-raw-hex.js'
import noBoxBorder from './rules/no-box-border.js'
import spacingScale from './rules/spacing-scale.js'
import noAiSlop from './rules/no-ai-slop.js'
import iconThroughGate from './rules/icon-through-gate.js'
import noScenarioMix from './rules/no-scenario-mix.js'
import commentsInEnglish from './rules/comments-in-english.js'
import commentBudget from './rules/comment-budget.js'

/** eslint-plugin-aurora — the 15 hard laws of Aurora v2.0, the machine-checkable part.
 *
 *  Whichever law can be enforced at the STYLE LAYER already lives in @pv/ui
 *  and has no rule here (laws 8 · 9 · 10 · A-11). The rules below only handle
 *  the part TypeScript can't reach: class string content and text content.
 *
 *  The three remaining laws are still a human-eyes job, spelled out so no one
 *  thinks CI has them covered: law 12 (correct 4-layer background) · law 13
 *  (contrast ≥ 4.5:1) · docs/luat-thiet-ke.md §8.8 (4-layer background ·
 *  contrast · tablet button size). */
export default {
  meta: { name: '@pv/eslint-plugin-aurora', version: '1.0.0' },
  rules: {
    'no-raw-hex': noRawHex,
    'no-box-border': noBoxBorder,
    'spacing-scale': spacingScale,
    'no-ai-slop': noAiSlop,
    'icon-through-gate': iconThroughGate,
    'no-scenario-mix': noScenarioMix,
    'comments-in-english': commentsInEnglish,
    'comment-budget': commentBudget,
  },
}
