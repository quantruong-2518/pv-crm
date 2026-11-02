import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Check, Inbox, UserRoundPlus } from '@pv/ui'
import { Avatar, Button, Drawer, Icon, MetaPill, SearchField, cn } from '@pv/ui'
import type { LeadRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toast } from '@/app/toast'
import { fuzzyRank } from '@/lib/fuzzy-rank'
import { assignDoorOf } from '@/components/assign-door'
import { HandoverDeals } from '@/components/handover-deals'
import { ROW_ICON } from '@/components/table-bits'
import { useDirectory } from '@/data/directory'
import { leadIndustryOptionsQuery } from '@/data/industries'
import { useHandoverChoice, useSetLeadOwner } from '@/data/lead-owner'
import { isOpenState } from '@/data/lead-state'
import { assigneeOptions, type AssigneeOption, type AssigneeCandidateLead } from '@/data/leads'

/** Giao/đổi PIC cho một lead — bấm một người trong danh sách, xác nhận, ghi
 *  thẳng vào `owner_id` qua `PATCH /sales/leads/:code/owner`. Không có bước
 *  duyệt: máy chủ là nguồn sự thật duy nhất, panel chỉ hỏi lại trước khi ghi.
 *
 *  `lead.assign` (trưởng phòng/giám đốc) mới giao được cho NGƯỜI KHÁC; ai
 *  không có quyền đó chỉ thấy đường NHẬN một lead chưa ai giữ — chi tiết ở
 *  `LeadWriteService.setOwner`, chỗ duy nhất cầm khoá trên `owner_id`. */

type MenuProps = {
  /** Only used to rank `assigneeOptions` (reads `category`, `stage`, `tier`,
   *  `requiredFilled`). Nothing on it is sent to the server. `LeadRow` (book
   *  row) already carries these four fields, and so does the detail page's
   *  `LeadProfile`, so both pass it straight through. */
  lead: AssigneeCandidateLead
  /** Source of the code, account name and current holder. Everything the
   *  write sends comes from here, not from `lead`. `LeadProfile` extends
   *  `LeadRow`, so the detail page's full profile still fits here. */
  profile: LeadRow
  /** The reader holds `lead.edit` but reaches this lead only through a live
   *  deal (ADR 0071): shut, with that reason rather than the role one. */
  readOnly?: boolean
  /** Nút to cho màn chi tiết, nút nhỏ cho hàng bảng. */
  size?: 'sm' | 'md'
  /** Màu của nút mở, để thanh hành động phân vai rõ mà không đổi panel. */
  buttonVariant?: 'default' | 'secondary' | 'ghost'
  /** Trigger is icon-only, for a table cell that already shows the holder's
   *  name via `PicCell` next to it. The label moves to `aria-label`/`title`
   *  instead of disappearing. */
  iconOnly?: boolean
  className?: string
  /** Controlled: another door (the profile's more menu) opens the drawer. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** `false` = no trigger drawn; the caller's own door stands in for it. */
  trigger?: boolean
}

function PersonRow({
  person,
  tag,
  disabled,
  selected,
  onPick,
}: {
  person: Pick<AssigneeOption, 'id' | 'name' | 'role'>
  tag?: string
  disabled?: boolean
  selected: boolean
  onPick: () => void
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md p-3 text-left',
        disabled ? 'opacity-60' : selected ? 'bg-primary/16' : 'hover:bg-surface-ink/6',
      )}
    >
      <Avatar name={person.name} size="md" card={false} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold">
          {person.name}
          {tag && <span className="text-muted-foreground ml-2 text-[11px] font-normal">{tag}</span>}
        </span>
        <span className="text-muted-foreground truncate text-[11.5px] leading-[1.5]">
          {disabled
            ? t(message('Đang giữ lead này', 'Holds this lead', '이 리드를 담당 중'))
            : person.role}
        </span>
      </span>
      {(selected || disabled) && <Icon icon={Check} size={16} />}
    </button>
  )
}

