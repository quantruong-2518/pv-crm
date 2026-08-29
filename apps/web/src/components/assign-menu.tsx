import { useEffect, useMemo, useState } from 'react'
import { Check, RotateCcw, UserRoundPlus } from '@pv/ui'
import { Avatar, Badge, Button, Drawer, Icon, MetaPill, SearchField, cn } from '@pv/ui'
import type { Lead } from '@pv/engines/fixtures/das-vina'
import type { LeadProfile } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { toast } from '@/app/toast'
import { useDirectory } from '@/data/directory'
import { useSetLeadOwner } from '@/data/lead-owner'
import { assigneeOptions } from '@/data/leads'

/** Giao lead cho một người — nút + bảng chọn người, ghi thẳng vào `owner_id`.
 *
 *  ------------------------------------------------------------------
 *  ĐÂY LÀ KHỐI ĐÃ BỎ CƠ CHẾ ĐỀ NGHỊ, VÀ VÌ SAO
 *  ------------------------------------------------------------------
 *  Bản trước gửi một "đề nghị giao việc" — nhiều người cho một việc — vào
 *  `useLeadDesk`, một kho sống trong trình duyệt, rồi in "chờ trưởng phòng
 *  gật". Ba điều sai cùng lúc, và cái thứ ba mới là cái nặng:
 *
 *   1 · **Không ai gật được.** E3 chưa từng nối vào đây, nên trạng thái chờ là
 *       một CÂU chứ không phải một trạng thái. Không có màn nào liệt kê đề
 *       nghị đang treo để duyệt.
 *   2 · **Không ai khác thấy.** Kho là `localStorage`; người được giao mở máy
 *       của họ lên thì không có gì cả.
 *   3 · **Lead không đổi tay.** `owner_id` đứng nguyên dù bấm bao nhiêu lần,
 *       nên cột Lead PIC, ô lọc theo người, trục phạm vi của E2 và
 *       `CREDIT_RULES` đều tiếp tục trả lời như chưa có ai giao gì.
 *
 *  Nên khối này giờ làm đúng một việc và làm thật: đặt `lead.owner_id` qua
 *  `PATCH /sales/leads/:code/owner`. Bấm xong là dữ liệu đã đổi trên máy chủ,
 *  cột Lead PIC ở sổ đổi theo trong cùng một nhịp (`useSetLeadOwner` vứt ba
 *  tiền tố cache), và dòng thời gian của lead có một lần chạm `giao`.
 *
 *  ------------------------------------------------------------------
 *  MỘT NGƯỜI, KHÔNG PHẢI NHIỀU — VÀ KHÔNG CÒN Ô "VIỆC CẦN GIAO"
 *  ------------------------------------------------------------------
 *  Cả hai thứ đó mất theo cùng một lý do: không có cột nào để chúng rơi vào.
 *  `sales.lead` mang MỘT `owner_id`; không có bảng "việc được giao", và câu
 *  việc cũ được chọn từ một danh sách chính màn tự suy ra (`nextActions`) chứ
 *  không phải từ dữ liệu. Giữ lại một ô nhập mà giá trị của nó không đi đâu cả
 *  là mời người dùng gõ vào chỗ trống.
 *
 *  Danh sách người vẫn xếp theo `assigneeOptions` — mình trước, rồi người hợp
 *  với ĐÚNG lead này, rồi phần còn lại. Gợi ý chỉ đổi THỨ TỰ, không giới hạn:
 *  gợi ý sai thì người dùng vẫn phải chọn được người mình muốn.
 *
 *  ------------------------------------------------------------------
 *  AI BẤM ĐƯỢC NÚT NÀO — HỎI E2, VÀ MÁY CHỦ HỎI LẠI
 *  ------------------------------------------------------------------
 *  `lead.giao` chỉ có ở trưởng phòng và giám đốc: giao khách của người khác
 *  cho người thứ ba là chia lại hoa hồng. Không có quyền đó thì màn chỉ mở
 *  đúng một đường — NHẬN một lead chưa ai giữ về cho mình, thứ không lấy của
 *  ai cái gì.
 *
 *  Hàng rào ở đây là để nút không mời người dùng làm việc sẽ bị từ chối; hàng
 *  rào THẬT nằm ở `LeadWriteService.setOwner`, chỗ duy nhất cầm `owner_id`
 *  hiện tại và cũng là chỗ duy nhất khoá được dòng trong lúc đọc nó. */

