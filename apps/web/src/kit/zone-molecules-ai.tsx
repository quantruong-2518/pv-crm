import { useState, type ReactNode } from 'react'
import {
  type AiTaskItem,
  AiChoices,
  AiFieldConflict,
  AiFieldMark,
  AiFillButton,
  AiFillField,
  AiTaskSteps,
  AiTaskTray,
  AssistantFab,
  Button,
  Input,
} from '@pv/ui'
import { SpecCard } from './chrome/spec-card'

/** Zone 02 · the AI family (M-21…M-24, M-27, M-28, O-12), set beside AIAction (M-09).
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

const DEMO_CHOICES = [
  {
    key: 'call',
    label: 'Gọi lại chốt lịch khảo sát',
    hint: 'Làm trước ngày mai. Khách hẹn trả lời trong tuần.',
  },
  { key: 'quote', label: 'Gửi báo giá bản sửa', hint: 'Khách hỏi lại giá phần lắp đặt.' },
  { key: 'visit', label: 'Hẹn gặp tại nhà xưởng' },
]

/** Press a row to see the picked state; the other rows keep their buttons. */
function AiChoicesDemo() {
  const [picked, setPicked] = useState<string>()
  return (
    <AiChoices
      choices={DEMO_CHOICES.map((choice) => ({
        ...choice,
        picked: picked === choice.key,
        onPick: () => setPicked(choice.key),
      }))}
      basis="ghi chú · 3 lượt trao đổi · Biên bản khảo sát.pdf"
      empty="Chưa chọn bước nào."
      pickLabel="Chọn bước này"
      pickedLabel="Đã điền vào ô"
    />
  )
}

export function AiFillCards() {
  return (
    <>
      <SpecCard
        code="M-28"
        name="AiChoices"
        note="nhiều đề xuất, một khối"
        noteAccent
        bodyClassName="p-4"
        footer="một khối glass-ai-panel · mỗi hàng một nút, tablet 48px · một dòng Căn cứ · một dòng chưa chọn, ẩn khi đã chọn một hàng"
      >
        <AiChoicesDemo />
      </SpecCard>

      <SpecCard
        code="M-21"
        name="AiFillButton"
        note="bấm là điền"
        noteAccent
        bodyClassName="flex flex-col gap-3 p-4"
        footer="chỉ còn icon AiMark 20, chữ ở title và aria-label · busy = nền nhạt màu chính + chấm, bấm mở khay · disabledReason = một dòng dưới nút · tablet 48px"
      >
        <KitState>Sẵn sàng</KitState>
        <AiFillButton onClick={() => {}} />
        <KitState>Đang điền</KitState>
        <AiFillButton onClick={() => {}} busy />
        <KitState>Chưa đủ dữ liệu</KitState>
        <AiFillButton onClick={() => {}} disabledReason="Cần tên công ty và người liên hệ trước." />
        <p className="text-muted-foreground text-[11.5px] leading-[1.7]">
          Nằm ở hàng tiêu đề của thẻ Thông tin lead, cạnh dòng trạng thái lưu. Bấm là đẩy việc chạy
          nền, điền thẳng vào ô trống, không có bước duyệt; Hoàn tác nằm ở khay việc. Không có quyền
          sửa lead hoặc hết ô trống thì không hiện.
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
        footer="text-accent-foreground 12px · AiMark 12 · nguồn có href thì mở tab mới · unsure = Badge warning"
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
    </>
  )
}

const DEMO_STEPS = [
  { label: 'Đọc hồ sơ lead', state: 'done', note: '0,2 giây' },
  { label: 'Tìm thông tin trên web', state: 'done', note: '6 giây' },
  { label: 'Tra cứu mã số thuế', state: 'now', note: 'đang chạy' },
  { label: 'Kiểm tra trùng công ty', state: 'wait' },
  { label: 'Điền vào lead', state: 'wait' },
] as const

const TRAY_COPY = {
  title: 'Việc AI',
  running: (n: number) => `${n} đang chạy`,
  failed: (n: number) => `${n} lỗi`,
  done: (n: number) => `${n} xong`,
  clear: 'Xoá việc đã xong',
  collapse: 'Thu gọn khay',
  steps: (n: number) => `Xem ${n} bước`,
  hideSteps: 'Ẩn các bước',
  progress: 'Tiến độ',
}

