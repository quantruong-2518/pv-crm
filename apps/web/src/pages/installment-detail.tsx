import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppShell,
  Badge,
  Button,
  Check,
  FileText,
  GlassCard,
  Icon,
  Mail,
  MetaPill,
  Paperclip,
  PenLine,
  Phone,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  StatCard,
  StatusDot,
  Timeline,
  cn,
  dong,
  millions,
  type StatusDotState,
} from '@pv/ui'
import { daysUntil } from '@pv/engines'
import { useAppChrome } from '@/app/chrome'
import { useSession } from '@/app/auth'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { dm, dmhm, dmy } from '@/lib/date'
import {
  TODAY,
  contractOf,
  daysPhrase,
  installmentOf,
  viewInstallment,
  type InstallmentCondition,
} from '@/data/contracts'
import { DueBadge, SideTag } from '@/components/contract-bits'

/** Level 2 of the drill — inside one installment.
 *
 *  Four blocks, and the order is the order a person asks for them: what is still
 *  missing, what paperwork exists, what we have already chased, and the sentence
 *  no field can hold. The unlock checklist comes first because it is the only
 *  block that can change today. */

const RECORD_DOT: Record<string, StatusDotState> = {
  xong: 'ok',
  'chờ-trả-lời': 'bad',
  'đã-xếp': 'current',
  'chưa-tới': 'next',
}

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  'zalo-oa': 'Zalo OA',
  'trong-app': 'Trong app',
  gọi: 'Gọi điện',
}

const DOC_TONE = { đủ: 'success', 'chờ-ký': 'danger', 'chưa-có': 'draft' } as const

/** One checklist line. The blocking one is given room to breathe and carries the
 *  buttons — every other line is a tick and a date, because a done thing does not
 *  need a call to action beside it. */
function ConditionLine({
  condition,
  blocking,
  canAct,
}: {
  condition: InstallmentCondition
  blocking: boolean
  canAct: boolean
}) {
  const late = !condition.doneAt && daysUntil(condition.due, TODAY) <= 0

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md p-3',
        blocking
          ? 'bg-destructive/16 p-4 shadow-[inset_0_1px_0_rgb(255_217_213/.16)]'
          : 'bg-white/6',
      )}
    >
      <span
        className={cn(
          'mt-1 flex size-[18px] shrink-0 items-center justify-center rounded-sm',
          condition.doneAt
            ? 'bg-success'
            : late
              ? 'bg-white/9 shadow-[inset_0_0_0_1.5px_var(--destructive-foreground)]'
              : 'bg-white/9',
        )}
      >
        {condition.doneAt && <Icon icon={Check} size={14} className="text-background" />}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className={cn('text-[12.5px]', blocking && 'text-on-tint-destructive font-semibold')}>
          {condition.what}
        </span>
        <span
          className={cn(
            'tnum font-mono text-[10.5px]',
            late ? 'text-destructive-foreground' : 'text-muted-foreground',
          )}
        >
          hạn {dm(condition.due)}
          {condition.doneAt
            ? ` · xong ${dm(condition.doneAt)}`
            : ` · ${daysPhrase(daysUntil(condition.due, TODAY))}`}
          {' · '}
          {condition.who}
        </span>

        {blocking && (
          <>
            <p className="text-on-tint-destructive text-[11.5px] leading-[1.7]">
              Đây là việc duy nhất còn thiếu. Xong nó thì đợt này đến hạn và kế toán xuất được hoá
              đơn.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => toast('Thư nhắc sẽ mở khi thư viện mail nối vào màn này.')}
              >
                <Icon icon={Mail} size={16} />
                Nhắc {condition.side === 'khách' ? 'khách' : 'nội bộ'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canAct}
                title={canAct ? undefined : 'Vai của bạn không ghi nhận được — việc của kế toán'}
                onClick={() => toast('Ghi nhận cần một lượt duyệt trước khi ghi vào sổ.')}
              >
                Ghi nhận đã xong
              </Button>
            </div>
          </>
        )}
      </div>

      <SideTag side={condition.side} />
    </div>
  )
}

