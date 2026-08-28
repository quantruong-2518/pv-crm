-- Đồng hồ của cột: đơn vào cột hiện tại từ lúc nào.
--
-- SỬA TAY một chỗ so với bản drizzle-kit sinh: chèn phần nạp lại TRƯỚC khi thêm
-- CHECK. Khai CHECK trước thì nó kiểm những dòng đang có `stage` mà `stage_since`
-- còn trống, và migration chết ngay câu đó.
--
-- Nạp bằng `created_at`, và đây là một PHÉP XẤP XỈ đã biết chứ không phải dữ
-- liệu thật: bảng chưa từng ghi lượt đổi cột nào, nên "đơn vào cột này lúc nào"
-- là câu không ai trả lời được cho dữ liệu cũ. Lấy ngày mở đơn là cận DƯỚI —
-- nó nói đơn đứng ở cột lâu ÍT NHẤT bằng thế, nên tín hiệu "đang mục" có thể
-- báo sớm nhưng không bao giờ bỏ sót. Sai theo hướng an toàn.
--
-- Từ lượt ghi tiếp theo trở đi con số là thật: `opportunity.mapper.ts#stageMove`
-- chỉ chạm cột này khi đơn ĐỔI CỘT.

ALTER TABLE "sales"."opportunity" ADD COLUMN "stage_since" timestamp with time zone;--> statement-breakpoint

UPDATE "sales"."opportunity" SET "stage_since" = "created_at"
  WHERE "stage" IS NOT NULL AND "stage_since" IS NULL;--> statement-breakpoint

ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_stage_clock" CHECK (("stage" IS NULL) = ("stage_since" IS NULL));