type MenuProps = {
  /** Hình `Lead` của fixture — CHỈ để `assigneeOptions` xếp thứ tự gợi ý (nó
   *  đọc `category`, `stage`, `tier`, `requiredFilled`). Không có giá trị nào
   *  của nó được gửi lên máy chủ. */
  lead: Lead
  /** Hồ sơ TRÊN DÂY — nguồn của mã, tên account và người đang giữ. Mọi thứ đi
   *  vào phép ghi đến từ đây, không từ `lead`. */
  profile: LeadProfile
  /** Nút to cho màn chi tiết, nút nhỏ cho hàng bảng. */
  size?: 'sm' | 'md'
  /** Màu của nút mở, để thanh hành động phân vai rõ mà không đổi panel. */
  buttonVariant?: 'default' | 'secondary' | 'ghost'
  className?: string
}

export function AssignMenu({ lead, profile, size = 'md', buttonVariant, className }: MenuProps) {
  const me = useSession((s) => s.actor)
  const mayAssign = useCan('lead.giao')
  const staff = useDirectory()
  const setOwner = useSetLeadOwner()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)

  const held = profile.ownerId ?? null
  const heldByMe = held !== null && held === me?.id
  /** Đường duy nhất còn lại cho người không có `lead.giao`. */
  const mayClaim = held === null && me !== undefined

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

  /* Mở bảng là một lần bắt đầu mới: ô tìm sạch, và người đang giữ được chọn
     sẵn để bảng nói đúng trạng thái hiện tại thay vì trạng thái rỗng. */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setPicked(held)
    setOwner.reset()
    // `setOwner` là object mutation của TanStack, đổi định danh mỗi lượt vẽ —
    // đưa nó vào deps là chạy lại effect này liên tục và xoá ô tìm dưới tay
    // người đang gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, held])

  const pickedPerson = people.find((person) => person.id === picked)

  /** Một lượt ghi, ba chỗ dùng: giao cho người đã chọn · nhận về mình · trả về
   *  kho chung. Toast nói ra thứ vừa ghi, vì sổ ở màn sau sẽ hiện đúng thế. */
  const commit = (ownerId: string | null, said: string) => {
    setOwner.mutate(
      { code: profile.code, ownerId },
      {
        onSuccess: () => {
          toast(said, { tone: 'success', detail: `${profile.code} · ${profile.company}` })
          setOpen(false)
        },
      },
    )
  }

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

  /* Không giao được VÀ không nhận được thì nút không có việc gì để mở. Tắt kèm
     lý do, chứ không giấu: một nút biến mất đọc ra là "màn hỏng", còn một nút
     tắt có tooltip đọc ra là "việc này không phải của bạn". */
  const blocked = !mayAssign && !mayClaim
  const blockedWhy = heldByMe
    ? 'Lead đang đứng tên bạn. Chuyển tay là việc của trưởng phòng.'
    : 'Lead đã có người nhận — hỏi trưởng phòng nếu cần chuyển tay.'

  return (
    <div className={cn(className)}>
      <Button
        size={size}
        variant={buttonVariant ?? (held ? 'ghost' : 'default')}
        onClick={() => setOpen(true)}
        disabled={blocked}
        title={blocked ? blockedWhy : undefined}
        aria-expanded={open}
      >
        <Icon icon={UserRoundPlus} size={16} />
        {held ? 'Đổi PIC' : 'Giao lead'}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={held ? 'Đổi người giữ lead' : 'Giao lead'}
        subtitle={
          <>
            <span className="font-mono">{profile.code}</span> · {profile.company}
          </>
        }
        meta={
          <Badge tone={held ? 'running' : 'draft'}>{profile.ownerName ?? 'Chưa ai nhận'}</Badge>
        }
        footer={
          <div className="flex flex-col gap-3">
            {/* Câu này THAY câu "đề nghị sẽ chờ … duyệt" của bản cũ, và nó nói
                ngược lại vì sự thật đã ngược lại: bấm là đổi, không có ai gật
                ở giữa. Người bấm phải biết điều đó TRƯỚC khi bấm. */}
            <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
              Đổi PIC là ghi thẳng vào sổ, không qua bước duyệt — người mới nhận lead ngay và phần
              chốt hoa hồng tính theo người đang giữ.
            </p>

            {setOwner.isError && (
              <p className="text-danger m-0 text-[12.5px] leading-[1.6]" role="alert">
                {isApiError(setOwner.error)
                  ? userMessage(setOwner.error)
                  : 'Không ghi được. Vui lòng thử lại.'}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button size="md" variant="ghost" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              {/* Trả về kho chung chỉ có mặt khi CÓ người đang giữ — trả một
                  lead vốn đã ở kho chung là một nút không làm gì. */}
              {mayAssign && held !== null && (
                <Button
                  size="md"
                  variant="secondary"
                  disabled={setOwner.isPending}
                  onClick={() => commit(null, 'Đã trả lead về kho chung')}
                >
                  <Icon icon={RotateCcw} size={16} />
                  Trả về kho chung
                </Button>
              )}
              <Button
                size="md"
                disabled={picked === null || picked === held || setOwner.isPending}
                onClick={() =>
                  picked &&
                  commit(
                    picked,
                    picked === me?.id
                      ? 'Bạn đã nhận lead này'
                      : `Đã giao lead cho ${pickedPerson?.name ?? 'người được chọn'}`,
                  )
                }
              >
                <Icon icon={Check} size={16} />
                {setOwner.isPending ? 'Đang ghi…' : 'Lưu người giữ'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2 rounded-lg bg-white/5 p-4">
            <span className="text-muted-foreground text-[12px]">Đang giữ lead</span>
            {profile.ownerName ? (
              <MetaPill avatar={profile.ownerName} title={profile.ownerEmail}>
                {profile.ownerName}
              </MetaPill>
            ) : (
              <span className="text-[13px] font-semibold">Còn ở kho chung, chưa ai nhận</span>
            )}
          </section>

          {self && (mayAssign || mayClaim) && (
            <div className="bg-primary/12 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={self.name} size="md" />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13.5px] font-semibold">Nhận lead về mình</span>
                  <span className="text-muted-foreground text-[12px] leading-[1.5]">
                    {self.name} · {self.role}
                  </span>
                </span>
              </span>
              {/* Một bấm là xong, không phải chọn rồi lưu: "nhận việc" là động
                  tác người ta làm nhiều nhất trên màn này, và bắt nó đi qua hai
                  bước chỉ để giống đường giao cho người khác là bắt số đông trả
                  giá cho số ít. */}
              <Button
                size="md"
                disabled={heldByMe || setOwner.isPending}
                title={heldByMe ? 'Lead này đã đứng tên bạn.' : undefined}
                onClick={() => me && commit(me.id, 'Bạn đã nhận lead này')}
                className="shrink-0"
              >
                <Icon icon={heldByMe ? Check : UserRoundPlus} size={16} />
                {heldByMe ? 'Bạn đang giữ' : 'Nhận lead'}
              </Button>
            </div>
          )}

          {mayAssign ? (
            <section className="flex flex-col gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] font-semibold">Giao cho người khác</span>
                <span className="text-muted-foreground text-[12px] leading-[1.5]">
                  Chọn MỘT người — lead chỉ có một người giữ.
                </span>
              </div>

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
                      {rows.map((person) => {
                        const on = picked === person.id
                        return (
                          /* `role="radio"` chứ không phải Checkbox của bản cũ:
                             hình dạng của ô phải nói đúng luật của dữ liệu, và
                             luật là MỘT người giữ. Một hàng checkbox mời người
                             dùng tick hai cái rồi mới báo không được. */
                          <button
                            key={person.id}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setPicked(person.id)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-md p-3 text-left',
                              on ? 'bg-primary/16' : 'hover:bg-white/6',
                            )}
                          >
                            <Avatar name={person.name} size="md" />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="text-[13px] font-semibold">{person.name}</span>
                              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                                {person.role} · {person.why}
                              </span>
                            </span>
                            {on && <Icon icon={Check} size={16} />}
                          </button>
                        )
                      })}
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
          ) : (
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              Giao lead cho người khác là quyền của trưởng phòng — phần chốt của hoa hồng chia theo
              người đang giữ. Bạn nhận được lead chưa ai giữ về cho mình.
            </p>
          )}
        </div>
      </Drawer>
    </div>
  )
}
