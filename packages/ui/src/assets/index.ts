/** Logo bản nền tối — hai file này là bản ĐÃ XỬ LÝ cho nền `--background`,
 *  xuất đúng cỡ hiển thị lớn nhất × DPR 3 (mark 40px → 128 · wordmark 34px → 128).
 *
 *  Bản gốc do khách cấp nằm ở `./brand-original/`, bản đã xử lý độ phân giải
 *  gốc ở `./masters/`: cả hai chỉ để lưu trữ và xuất lại cỡ khác, KHÔNG import.
 *  Bản 1254×1254 từng được import thẳng vào sidebar để vẽ ô 32px — 676 KB cho
 *  một logo, chiếm 85% payload trang Home. Đừng lặp lại. */
import markLight from './mark-light.webp'
import wordmarkLight from './wordmark-light.webp'

export { markLight, wordmarkLight }
