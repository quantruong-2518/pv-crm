import { useEffect, useMemo, useState } from 'react'
import { Check, UserRoundPlus } from '@pv/ui'
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Checkbox,
  Drawer,
  Icon,
  SearchField,
  Select,
  cn,
} from '@pv/ui'
import type { Lead, LeadContact } from '@pv/engines/fixtures/das-vina'
import { useSession } from '@/app/auth'
import { useLeadDesk } from '@/app/desk'
import { useApproverName, useDirectory } from '@/data/directory'
import { assigneeOptions, nextActions } from '@/data/leads'

/** Giao việc trên một lead — nút + bảng chọn người.
 *
 *  ------------------------------------------------------------------
 *  BỐN QUYẾT ĐỊNH CỦA KHỐI NÀY
 *  ------------------------------------------------------------------
 *  1 · **Không trải sẵn tên người ra màn.** Bản trước bày ba nút tên Sale ngay
 *      trong panel; ba người thì vừa, bảy người thì thành một hàng rào nút mà
 *      lúc nào cũng chiếm chỗ dù chín mươi phần trăm thời gian không ai giao
 *      việc. Giờ là một nút, mở ra mới có danh sách.
 *
 *  2 · **Giao NHIỀU người cho MỘT việc, không phải nhiều người mỗi người một
 *      việc rời.** Một lead đang tắc thường cần đúng một việc mà nhiều tay cùng
 *      làm: một người gọi, một người dựng số, một người đi cùng demo. Vì thế
 *      bảng có một ô "việc cần làm" chung ở dưới, lấy thẳng từ danh sách next
 *      action của chính lead đó — không ai gõ tay một cái tên việc mới.
 *
 *  3 · **Giao việc KHÔNG đổi người giữ lead.** Chủ lead đổi tay là đề nghị
 *      riêng, vì `COMMISSION_SPLIT` chia lại phần chốt theo đó. Câu này nằm
 *      ngay cạnh nút chứ không nằm trong comment — người bấm nút không đọc
 *      source.
 *
 *  4 · **Người gật vẫn là TP Kinh doanh.** Bấm xong màn ghi "đã đề nghị", đúng
 *      như mọi hành động khác của module 2. E3 chưa nối.
 *
 *  Thứ tự người trong danh sách do `assigneeOptions` quyết (tầng data), không
 *  do khối này — cùng một luật gợi ý dùng chung cho mọi màn. */

type MenuProps = {
  lead: Lead
  /** Người liên hệ THẬT trên dây (`realContact(profile)`) — chở vào đây để ô
   *  "Việc" của bảng giao việc đọc đúng gợi ý "Gọi …" của `nextActions`, không
   *  đọc lại tên/số sinh từ mã lead. */
  contact: LeadContact | null
  /** Nút to cho màn chi tiết, nút nhỏ cho hàng bảng. */
  size?: 'sm' | 'md'
  /** Màu của nút mở, để thanh hành động phân vai rõ mà không đổi panel. */
  buttonVariant?: 'default' | 'secondary' | 'ghost'
  className?: string
}

