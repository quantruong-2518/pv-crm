-- Số điện thoại về MỘT cách viết: E.164, '+' rồi mã quốc gia rồi số thuê bao.
--
-- `normalisePhone` ở `packages/contracts/src/primitives.ts` là luật, và từ nay
-- cả bốn cửa ghi (form tạo, form sửa, phiếu tiếp nhận, nạp tệp) đều cho ra
-- dạng ấy. File này lo phần cửa không đi qua: những dòng đã nằm sẵn trong bảng
-- từ trước khi luật có.
--
-- Không dọn thì cột chứa hai quy ước cùng lúc — '0912 300 100' cạnh
-- '+84912300100' — và hai dòng đó là MỘT số với mắt người, hai giá trị với
-- `=`. Tìm theo số không ra, so trùng không bắt được, và mỗi lần ai đó sửa
-- một lead cũ là một dòng lặng lẽ đổi quy ước.
--
-- VÌ SAO CHỈ HAI NHÁNH, KHÔNG PHẢI BẢN SAO CỦA `normalisePhone`
-- Kiểm kê 04/09 trên Neon production: 127 lead, 78 dòng trống, 39 dòng bắt đầu
-- bằng '0' (dạng seed viết ra, có khoảng trắng), 3 dòng '+84…' và 7 dòng
-- '+82…' — số Hàn Quốc thật, đã đúng E.164 sẵn. Không dòng nào mang '84' trần
-- không dấu cộng, không dòng nào mang cả mã lẫn số 0. Hai nhánh dưới đây phủ
-- hết 49 dòng có chữ số; chép nốt phần còn lại của hàm TS sang SQL là dựng một
-- bản thứ hai của một luật chỉ để nó không chạy vào đâu cả.
--
-- '+' đã có thì giữ nguyên nước: chỉ bóc trang trí, không đụng vào mã. Bảy
-- dòng '+82…' phải ra khỏi đây y như lúc vào.
UPDATE "sales"."lead"
SET "phone" = CASE
  WHEN "phone" LIKE '+%' THEN '+' || regexp_replace("phone", '\D', '', 'g')
  ELSE '+84' || ltrim(regexp_replace("phone", '\D', '', 'g'), '0')
END
WHERE "phone" IS NOT NULL
  AND "phone" <> CASE
    WHEN "phone" LIKE '+%' THEN '+' || regexp_replace("phone", '\D', '', 'g')
    ELSE '+84' || ltrim(regexp_replace("phone", '\D', '', 'g'), '0')
  END;