export function AssignMenu({
  lead,
  profile,
  readOnly = false,
  size = 'md',
  buttonVariant,
  iconOnly,
  className,
  open: openProp,
  onOpenChange,
  trigger = true,
}: MenuProps) {
  const { t, lang } = useI18n()
  const me = useSession((s) => s.actor)
  const mayAssign = useCan('lead.assign')
  const staff = useDirectory()
  const setOwner = useSetLeadOwner()

  const [ownOpen, setOwnOpen] = useState(false)
  const open = openProp ?? ownOpen
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    onOpenChange?.(next)
  }
  const [query, setQuery] = useState('')
  /** Ô gõ đổi ngay để tay không thấy trễ; lọc chạy trên bản trễ 200ms để mỗi
   *  phím gõ không vẽ lại cả danh sách. */
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [releasing, setReleasing] = useState(false)

  const held = profile.ownerId ?? null
  const heldByMe = held !== null && held === me?.id
  /** Đường duy nhất còn lại cho người không có `lead.assign`. */
  const mayClaim = held === null && me !== undefined

  const handover = useHandoverChoice(profile.code, held, open && mayAssign)

  const { data: industries } = useQuery({ ...leadIndustryOptionsQuery, enabled: open })
  const categories = industries?.categories
  const people = useMemo(
    () => assigneeOptions(lead, staff, me?.id, categories ?? []),
    [lead, staff, me?.id, categories],
  )
  const self = people.find((person) => person.group === 'mine')
  /* Người đang giữ đã ở đúng chỗ rồi — chọn lại họ là một cú ghi không đổi gì. */
  const others = useMemo(
    () => people.filter((person) => person.group !== 'mine' && person.id !== held),
    [people, held],
  )

  const shown = useMemo(() => {
    return fuzzyRank(others, debouncedQuery, (p) => [p.name, p.role, ...p.domains])
  }, [others, debouncedQuery])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timer)
  }, [query])

  /* Mở lại là một lượt mới — sạch cả hai state của ô tìm, không chỉ state gõ,
     kẻo bản lọc cũ hiện đúng 200ms trước khi debounce ở trên bắt kịp. */
  useEffect(() => {
    if (!open) return
    setQuery('')
    setDebouncedQuery('')
    setPicked(null)
    setReleasing(false)
    handover.reset()
    setOwner.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pickedPerson = picked === self?.id ? self : others.find((person) => person.id === picked)

  const commit = (ownerId: string | null, said: string) => {
    // A release leaves the deals where they are, so it sends no choice.
    const dealCodes = ownerId !== null && held !== null ? handover.dealCodes : undefined
    setOwner.mutate(
      { code: profile.code, ownerId, ...(dealCodes ? { dealCodes } : {}) },
      {
        onSuccess: () => {
          toast(said, { tone: 'success', detail: `${profile.code} · ${profile.company}` })
          setOpen(false)
        },
      },
    )
  }

  /* Không giao được VÀ không nhận được thì nút không có việc gì để mở. Tắt kèm
     lý do, chứ không giấu: một nút biến mất đọc ra là "màn hỏng", còn một nút
     tắt có tooltip đọc ra là "việc này không phải của bạn". */
  const door = assignDoorOf(held, mayAssign, readOnly, me !== undefined, lang)
  const blocked = door.shut
  const blockedWhy = readOnly
    ? t(
        message(
          'Bạn không giữ lead này nên không giao được.',
          'You do not hold this lead, so you cannot assign it.',
          '이 리드를 담당하고 있지 않아 배정할 수 없습니다.',
        ),
      )
    : heldByMe
      ? t(
          message(
            'Lead đang do bạn giữ. Chỉ trưởng phòng được đổi người giữ.',
            'You hold this lead. Only the department head can change the holder.',
            '이 리드는 귀하가 담당 중입니다. 담당자는 부서장만 변경할 수 있습니다.',
          ),
        )
      : t(
          message(
            'Lead đã có người giữ. Hỏi trưởng phòng nếu cần đổi.',
            'This lead already has a holder. Ask the department head to change it.',
            '이 리드는 이미 담당자가 있습니다. 변경이 필요하면 부서장에게 문의하세요.',
          ),
        )
  const triggerLabel = door.label
  /* `ArrowLeftRight` reads as "change hands"; `UserRoundPlus` only fits the
     first-assign case — an unheld lead has no hands to change yet. */
  const triggerIcon = held ? ArrowLeftRight : UserRoundPlus

  return (
    /* `hidden`, not dropped: the drawer is portalled, so it still opens. */
    <div className={cn(className)} hidden={!trigger}>
      {trigger && (
        <Button
          size={size}
          variant={buttonVariant ?? (held ? 'ghost' : 'default')}
          onClick={() => setOpen(true)}
          disabled={blocked}
          title={blocked ? blockedWhy : iconOnly ? triggerLabel : undefined}
          aria-label={iconOnly ? triggerLabel : undefined}
          aria-expanded={open}
          className={iconOnly ? ROW_ICON : undefined}
        >
          <Icon icon={triggerIcon} size={16} />
          {!iconOnly && triggerLabel}
        </Button>
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          held
            ? t(message('Đổi người giữ lead', 'Change lead holder', '리드 담당자 변경'))
            : t(message('Giao lead', 'Assign lead', '리드 배정'))
        }
        subtitle={
          <>
            <span className="font-mono">{profile.code}</span> · {profile.company}
          </>
        }
        footer={
          releasing ? (
            <div className="flex flex-col gap-3">
              {setOwner.isError && (
                <p
                  className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]"
                  role="alert"
                >
                  {isApiError(setOwner.error)
                    ? userMessage(setOwner.error)
                    : t(
                        message(
                          'Chưa đưa về kho được. Thử lại.',
                          'Could not return it to the pool. Try again.',
                          '공용 풀로 되돌리지 못했습니다. 다시 시도해 주세요.',
                        ),
                      )}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px]">
                  {t(
                    message(
                      'Đưa lead về kho chung?',
                      'Return this lead to the shared pool?',
                      '이 리드를 공용 풀로 되돌릴까요?',
                    ),
                  )}
                </span>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="md"
                    variant="ghost"
                    disabled={setOwner.isPending}
                    onClick={() => setReleasing(false)}
                  >
                    {t(message('Huỷ', 'Cancel', '취소'))}
                  </Button>
                  <Button
                    size="md"
                    disabled={setOwner.isPending}
                    onClick={() =>
                      commit(
                        null,
                        t(
                          message(
                            'Lead đã về kho',
                            'Lead returned to the pool',
                            '리드를 공용 풀로 되돌렸습니다',
                          ),
                        ),
                      )
                    }
                  >
                    <Icon icon={Inbox} size={16} />
                    {setOwner.isPending
                      ? t(message('Đang ghi…', 'Saving…', '저장 중…'))
                      : t(message('Về kho', 'Return to pool', '풀로 반환'))}
                  </Button>
                </div>
              </div>
            </div>
          ) : pickedPerson ? (
            <div className="flex flex-col gap-3">
              {setOwner.isError && (
                <p
                  className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]"
                  role="alert"
                >
                  {isApiError(setOwner.error)
                    ? userMessage(setOwner.error)
                    : t(
                        message(
                          'Không lưu được. Thử lại.',
                          'Could not save. Try again.',
                          '저장하지 못했습니다. 다시 시도해 주세요.',
                        ),
                      )}
                </p>
              )}
              {held !== null && <HandoverDeals choice={handover} />}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 text-[13px]">
                  {t(
                    message(
                      'Xác nhận giao lead cho',
                      'Confirm assigning the lead to',
                      '다음 사람에게 리드를 배정하시겠습니까:',
                    ),
                  )}{' '}
                  <span className="font-semibold">{pickedPerson.name}</span>?
                </span>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="md"
                    variant="ghost"
                    disabled={setOwner.isPending}
                    onClick={() => setPicked(null)}
                  >
                    {t(message('Huỷ', 'Cancel', '취소'))}
                  </Button>
                  <Button
                    size="md"
                    disabled={setOwner.isPending}
                    onClick={() =>
                      commit(
                        pickedPerson.id,
                        pickedPerson.id === me?.id
                          ? t(
                              message(
                                'Bạn đã nhận lead này',
                                'You took this lead',
                                '이 리드를 맡았습니다',
                              ),
                            )
                          : t(
                              message(
                                `Đã giao lead cho ${pickedPerson.name}`,
                                `Lead assigned to ${pickedPerson.name}`,
                                `${pickedPerson.name}님에게 리드를 배정했습니다`,
                              ),
                            ),
                      )
                    }
                  >
                    <Icon icon={Check} size={16} />
                    {setOwner.isPending
                      ? t(message('Đang ghi…', 'Saving…', '저장 중…'))
                      : pickedPerson.id === me?.id
                        ? t(message('Nhận lead', 'Take lead', '리드 맡기'))
                        : t(message('Giao lead', 'Assign lead', '리드 배정'))}
                  </Button>
                </div>
              </div>
            </div>
          ) : null
        }
      >
        <div className="flex flex-col gap-5">
          <section className="bg-surface-ink/5 flex items-center gap-3 rounded-lg p-4">
            <span className="text-muted-foreground shrink-0 text-[12px]">
              {t(message('PIC hiện tại', 'Current owner', '현재 담당자'))}
            </span>
            {profile.ownerName ? (
              <MetaPill avatar={profile.ownerName} title={profile.ownerEmail}>
                {profile.ownerName}
              </MetaPill>
            ) : (
              <span className="text-[13px] font-semibold">
                {t(message('Chưa ai PIC', 'No owner yet', '담당자 없음'))}
              </span>
            )}
          </section>

          {mayAssign && (
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={t(
                message(
                  'Tìm theo tên, vai trò hoặc chuyên môn…',
                  'Search by name, role or expertise…',
                  '이름, 역할, 전문 분야로 검색…',
                ),
              )}
              className="w-full"
            />
          )}

          <div className="flex flex-col gap-1">
            {self && (mayAssign || mayClaim) && (
              <>
                <PersonRow
                  person={self}
                  tag={t(message('Bạn', 'You', '나'))}
                  disabled={heldByMe}
                  selected={picked === self.id}
                  onPick={() => {
                    setReleasing(false)
                    setPicked(self.id)
                  }}
                />
                <div aria-hidden className="bg-surface-ink/10 -mx-2 my-2 h-px" />
              </>
            )}

            {mayAssign ? (
              <>
                {shown.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    selected={picked === person.id}
                    onPick={() => {
                      setReleasing(false)
                      setPicked(person.id)
                    }}
                  />
                ))}
                {shown.length === 0 && (
                  <p className="text-muted-foreground m-0 px-3 py-4 text-[12.5px] leading-[1.6]">
                    {query.trim() === ''
                      ? t(
                          message(
                            'Chưa có người khác để giao.',
                            'Nobody else to assign to yet.',
                            '배정할 다른 사람이 아직 없습니다.',
                          ),
                        )
                      : t(
                          message(
                            `Không tìm thấy "${query}".`,
                            `No results for "${query}".`,
                            `"${query}" 검색 결과가 없습니다.`,
                          ),
                        )}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
                {t(
                  message(
                    'Chỉ trưởng phòng được giao lead cho người khác. Bạn nhận được lead chưa ai giữ.',
                    'Only the department head can assign a lead to someone else. You can take a lead nobody holds.',
                    '다른 사람에게 리드를 배정할 수 있는 사람은 부서장뿐입니다. 담당자가 없는 리드는 직접 맡을 수 있습니다.',
                  ),
                )}
              </p>
            )}

            {mayAssign && held !== null && isOpenState(profile.state) && (
              <>
                <div aria-hidden className="bg-surface-ink/10 -mx-2 my-2 h-px" />
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null)
                    setReleasing(true)
                  }}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] font-semibold',
                    releasing ? 'bg-primary/16' : 'hover:bg-surface-ink/6',
                  )}
                >
                  <Icon icon={Inbox} size={16} />
                  {t(message('Về kho', 'Return to pool', '풀로 반환'))}
                </button>
              </>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  )
}