export function InstallmentDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hợp đồng, khách hàng, số hoá đơn…' })
  const navigate = useNavigate()
  const { code = '', no = '' } = useParams()
  const actor = useSession((s) => s.actor)
  const canRecord = useCan('hợp-đồng.ghi-nhận-thu')

  const contract = useMemo(() => contractOf(code, actor), [code, actor])
  const installment = useMemo(
    () => (contract ? installmentOf(contract, Number(no)) : null),
    [contract, no],
  )

  if (!contract || !installment) {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <ScreenHeader
            title="Không mở được đợt này"
            description="Hợp đồng không tồn tại, không đứng tên bạn, hoặc số đợt sai."
            back={{ label: 'Về sổ hợp đồng', onClick: () => navigate('/sales/contracts') }}
          />
        </ScreenLayout>
      </AppShell>
    )
  }

  const view = viewInstallment(installment)
  const invoice = installment.docs.find((d) => d.name.includes('Hoá đơn'))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker={`Đợt thanh toán · ${contract.customer}`}
          title={`Đợt ${installment.no} · ${installment.label}`}
          back={{
            label: contract.code,
            onClick: () => navigate(`/sales/contracts/${contract.code}`),
          }}
          meta={
            <div className="flex flex-wrap gap-2">
              <DueBadge level={view.level} />
              <MetaPill mono>{dong(installment.amount)}</MetaPill>
              <MetaPill>{installment.share}% giá trị hợp đồng</MetaPill>
            </div>
          }
          actions={
            <Button onClick={() => toast('Danh bạ khách sẽ nối vào ở lượt sau.')}>
              <Icon icon={Phone} size={16} />
              Gọi {contract.contact}
            </Button>
          }
        />

        <GlassCard className="grid gap-6 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            size="compact"
            label="Số tiền"
            value={millions(installment.amount, 0)}
            source={dong(installment.amount)}
          />
          <StatCard
            size="compact"
            label="Hạn thanh toán"
            value={dm(installment.due)}
            source={installment.paidAt ? `về ${dm(installment.paidAt)}` : daysPhrase(view.daysLeft)}
          />
          <StatCard
            size="compact"
            label="Điều kiện mở khoá"
            value={`${view.doneConditions}/${view.totalConditions}`}
            source={
              view.blocking
                ? `còn 1 · bên ${view.blocking.side === 'ta' ? 'ta' : 'khách'}`
                : 'xong cả hai bên'
            }
          />
          <StatCard
            size="compact"
            label="Hoá đơn"
            value={invoice?.state === 'đủ' ? 'Đã xuất' : 'Chưa xuất'}
            source={invoice?.hint ?? 'chưa tới lượt'}
          />
        </GlassCard>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <GlassCard variant="b" className="flex flex-1 flex-col gap-4 p-5">
            <SectionTitle
              kicker="Điều kiện mở khoá"
              size="lg"
              hint="Chép từ điều khoản thanh toán của hợp đồng. Mỗi dòng thuộc về một bên."
            >
              {view.totalConditions} việc, xong hết thì đợt này đến hạn
            </SectionTitle>
            <div className="flex flex-col gap-2">
              {installment.conditions.map((c) => (
                <ConditionLine
                  key={c.id}
                  condition={c}
                  blocking={view.blocking?.id === c.id}
                  canAct={canRecord}
                />
              ))}
            </div>
          </GlassCard>

          <GlassCard variant="b" className="flex w-full flex-col gap-4 p-5 xl:w-[400px]">
            <SectionTitle kicker="Giấy tờ" size="detail">
              {installment.docs.length} tệp của đợt này
            </SectionTitle>
            {installment.docs.length === 0 ? (
              <p className="text-muted-foreground text-[11.5px] leading-[1.7]">
                Chưa có tệp nào — đợt này còn xa, giấy tờ chỉ sinh ra khi tới lượt.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {installment.docs.map((doc) => (
                  <div key={doc.id} className="bg-white/6 flex items-center gap-3 rounded-md p-3">
                    <Icon icon={FileText} size={18} className="text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px]">{doc.name}</span>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {doc.hint}
                      </span>
                    </span>
                    <Badge tone={DOC_TONE[doc.state]} className="shrink-0 uppercase">
                      {doc.state}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <GlassCard variant="b" className="flex flex-1 flex-col gap-4 p-5">
            <SectionTitle
              kicker="Bản ghi"
              size="lg"
              hint="Đã nhắc gì, khách trả lời gì, còn nhắc gì nữa — một danh sách, không tách lịch sử với kế hoạch."
            >
              {installment.records.length} lượt chạm
            </SectionTitle>

            {installment.records.length === 0 ? (
              <p className="text-muted-foreground text-[11.5px] leading-[1.7]">
                Chưa chạm lượt nào. Nhịp nhắc dựng sẵn sẽ bắt đầu 14 ngày trước hạn.
              </p>
            ) : (
              <Timeline
                items={installment.records.map((r) => ({
                  id: r.id,
                  state: RECORD_DOT[r.state],
                  title: r.what,
                  meta: (
                    <div className="flex flex-wrap items-center gap-2">
                      <MetaPill>{CHANNEL_LABEL[r.channel]}</MetaPill>
                      <span className="text-muted-foreground tnum font-mono text-[10.5px]">
                        {r.state === 'chưa-tới' || r.state === 'đã-xếp' ? dm(r.at) : dmhm(r.at)} ·{' '}
                        {r.detail}
                      </span>
                    </div>
                  ),
                }))}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => toast('Thư nhắc sẽ mở khi thư viện mail nối vào màn này.')}
              >
                Nhắc ngay, không chờ nhịp
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toast('Sổ cuộc gọi nối ở lượt sau.')}
              >
                <Icon icon={Phone} size={16} />
                Ghi một cuộc gọi
              </Button>
            </div>
          </GlassCard>

          <GlassCard variant="b" className="flex w-full flex-col gap-4 p-5 xl:w-[400px]">
            <SectionTitle kicker="Ghi chú" size="detail">
              Thứ không ô nào chứa được
            </SectionTitle>

            {installment.notes.map((note) => (
              <div key={note.id} className="bg-white/6 flex flex-col gap-2 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <StatusDot state="ok" />
                  <span className="text-glass-foreground text-[11px]">{note.who}</span>
                  <span className="text-muted-foreground tnum ml-auto font-mono text-[10px]">
                    {dmhm(note.at)}
                  </span>
                </div>
                <p className="text-[11.5px] leading-[1.7]">{note.text}</p>
              </div>
            ))}

            <div className="bg-accent flex flex-col gap-2 rounded-md p-3 shadow-[inset_0_1px_0_rgb(150_180_255/.22)]">
              <span className="text-on-tint-primary-muted font-mono text-[10.5px] uppercase tracking-[.13em]">
                Lời hứa của khách
              </span>
              <p className="text-on-tint-primary-muted text-[11.5px] leading-[1.7]">
                Chưa có dòng nào. Gọi xong thì ghi lại: khách hẹn ngày nào, ai hẹn, hẹn qua kênh nào
                — để lần sau không phải nhớ.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                onClick={() => toast('Ô ghi lời hứa nối ở lượt sau.')}
              >
                <Icon icon={PenLine} size={16} />
                Ghi lời hứa
              </Button>
            </div>

            <button
              type="button"
              className="text-muted-foreground motion-std bg-white/6 hover:bg-white/12 flex items-center gap-2 rounded-md p-3 text-[11.5px]"
              onClick={() => toast('Ô ghi chú nối ở lượt sau.')}
            >
              <Icon icon={Paperclip} size={16} />
              Viết ghi chú mới…
            </button>
          </GlassCard>
        </div>

        <p className="text-muted-foreground text-[11px]">
          Số liệu đóng băng tại {dmy(TODAY)} — kịch bản Sao Đỏ, chưa nối máy chủ.
        </p>
      </ScreenLayout>
    </AppShell>
  )
}

export default InstallmentDetailPage
