import { useState, type ReactNode } from 'react'
import {
  AiFieldConflict,
  AiFieldMark,
  AiFillButton,
  AiFillField,
  Button,
  Input,
  Toast,
} from '@pv/ui'
import { SpecCard } from './chrome/spec-card'

/** Zone 02 · the AI fill family (M-21…M-25), set beside AIAction (M-09).
 *  Own file because zone-molecules is a catalog already past 800 lines; the
 *  cards return as a fragment so they flow in the zone's three-column grid.
 *  Copy and states follow the approved canvas "Theme kit · Component AI". */

/** `under` sits outside the label: a caption holding a link or a button must
 *  not share the label that focuses the field. */
function KitField(props: { label: string; children: ReactNode; under?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">
        <span className="text-glass-foreground text-[13px] font-semibold leading-[1.4]">
          {props.label}
        </span>
        {props.children}
      </label>
      {props.under}
    </div>
  )
}

function KitState({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-mono text-[10px]">{children}</span>
}

/** The flash fades in 600 ms, so the kit remounts it on demand to show it again. */
function FlashDemo() {
  const [run, setRun] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      <KitState>2 · Vừa điền (sáng nền 600ms)</KitState>
      <KitField label="Tên pháp nhân">
        <AiFillField key={run} state="flash">
          <Input defaultValue="Công ty TNHH DAS Vina" className="h-11 text-[13px]" />
        </AiFillField>
      </KitField>
      <div>
        <Button size="sm" variant="ghost" onClick={() => setRun(run + 1)}>
          Xem lại hiệu ứng
        </Button>
      </div>
    </div>
  )
}

export function AiFillCards() {
  return (
    <>
      <SpecCard
        code="M-21"
        name="AiFillButton"
        note="bấm là điền"
        noteAccent
        bodyClassName="flex flex-col gap-3 p-4"
        footer="secondary · icon Orbit 16 · busy = aria-disabled + aria-busy, giữ màu secondary, con trỏ chờ · disabledReason = một dòng dưới nút · tablet h-12"
      >
        <KitState>Sẵn sàng</KitState>
        <AiFillButton onClick={() => {}} />
        <KitState>Đang điền</KitState>
        <AiFillButton onClick={() => {}} busy />
        <KitState>Chưa đủ dữ liệu</KitState>
        <AiFillButton onClick={() => {}} disabledReason="Cần tên công ty và người liên hệ trước." />
        <p className="text-muted-foreground text-[11.5px] leading-[1.7]">
          Nằm ở hàng tiêu đề của thẻ Thông tin lead, cạnh dòng trạng thái lưu. Bấm là điền thẳng vào
          ô trống, không có bước duyệt; sau đó có Hoàn tác. Không có quyền sửa lead hoặc hết ô trống
          thì không hiện.
        </p>
      </SpecCard>

      <SpecCard
        className="col-span-2"
        code="M-22"
        name="AiFillField"
        note="ô đang điền"
        bodyClassName="grid grid-cols-3 gap-4 px-4 py-5"
        footer={
          <>
            Bọc ngoài một ô bất kỳ, không đụng vào ô. waiting = vệt chờ đè lên ô, ô giữ chiều cao ·
            flash = nền primary/16 + vòng 2px ring, tắt dần 600ms · filled = ô như thường, kèm M-23.
            <br />Ô được điền lần lượt, cách nhau 120ms. Giảm chuyển động thì không có flash.
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <KitState>1 · Chờ kết quả</KitState>
          <KitField label="Tên pháp nhân">
            <AiFillField state="waiting">
              <Input className="h-11 text-[13px]" />
            </AiFillField>
          </KitField>
        </div>
        <FlashDemo />
        <div className="flex flex-col gap-2">
          <KitState>3 · Đã điền</KitState>
          <KitField label="Tên pháp nhân" under={<AiFieldMark source="tra cứu mã số thuế" />}>
            <AiFillField state="filled">
              <Input defaultValue="Công ty TNHH DAS Vina" className="h-11 text-[13px]" />
            </AiFillField>
          </KitField>
        </div>
      </SpecCard>

      <SpecCard
        code="M-23"
        name="AiFieldMark"
        note="ô do AI điền"
        bodyClassName="flex flex-col gap-4 p-4"
        footer="text-accent-foreground 12px · Orbit 12 · nguồn có href thì mở tab mới · unsure = Badge warning"
      >
        <KitField label="Mã số thuế" under={<AiFieldMark source="tra cứu mã số thuế" />}>
          <Input defaultValue="0123456789" className="h-11 font-mono text-[13px]" />
        </KitField>
        <KitField
          label="Địa chỉ nhà máy"
          under={
            <AiFieldMark source="dasvina.example" sourceHref="https://dasvina.example" unsure />
          }
        >
          <Input defaultValue="Lô B2, KCN Quế Võ, Bắc Ninh" className="h-11 text-[13px]" />
        </KitField>
        <p className="text-muted-foreground text-[11.5px] leading-[1.7]">
          Dòng &ldquo;AI điền&rdquo; mất khi người dùng sửa ô đó. Nguồn mở được để kiểm.
        </p>
      </SpecCard>

      <SpecCard
        className="col-span-2"
        code="M-24"
        name="AiFieldConflict"
        note="báo trùng dưới ô"
        bodyClassName="flex flex-col gap-4 px-4 py-5"
        footer="Badge danger · tên công ty bấm được khi có onOpenOwner · nút ghost sm, tablet h-12"
      >
        <KitField
          label="Mã số thuế"
          under={
            <AiFieldConflict
              value="0123456789"
              ownerName="DAS Vina Holdings"
              onOpenOwner={() => {}}
              onAttach={() => {}}
            />
          }
        >
          <Input placeholder="Chưa có" className="h-11 font-mono text-[13px]" />
        </KitField>
        <p className="text-muted-foreground text-[11.5px] leading-[1.7]">
          Mã số thuế AI tìm ra đã thuộc một công ty khác trong sổ thì ô để trống, không điền. Người
          dùng chọn gắn lead vào công ty đó hoặc bỏ qua.
        </p>
      </SpecCard>

      <SpecCard
        code="M-25"
        name="AiFillResult"
        note="dùng lại Toast O-08"
        bodyClassName="flex flex-col gap-3 p-4"
        footer="Toast O-08, không component mới · Hoàn tác: ttlMs 10000 · lỗi = tone danger, không tự tắt"
      >
        <Toast
          item={{
            id: 'kit-ai-1',
            tone: 'success',
            title: 'Đã điền 7 ô, 2 ô chưa chắc.',
            detail: 'Không tìm thấy số người tại chỗ.',
            action: { label: 'Hoàn tác', onClick: () => {} },
            ttlMs: 10_000,
          }}
          onDismiss={() => {}}
          defaultTtlMs={6000}
        />
        <Toast
          item={{
            id: 'kit-ai-2',
            tone: 'info',
            title: 'Không tìm thấy thông tin công khai của công ty này.',
          }}
          onDismiss={() => {}}
          defaultTtlMs={6000}
        />
        <Toast
          item={{
            id: 'kit-ai-3',
            tone: 'danger',
            title: 'Chưa điền được. Thử lại sau ít phút.',
            action: { label: 'Thử lại', onClick: () => {} },
          }}
          onDismiss={() => {}}
          defaultTtlMs={6000}
        />
      </SpecCard>
    </>
  )
}
