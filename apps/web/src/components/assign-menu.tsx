import { useEffect, useMemo, useState } from 'react'
import { Check, Search, UserRoundPlus, X } from 'lucide-react'
import { Avatar, AvatarGroup, Badge, Button, Checkbox, GlassCard, Icon, Select, cn } from '@pv/ui'
import { dasVina, HEAD_OF_SALES, type Lead } from '@pv/engines/fixtures/das-vina'
import { useSession } from '@/app/session'
import { useLeadDesk } from '@/app/desk'
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
  /** Nút to cho màn chi tiết, nút nhỏ cho hàng bảng. */
  size?: 'sm' | 'md'
  className?: string
}

export function AssignMenu({ lead, size = 'md', className }: MenuProps) {
  const me = useSession((s) => s.actor)
  const assigns = useLeadDesk((s) => s.assigns)
  const assign = useLeadDesk((s) => s.assign)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [task, setTask] = useState('')

  const current = assigns[lead.code]

  /* Việc chọn được = next action của chính lead này, trừ "giao việc" (giao việc
     để giao chính nó thì thành vòng tròn). */
  const tasks = useMemo(() => nextActions(lead).filter((a) => a.key !== 'giao-viec'), [lead])

  const people = useMemo(() => assigneeOptions(lead, dasVina.actors, me?.id), [lead, me?.id])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return people
    return people.filter((p) =>
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const toggle = (id: string) =>
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id

  const groups = [
    { key: 'toi' as const, label: 'Giao cho tôi' },
    { key: 'goi-y' as const, label: `Nên giao · hợp với lead này` },
    { key: 'con-lai' as const, label: 'Còn lại trong phòng' },
  ]

  return (
    <div className={cn('relative', className)}>
      <Button
        size={size}
        variant={current ? 'ghost' : 'default'}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon icon={UserRoundPlus} size={16} />
        {current ? `Đã giao · ${current.actorIds.length} người` : 'Giao việc'}
      </Button>

      {open && (
        <>
          {/* Nền bắt click ra ngoài. Nút thật chứ không phải div: bàn phím cũng
              phải đóng được bảng, không chỉ chuột. */}
          <button
            type="button"
            aria-label="Đóng bảng giao việc"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />

          <GlassCard
            variant="b"
            /* `backdrop-blur` là ngoại lệ có lý do của glass-b: mặt kính b bỏ
               blur vì nó nằm trên nền tĩnh, còn bảng này NỔI TRÊN nội dung —
               16% lọt qua của --popover đủ để chữ bên dưới đội lên danh sách
               người. */
            className="absolute right-0 top-[calc(100%+8px)] z-30 flex max-h-[70vh] w-[360px] max-w-[calc(100vw-32px)] flex-col gap-3 p-4 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold">Giao việc</h3>
                <p className="text-muted-foreground truncate text-[11px]">
                  <span className="font-mono">{lead.code}</span> · {lead.company}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                <Icon icon={X} size={16} />
                Đóng
              </Button>
            </div>

            <label className="bg-input flex h-10 items-center gap-2 rounded-md px-3">
              <Icon icon={Search} size={16} className="text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên, vai hoặc ngành…"
                className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
              />
            </label>

            <div className="-mx-1 flex flex-1 flex-col gap-3 overflow-y-auto px-1">
              {groups.map((g) => {
                const rows = shown.filter((p) => p.group === g.key)
                if (rows.length === 0) return null
                return (
                  <div key={g.key} className="flex flex-col gap-1">
                    <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[.13em]">
                      {g.label}
                    </span>
                    {rows.map((p) => (
                      <Checkbox
                        key={p.id}
                        checked={picked.includes(p.id)}
                        onChange={() => toggle(p.id)}
                        label={
                          <span className="flex items-center gap-2">
                            {p.name}
                            {p.group === 'toi' && <Badge tone="running">bạn</Badge>}
                          </span>
                        }
                        hint={`${p.role} · ${p.why}`}
                        trailing={<Avatar name={p.name} size="sm" />}
                      />
                    ))}
                  </div>
                )
              })}

              {shown.length === 0 && (
                <p className="text-muted-foreground px-3 py-4 text-[11.5px] leading-[1.5]">
                  Không ai trong phòng khớp &quot;{query}&quot;.
                </p>
              )}
            </div>

            {/* Vai phòng đang có là năm vai đã chốt ở docs. Nói thẳng ra chỗ
                thiếu thay vì bày một nhóm rỗng tên AM cho đủ hình. */}
            <p className="text-muted-foreground text-[11px] leading-[1.5]">
              Phòng có năm vai đã chốt: TP Kinh doanh · Marketing · BD · Sale · Presales. Chưa có
              vai AM — thêm vai là việc của module 5 · Cấu hình.
            </p>

            <Select
              label="Việc"
              value={task}
              options={tasks.map((t) => ({ value: t.label, label: t.label }))}
              onChange={setTask}
              neutralValue=""
              className="w-full"
            />

            {picked.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {picked.map((id) => (
                  <span
                    key={id}
                    className="bg-primary/24 text-accent-foreground flex items-center gap-2 rounded-sm py-1 pl-1 pr-2 text-[11px]"
                  >
                    <Avatar name={nameOf(id)} size="sm" />
                    {nameOf(id)}
                    <button
                      type="button"
                      aria-label={`Bỏ ${nameOf(id)}`}
                      onClick={() => toggle(id)}
                      className="motion-std hover:text-foreground"
                    >
                      <Icon icon={X} size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <p className="text-muted-foreground text-[11px] leading-[1.5]">
              Giao việc không đổi người giữ lead — đổi tay là đề nghị riêng, vì phần chốt của hoa
              hồng chia lại theo đó. Đề nghị này chờ {HEAD_OF_SALES} gật.
            </p>

            <div className="flex gap-2">
              <Button
                size="md"
                disabled={picked.length === 0 || task === ''}
                onClick={() => {
                  assign(lead.code, picked, task)
                  setOpen(false)
                  /* Nối E3 khi có backend: đề nghị này thành phiếu duyệt thật và
                     người được giao nhận thông báo qua E4. */
                }}
              >
                <Icon icon={Check} size={16} />
                Giao cho {picked.length} người
              </Button>
              <Button size="md" variant="ghost" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  )
}

/** Đề nghị đang treo, dạng đọc — dùng ở màn chi tiết ngay dưới nút. */
export function AssignedPills({ lead }: { lead: Lead }) {
  const assigns = useLeadDesk((s) => s.assigns)
  const clear = useLeadDesk((s) => s.clearAssign)
  const current = assigns[lead.code]
  if (!current) return null

  const names = current.actorIds.map((id) => dasVina.actors.find((a) => a.id === id)?.name ?? id)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AvatarGroup names={names} max={4} />
      <span className="text-[11.5px]">
        Đã đề nghị giao <b className="font-semibold">{current.task}</b> · chờ {HEAD_OF_SALES} gật
      </span>
      <Button size="sm" variant="ghost" onClick={() => clear(lead.code)}>
        Rút lại
      </Button>
    </div>
  )
}
