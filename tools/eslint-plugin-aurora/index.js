import noRawHex from './rules/no-raw-hex.js'
import noBoxBorder from './rules/no-box-border.js'
import spacingScale from './rules/spacing-scale.js'
import noAiSlop from './rules/no-ai-slop.js'
import iconThroughGate from './rules/icon-through-gate.js'
import noScenarioMix from './rules/no-scenario-mix.js'
import commentsInEnglish from './rules/comments-in-english.js'

/** eslint-plugin-aurora — 15 luật cứng của Aurora v2.0, phần máy kiểm được.
 *
 *  Luật nào cưỡng chế được ở TẦNG KIỂU thì đã nằm trong @pv/ui và không có rule
 *  ở đây (luật 8 · 9 · 10 · A-11). Rule dưới đây chỉ lo phần TypeScript không
 *  với tới: nội dung chuỗi class và nội dung chữ.
 *
 *  Ba luật còn lại vẫn là việc của mắt người, ghi rõ để không ai tưởng CI đã
 *  gác hộ: luật 12 (nền đúng 4 lớp) · luật 13 (tương phản ≥ 4.5:1) ·
 *  docs/luat-thiet-ke.md §8.8 (nền 4 lớp · tương phản · cỡ nút tablet). */
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
  },
}
