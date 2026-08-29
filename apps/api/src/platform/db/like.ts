/** Ô tìm của người dùng → mẫu cho `ILIKE`, đã thoát ký tự đại diện.
 *
 *  `%` và `_` là KÝ TỰ ĐẠI DIỆN của `LIKE`, không phải chữ. Ghép thẳng
 *  `` `%${q}%` `` thì người gõ `100%` để tìm đơn "Giảm 100%" nhận về mẫu
 *  `%100%%` — đọc ra là "chứa 100", nên "1000 tấn thép" cũng khớp. `_` hỏng
 *  lặng lẽ hơn nữa: nó khớp một ký tự bất kỳ, nên `LD_0042` lôi về cả `LD-0042`
 *  lẫn `LDx0042`. Cả hai lần đều KHÔNG có gì trên màn nói vì sao kết quả thừa
 *  ra, và người dùng chỉ kết luận được rằng ô tìm không chạy.
 *
 *  `\` phải đứng TRƯỚC trong lớp ký tự, và đó là phần dễ viết sai nhất: nó là
 *  ký tự thoát mặc định của `LIKE` ở Postgres, nên thoát nó SAU `%`/`_` sẽ thoát
 *  luôn mấy dấu `\` mà chính hàm này vừa thêm vào. Một `replace` với lớp ký tự
 *  duy nhất không có thứ tự nào để sai — nó quét một lượt, mỗi ký tự đúng một
 *  lần.
 *
 *  Đây KHÔNG phải hàng rào chống SQL injection: Drizzle gửi mẫu này đi bằng
 *  tham số ràng buộc, và tham số ràng buộc thì không có cửa nào để tiêm. Đây là
 *  hàng rào về NGHĨA — chữ người dùng gõ phải được đọc thành chữ.
 *
 *  Ở `platform/` vì hai sổ của nhánh Sales đều có ô tìm và cả hai đều ghép
 *  chuỗi kiểu ấy. Hai bản chép đôi là hai chỗ để lệch nhau — chỗ thứ ba mọc ra
 *  sẽ chép bản nào cũng được, và chỉ một trong hai bản đúng. */
export function contains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