export function AssignMenu({ lead, contact, size = 'md', buttonVariant, className }: MenuProps) {
  const me = useSession((s) => s.actor)
  const assigns = useLeadDesk((s) => s.assigns)
  const assign = useLeadDesk((s) => s.assign)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [task, setTask] = useState('')

  const current = assigns[lead.code]

  /* Việc chọn được = next action của chính lead này, trừ "giao việc" (giao việc
     để giao chính nó thì thành vòng tròn). `contact` là người liên hệ THẬT —
     xem docblock của `nextActions`. */
  const tasks = useMemo(
    () => nextActions(lead, contact).filter((a) => a.key !== 'giao-viec'),
    [lead, contact],
  )

  /* Sổ người từ máy chủ, KHÔNG phải bảy cái tên đóng băng. Rỗng trong lúc tải,
     nên bảng chọn hiện ra trống một nhịp rồi đầy — thà thế còn hơn chặn cả nút
     giao việc sau một spinner cho một danh sách vài chục dòng. */
  const staff = useDirectory()
  const approver = useApproverName()

  const people = useMemo(() => assigneeOptions(lead, staff, me?.id), [lead, staff, me?.id])
  const self = people.find((person) => person.group === 'toi')

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const teammates = people.filter((person) => person.group !== 'toi')
    if (needle === '') return teammates
    return teammates.filter((p) =>
      [p.name, p.role, ...p.domains].some((s) => s.toLowerCase().includes(needle)),
    )
  }, [people, query])

  /* Mở bảng là một lần bắt đầu mới: chép lại đề nghị đang treo (nếu có) để sửa
     tiếp, và mồi ô việc bằng việc gấp nhất. Không chép thì người dùng bấm "sửa"
     rồi thấy danh sách trắng và tưởng đề nghị cũ đã mất. */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setPicked(current?.actorIds ?? [])
    setTask(current?.task ?? tasks[0]?.label ?? '')
  }, [open, current, tasks])

  const toggle = (id: string) =>
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))

  const pickedNames = people
    .filter((person) => picked.includes(person.id))
    .map((person) => person.name)

  const groups = [
    {
      key: 'goi-y' as const,
      priority: 'Ưu tiên cao',
      label: 'Phù hợp trực tiếp với lead',
      note: 'Khớp ngành, vai trò hoặc trạng thái hiện tại của lead.',
      tone: 'running' as const,
    },
    {
      key: 'con-lai' as const,
      priority: 'Ưu tiên thường',
      label: 'Có thể phối hợp',
      note: 'Không có tín hiệu khớp trực tiếp, nhưng vẫn thuộc phòng kinh doanh.',
      tone: 'draft' as const,
    },
  ]

  const submit = () => {
    if (picked.length === 0 || task === '') return
    assign(lead.code, picked, task)
    setOpen(false)
  }

  return (
    <div className={cn(className)}>
      <Button
        size={size}
        variant={buttonVariant ?? (current ? 'ghost' : 'default')}
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <Icon icon={UserRoundPlus} size={16} />
        {current ? `Đã giao · ${current.actorIds.length} người` : 'Giao việc'}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={current ? 'Cập nhật giao việc' : 'Giao việc'}
        subtitle={
          <>
            <span className="font-mono">{lead.code}</span> · {lead.company}
          </>
        }
        meta={
          <Badge tone={picked.length > 0 ? 'running' : 'draft'}>
            {picked.length > 0 ? `${picked.length} người đã chọn` : 'Chưa chọn người'}
          </Badge>
        }
        footer={
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
              Giao việc không thay đổi người phụ trách chính. Đề nghị sẽ chờ {approver} duyệt.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="md" variant="ghost" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button size="md" disabled={picked.length === 0 || task === ''} onClick={submit}>
                <Icon icon={Check} size={16} />
                {current ? 'Cập nhật đề nghị' : 'Gửi đề nghị giao việc'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3 rounded-lg bg-white/5 p-4">
            <div className="flex items-start gap-3">
              <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-semibold">
                1
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] font-semibold">Việc cần giao</span>
                <span className="text-muted-foreground text-[12px] leading-[1.5]">
                  Chọn một việc cụ thể để mọi người cùng thực hiện.
                </span>
              </span>
            </div>

            <Select
              label="Việc cần giao"
              hideLabel
              value={task}
              options={tasks.map((item) => ({ value: item.label, label: item.label }))}
              onChange={setTask}
              neutralValue=""
              className="w-full"
            />
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <span className="bg-secondary text-secondary-foreground flex size-6 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-semibold">
                2
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] font-semibold">Người thực hiện</span>
                <span className="text-muted-foreground text-[12px] leading-[1.5]">
                  Có thể chọn nhiều người cho cùng một việc.
                </span>
              </span>
            </div>

            {self && (
              <div className="bg-primary/12 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={self.name} size="md" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[13.5px] font-semibold">Giao cho tôi</span>
                    <span className="text-muted-foreground text-[12px] leading-[1.5]">
                      {self.name} · {self.role}
                    </span>
                  </span>
                </span>
                <Button
                  size="md"
                  variant={picked.includes(self.id) ? 'secondary' : 'default'}
                  aria-pressed={picked.includes(self.id)}
                  onClick={() => toggle(self.id)}
                  className="shrink-0"
                >
                  <Icon icon={picked.includes(self.id) ? Check : UserRoundPlus} size={16} />
                  {picked.includes(self.id) ? 'Đã chọn tôi' : 'Giao cho tôi'}
                </Button>
              </div>
            )}

            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Tìm theo tên, vai trò hoặc chuyên môn…"
              className="w-full"
            />

            <div className="flex flex-col gap-4 rounded-lg bg-white/5 p-3">
              {groups.map((group) => {
                const rows = shown.filter((person) => person.group === group.key)
                if (rows.length === 0) return null
                return (
                  <div key={group.key} className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1 px-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={group.tone}>{group.priority}</Badge>
                        <span className="text-glass-foreground text-[12.5px] font-semibold">
                          {group.label}
                        </span>
                      </span>
                      <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                        {group.note}
                      </span>
                    </div>
                    {rows.map((person) => (
                      <Checkbox
                        key={person.id}
                        checked={picked.includes(person.id)}
                        onChange={() => toggle(person.id)}
                        label={<span className="text-[13px] font-semibold">{person.name}</span>}
                        hint={
                          <span className="flex flex-col gap-1">
                            <span>{person.role}</span>
                            <span>Lý do ưu tiên: {person.why}</span>
                          </span>
                        }
                        trailing={<Avatar name={person.name} size="md" />}
                      />
                    ))}
                  </div>
                )
              })}

              {shown.length === 0 && (
                <p className="text-muted-foreground m-0 px-3 py-4 text-[12.5px] leading-[1.6]">
                  {query.trim() === ''
                    ? 'Chưa có nhân sự khác trong danh sách giao việc.'
                    : `Không tìm thấy người phù hợp với “${query}”.`}
                </p>
              )}
            </div>
          </section>

          <div className="flex items-center justify-between gap-4 rounded-lg bg-white/5 p-4">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-semibold">Đã chọn</span>
              <span className="text-muted-foreground text-[12px]">
                {picked.length > 0
                  ? `${picked.length} người thực hiện`
                  : 'Chưa chọn người thực hiện'}
              </span>
            </span>
            <AvatarGroup
              names={pickedNames}
              max={6}
              size="md"
              emptyLabel="Chưa có người"
              className="shrink-0"
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}

/** Đề nghị đang treo, dạng đọc — dùng ở màn chi tiết ngay dưới nút. */
export function AssignedPills({ lead }: { lead: Lead }) {
  const assigns = useLeadDesk((s) => s.assigns)
  const clear = useLeadDesk((s) => s.clearAssign)
  const staff = useDirectory()
  const approver = useApproverName()
  const current = assigns[lead.code]
  if (!current) return null

  const names = current.actorIds.flatMap((id) => {
    const person = staff.find((actor) => actor.id === id)
    return person ? [person.name] : []
  })

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AvatarGroup names={names} max={4} />
      <span className="text-[11.5px]">
        Đã đề nghị giao <b className="font-semibold">{current.task}</b> · chờ {approver} gật
      </span>
      <Button size="sm" variant="ghost" onClick={() => clear(lead.code)}>
        Rút lại
      </Button>
    </div>
  )
}
