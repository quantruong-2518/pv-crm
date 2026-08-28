import { useEffect, useState } from 'react'
import { TriangleAlert, X } from '@pv/ui'
import { Badge, Button, Drawer, Icon, Select, Textarea } from '@pv/ui'
import {
  EXIT_REASONS,
  HEAD_OF_SALES,
  type ExitReason,
  type Lead,
} from '@pv/engines/fixtures/das-vina'

/** Đưa lead ra khỏi luồng — hộp thoại, không phải một thẻ nằm sẵn trên màn.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO CHUYỂN THÀNH HỘP THOẠI
 *  ------------------------------------------------------------------
 *  Bản trước là một thẻ đứng thường trực ở cột phải, mang sẵn sáu cái nút đỏ.
 *  Sai tỷ lệ: đây là hành động HIẾM và KHÔNG QUAY LẠI ĐƯỢC, mà lại chiếm chỗ
 *  ngang với những khối người ta dùng mỗi lần mở màn. Sáu nút "giết lead" bày
 *  sẵn cạnh chỗ đọc hồ sơ cũng là sáu cơ hội bấm nhầm.
 *
 *  Giờ nó là một nút trên thanh công cụ, và hộp thoại mới là chỗ chọn lý do.
 *  Một bước thêm vào đúng chỗ cần một bước thêm.
 *
 *  ------------------------------------------------------------------
 *  SÁU LÝ DO, DANH SÁCH ĐÓNG
 *  ------------------------------------------------------------------
 *  `EXIT_REASONS` không có ô "khác" và sẽ không có: lý do thứ bảy là một hành
 *  động cấu hình ở module Cấu hình, không phải một dòng gõ tay. Ô ghi thêm ở dưới là
 *  để kể chi tiết của ĐÚNG lead này — nó không tạo ra lý do mới, và không bắt
 *  buộc.
 *
 *  Khác hẳn `LOSS_REASONS` của phiếu đổi cơ hội: bảng đó MỞ, vì lý do thua một
 *  đơn đã báo giá là thứ học được từ thị trường. Hai bảng, hai luật, hai chỗ. */
export function ExitDialog({
  lead,
  open,
  onClose,
  onReport,
}: {
  lead: Lead
  open: boolean
  onClose: () => void
  onReport: (reason: ExitReason) => void
}) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  /* Mở lại là một lần bắt đầu mới — không giữ lựa chọn của lần trước, vì lần
     trước người ta đã bấm Huỷ và đó là một câu trả lời. */
  useEffect(() => {
    if (open) {
      setReason('')
      setNote('')
    }
  }, [open])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Lead có vấn đề"
      subtitle={
        <>
          <span className="font-mono">{lead.code}</span> · {lead.company} — đưa ra khỏi luồng là
          đóng lead lại. Sổ vẫn giữ dòng này để tra, nhưng nó thôi chạy.
        </>
      }
      meta={<Badge tone="warning">Không quay lại được</Badge>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-muted-foreground text-[11.5px] leading-[1.5]" aria-live="polite">
            {reason === ''
              ? 'Chọn một trong sáu lý do để bật nút.'
              : `Đề nghị này chờ ${HEAD_OF_SALES} gật. Công trạng của nguồn kéo lead về vẫn giữ.`}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="md"
              variant="destructive"
              disabled={reason === ''}
              onClick={() => {
                if (reason === '') return
                onReport(reason as ExitReason)
                onClose()
                /* Nối E2 khi có backend: mọi lần đưa lead ra khỏi luồng phải ghi vết. */
              }}
            >
              <Icon icon={TriangleAlert} size={16} />
              Đưa ra khỏi luồng
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            Lý do
            <span className="text-warning" aria-hidden="true">
              {' '}
              *
            </span>
          </span>
          <Select
            label="Lý do ra khỏi luồng"
            hideLabel
            value={reason}
            neutralValue=""
            onChange={setReason}
            className="w-full"
            options={[
              { value: '', label: '— chọn một lý do —' },
              ...EXIT_REASONS.map((r) => ({ value: r.label, label: r.label })),
            ]}
          />
          <span className="text-muted-foreground text-[11px] leading-[1.5]">
            Sáu lý do là toàn bộ danh sách, không có ô &quot;khác&quot;. Lý do thứ bảy là việc của
            module Cấu hình.
          </span>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Ghi rõ thêm</span>
          <Textarea
            autoGrow
            rows={3}
            value={note}
            aria-label="Ghi rõ thêm về lý do"
            placeholder="Chi tiết của riêng lead này — ai nói, nói khi nào…"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
    </Drawer>
  )
}