const TRAY_TASKS: AiTaskItem[] = [
  {
    id: 'a',
    kind: 'Điền thông tin lead',
    title: 'Nhựa Tân Á',
    status: 'running',
    badge: 'Bước 3/5',
    steps: [...DEMO_STEPS],
  },
  {
    id: 'd',
    kind: 'Báo cáo liên hệ',
    title: 'Gọi Sao Đỏ · 10/08',
    status: 'running',
    badge: 'Bước 2/3',
    steps: [
      { label: 'Đọc ghi chú và tệp', state: 'done', note: '2,1 giây' },
      { label: 'Nghe ghi âm', state: 'now', note: 'đang chạy' },
      { label: 'Viết tóm tắt và biên bản', state: 'wait' },
    ],
  },
  {
    id: 'c',
    kind: 'Điền thông tin lead',
    title: 'DAS Vina',
    status: 'failed',
    badge: 'Lỗi',
    summary: 'Chưa điền được. Thử lại sau ít phút.',
    meta: 'Dừng ở bước 2/5',
    actions: [
      { label: 'Thử lại', onClick: () => {}, primary: true },
      { label: 'Mở lead', onClick: () => {} },
    ],
  },
  {
    id: 'b',
    kind: 'Điền thông tin lead',
    title: 'Meiko Electronics Việt Nam',
    status: 'done',
    badge: 'Xong',
    summary: 'Đã điền 6 ô, 2 ô chưa chắc.',
    meta: '5 bước · 38 giây',
    actions: [
      { label: 'Mở lead', onClick: () => {}, primary: true },
      { label: 'Hoàn tác', onClick: () => {} },
    ],
  },
]

/** The collapsed pill on its own row beside the round button, as the shell lays them out. */
function BesideFab({ tasks }: { tasks: AiTaskItem[] }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <AiTaskTray
        inline
        besideAssistant
        open={false}
        onOpenChange={() => {}}
        onClearDone={() => {}}
        copy={TRAY_COPY}
        tasks={tasks}
      />
      <AssistantFab className="static" />
    </div>
  )
}

export function AiTaskCards() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <SpecCard
        code="M-27"
        name="AiTaskSteps"
        note="năm bước của một việc"
        bodyClassName="flex flex-col gap-3 p-4"
        footer="xong = dấu tích + thời gian · đang chạy = chữ đậm, vòng quay · chờ = nhạt · lỗi = đỏ, các bước sau dừng"
      >
        <AiTaskSteps steps={[...DEMO_STEPS]} />
        <AiTaskSteps steps={[{ label: 'Tìm thông tin trên web', state: 'fail', note: 'lỗi' }]} />
      </SpecCard>

      <SpecCard
        className="col-span-2"
        code="O-12"
        name="AiTaskTray"
        note="khay việc AI"
        bodyClassName="grid grid-cols-[minmax(0,1fr)_minmax(0,440px)] items-start gap-4 p-4"
        footer="thu gọn = một viên 48px cạnh nút Trợ lý, cùng hàng (còn việc chạy / chỉ có lỗi / xong hết) · mở ra = khay xếp trên nút · thẻ việc: loại việc, tên, nhãn trạng thái, thanh tiến độ, bước đang chạy và nút xem đủ các bước · việc xong ở lại tới khi xoá hoặc sau 24 giờ"
      >
        <div className="flex flex-col gap-4">
          <KitState>Thu gọn · còn việc đang chạy</KitState>
          <BesideFab tasks={TRAY_TASKS} />
          <KitState>Thu gọn · chỉ có lỗi</KitState>
          <BesideFab tasks={TRAY_TASKS.filter((t) => t.status === 'failed')} />
          <KitState>Thu gọn · tất cả đã xong</KitState>
          <BesideFab tasks={TRAY_TASKS.filter((t) => t.status === 'done')} />
        </div>
        <AiTaskTray
          inline
          open={open}
          onOpenChange={setOpen}
          onClearDone={() => {}}
          copy={TRAY_COPY}
          tasks={TRAY_TASKS}
        />
      </SpecCard>
    </>
  )
}
