import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer, Lock, Select } from '@pv/ui'
import type { UserHoldingsResponse, UserRow } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { formatNumber, message, useI18n, type Lang } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { useLockUser, usersQuery } from '@/data/users'
import { StepFooter } from '@/components/step-footer'

/** Locking someone who still holds open sales work (ADR 0097 §7): the lock
 *  reads `GET /users/:id/holdings` first; nothing held locks as before,
 *  anything held asks who receives it and sends `handoverTo` with the lock.
 *  The server moves every lead, deal and next step in the same write. */

/** Who receives the work. Only active Sales accounts are offered; whatever
 *  the server still refuses (a role that cannot hold deals) prints under the
 *  picker as its field error. */
export function HandoverDrawer({
  user,
  holdings,
  onClose,
  onLocked,
}: {
  user: UserRow
  /** `null` = closed. */
  holdings: UserHoldingsResponse | null
  onClose: () => void
  onLocked: (row: UserRow) => void
}) {
  const { t, lang } = useI18n()
  const [receiver, setReceiver] = useState('')
  const lock = useLockUser()
  const { reset } = lock
  const { data } = useQuery(usersQuery)
  const open = holdings !== null

  useEffect(() => {
    if (!open) return
    setReceiver('')
    reset()
  }, [open, reset])

  const options = (data?.rows ?? [])
    .filter((u) => u.id !== user.id && u.disabledAt === null && u.branches.includes('Sales'))
    .map((u) => ({ value: u.id, label: `${u.name} · ${u.role}` }))
  const fieldError = lock.error?.errors?.handoverTo?.[0]
  /* A 409 carries its own sentence (a deal still waiting for sign approval),
     so it shows even beside a field error — unless it only repeats it. */
  const footerError =
    lock.error &&
    (!fieldError || (lock.error.kind === 'conflict' && userMessage(lock.error) !== fieldError))
      ? lock.error
      : null
  const receiverName = data?.rows.find((u) => u.id === receiver)?.name

  const confirm = () =>
    lock.mutate(
      { id: user.id, disabled: true, handoverTo: receiver },
      {
        onSuccess: (row) => {
          const to = receiverName ?? t(message('người nhận', 'the receiver', '인수자'))
          toastDone(
            t(message('Đã khoá tài khoản', 'Account locked', '계정을 잠갔습니다')),
            t(
              message(
                `${row.name} không đăng nhập được nữa. Việc đã chuyển cho ${to}.`,
                `${row.name} can no longer sign in. Their work moved to ${to}.`,
                `${row.name}님은 더 이상 로그인할 수 없습니다. 업무는 ${to}님에게 이전되었습니다.`,
              ),
            ),
          )
          onLocked(row)
          onClose()
        },
      },
    )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(message(`Khoá ${user.name}`, `Lock ${user.name}`, `${user.name} 잠금`))}
      subtitle={
        holdings &&
        heldLine(holdings, lang) && (
          <span className="tnum">
            {t(message('Đang phụ trách', 'Currently owns', '현재 담당'))} {heldLine(holdings, lang)}
            .
          </span>
        )
      }
      footer={
        <StepFooter
          error={footerError}
          pending={lock.isPending}
          hint={
            receiver === ''
              ? t(
                  message(
                    'Chọn người nhận việc.',
                    'Choose who takes over the work.',
                    '업무를 넘겨받을 사람을 선택하세요.',
                  ),
                )
              : t(
                  message(
                    `${user.name} không đăng nhập được nữa.`,
                    `${user.name} can no longer sign in.`,
                    `${user.name}님은 더 이상 로그인할 수 없습니다.`,
                  ),
                )
          }
          onClose={onClose}
          confirm={{
            icon: Lock,
            label: t(message('Khoá và chuyển việc', 'Lock and hand over', '잠금 및 업무 이전')),
            disabled: receiver === '',
            onClick: confirm,
          }}
        />
      }
    >
      <div className="flex flex-col gap-2">
        {options.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            {t(
              message(
                'Chưa có ai khác ở Sales để nhận việc.',
                'Nobody else in Sales can take over the work yet.',
                '업무를 넘겨받을 다른 영업 담당자가 없습니다.',
              ),
            )}
          </p>
        ) : (
          <Select
            label={t(message('Người nhận việc', 'Receiver', '인수자'))}
            size="lg"
            value={receiver}
            options={[
              { value: '', label: t(message('Chọn người', 'Choose a person', '담당자 선택')) },
              ...options,
            ]}
            onChange={(v) => {
              setReceiver(v)
              reset()
            }}
          />
        )}
        <p
          role={fieldError ? 'alert' : undefined}
          className={
            fieldError
              ? 'text-destructive-foreground m-0 text-[11.5px]'
              : 'text-muted-foreground m-0 text-[11.5px]'
          }
        >
          {fieldError ??
            t(
              message(
                'Lead, cơ hội và việc tiếp theo chuyển sang người này. Cơ hội đang chờ duyệt ký giữ nguyên.',
                'Leads, opportunities and next steps move to this person. Opportunities awaiting sign-off approval stay as they are.',
                '리드, 기회, 다음 단계가 이 사람에게 이전됩니다. 계약 승인 대기 중인 기회는 그대로 유지됩니다.',
              ),
            )}
        </p>
        {holdings && <OffNote holdings={holdings} />}
      </div>
    </Drawer>
  )
}

/** What also moves from switched-off leads, said apart from the main count. */
function OffNote({ holdings }: { holdings: UserHoldingsResponse }) {
  const { t, lang } = useI18n()
  if (!offLine(holdings, lang)) return null
  return (
    <p className="text-muted-foreground tnum m-0 text-[11.5px]">
      {heldLine(holdings, lang)
        ? t(
            message(
              `Kèm ${offLine(holdings, 'vi')}.`,
              `Includes ${offLine(holdings, 'en')}.`,
              `${offLine(holdings, 'ko')} 포함.`,
            ),
          )
        : t(
            message(
              `${capitalize(offLine(holdings, 'vi'))} chuyển sang người này.`,
              `${capitalize(offLine(holdings, 'en'))} move to this person.`,
              `${offLine(holdings, 'ko')}이(가) 이 사람에게 이전됩니다.`,
            ),
          )}
    </p>
  )
}

const countOf = (n: number, lang: Lang, noun: readonly [string, string, string]) =>
  lang === 'ko'
    ? `${noun[2]} ${formatNumber(n, lang)}건`
    : `${formatNumber(n, lang)} ${noun[lang === 'en' ? 1 : 0]}`

/** The counted work, a kind at zero left out — switched-off leads have their own note. */
const heldLine = (h: UserHoldingsResponse, lang: Lang) =>
  (
    [
      [h.leads, ['lead', 'leads', '리드']],
      [h.opportunities, ['cơ hội', 'opportunities', '기회']], // i18n-ignore
      [h.nextSteps, ['việc tiếp theo', 'next steps', '다음 단계']], // i18n-ignore
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, noun]) => countOf(n, lang, noun))
    .join(', ')

/** Work on switched-off leads: the leads when the leaver holds some, else
 *  only deals or steps on them, which have no count of their own. */
const offLine = (h: UserHoldingsResponse, lang: Lang) =>
  h.switchedOffLeads > 0
    ? countOf(h.switchedOffLeads, lang, ['lead đã vô hiệu', 'switched-off leads', '비활성 리드']) // i18n-ignore
    : h.switchedOffOther > 0
      ? message('việc trên lead đã vô hiệu', 'work on switched-off leads', '비활성 리드의 업무')[
          lang
        ]
      : ''

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
