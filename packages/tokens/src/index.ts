/** @pv/tokens — tầng token của Aurora v2.0.
 *
 *  `globals.css` là FILE MÀU DUY NHẤT của cả monorepo. Không viết hex ở bất kỳ
 *  file .ts/.tsx nào khác — rule `aurora/no-raw-hex` chặn ở tầng lint.
 *
 *  File dưới đây là *bảng token dạng dữ liệu*, để trang kit vẽ lại bảng màu.
 *  Nó là nơi duy nhất được phép chứa chuỗi hex, vì hex ở đây là NỘI DUNG hiển
 *  thị, không phải giá trị style. */
export * from './tokens'
