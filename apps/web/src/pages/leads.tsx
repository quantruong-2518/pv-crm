import { useMemo, useState } from 'react'
import { ArrowLeftRight, Inbox, TriangleAlert, UserPlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  ContextRail,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  Progress,
  SearchField,
  Skeleton,
  cn,
} from '@pv/ui'
import {
  canPromoteToSql,
  dasVina,
  EXIT_REASONS,
  FUNNEL,
  INIT_DATA_SLOTS,
  isOverSla,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  type ExitReason,
  type LeadCategory,
  type LeadTier,
} from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { ANCHOR_CODE, leadBookQuery } from '@/data/leads'

/** Module 2 · Sổ lead (docs/kien-truc-san-pham.md · "Bốn module Pebble Sales").
 *
 *  Ba mục của module nằm trên đúng một màn, vì cả ba đều thao tác trên cùng
 *  một dòng lead: 2.1 danh sách + lọc · 2.2 giao/nhận · 2.3 report có vấn đề.
 *  Tách thành ba màn thì người dùng phải nhớ mình đang cầm lead nào.
 *
 *  Kịch bản 2 · DAS Vina, đóng băng 17/08 · 09:10. Vào được màn này là vai có
 *  nhánh Sales — cửa ở `app/guard.tsx`, không kiểm lại ở đây.
 *
 *  Sổ lead lấy qua `useQuery`, không đọc thẳng fixture: đó là đường nối để sau
 *  này cắm backend mà màn không phải sửa (xem `data/leads.ts`).
 *
 *  State: bộ lọc và dòng đang chọn là chuyện RIÊNG của màn nên giữ ở đây bằng
 *  `useState`. Chỉ thứ toàn app — ai đang đăng nhập — mới nằm trong zustand. */

const TIER_TONE: Record<LeadTier, 'draft' | 'running' | 'success'> = {
  'dau-moi': 'draft',
  mql: 'running',
  sql: 'success',
}

/** Ba Sale nhận được lead. TP Kinh doanh không nằm trong danh sách này: vai đó
 *  phân công chứ không giữ khách (docs/kien-truc-san-pham.md). */
const SALES = [...new Set(LEAD_CATEGORIES.map((c) => c.sale))]

export function LeadsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const { data: book = [], isPending } = useQuery(leadBookQuery)

  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<LeadTier | 'all'>('all')
  const [category, setCategory] = useState<LeadCategory | 'all'>('all')
  const [overSlaOnly, setOverSlaOnly] = useState(false)
  const [pickedCode, setPickedCode] = useState<string | null>(ANCHOR_CODE)
  const [reported, setReported] = useState<ExitReason | null>(null)
  const [draftReason, setDraftReason] = useState<ExitReason | null>(null)

  const visible = useMemo(
    () =>
      book.filter((l) => {
        if (tier !== 'all' && l.tier !== tier) return false
        if (category !== 'all' && l.category !== category) return false
        if (overSlaOnly && !isOverSla(l)) return false
        if (query.trim() === '') return true
        const needle = query.trim().toLowerCase()
        return l.company.toLowerCase().includes(needle) || l.code.toLowerCase().includes(needle)
      }),
    [book, tier, category, overSlaOnly, query],
  )

  const picked = visible.find((l) => l.code === pickedCode) ?? null
  const gate = picked ? canPromoteToSql(picked) : null

  const clearFilters = () => {
    setQuery('')
    setTier('all')
    setCategory('all')
    setOverSlaOnly(false)
  }

  return (
    <AppShell
      /* BottomNav chỉ có bốn mục Core; màn nhánh không nằm trong đó nên giữ
         'home' làm mục sáng — người dùng dưới lg vẫn về được Core. */
      activeNav="home"
      approvalsCount={chrome.approvalsCount}
      sidebar={chrome.sidebar}
      topbar={chrome.topbar}
    >
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">Sổ lead</h2>
          <p className="text-muted-foreground mt-1 text-[12px]">
            DAS Vina · phễu 01/05 → 17/08 · chốt lúc <span className="font-mono">09:10</span> ngày{' '}
            <span className="font-mono">17/08</span> · {visible.length}/{book.length} dòng đang hiện
          </p>
        </div>

        {/* Phễu — sáu bậc đã chốt. MQL và SQL là bậc 2 và bậc 3, không phải nhãn mới. */}
        <GlassCard className="p-5 lg:p-6">
          <div className="grid grid-cols-3 gap-4 lg:grid-cols-6">
            {FUNNEL.map((step) => {
              const asTier = LEAD_TIERS.find((t) => t.funnelKey === step.key)
              return (
                <div key={step.key} className="flex flex-col gap-1">
                  <span className="tnum font-num text-[22px] font-semibold">{step.count}</span>
                  <span className="text-[11.5px] leading-[1.4]">{step.label}</span>
                  {asTier && asTier.key !== 'dau-moi' ? (
                    <Badge tone={TIER_TONE[asTier.key]} className="mt-1 self-start">
                      {asTier.label}
                    </Badge>
                  ) : null}
                </div>
              )
            })}
          </div>
        </GlassCard>

        {/* 2.1 · thanh lọc */}
        <div className="flex flex-col gap-3">
          <SearchField
            size="page"
            placeholder="Tìm theo tên công ty hoặc mã lead…"
            value={query}
            onChange={setQuery}
            meta={`${visible.length} kết quả`}
          />
          <div className="flex flex-wrap gap-2">
            <FilterGroup
              label="Bậc"
              options={[
                { key: 'all', label: 'Tất cả' },
                ...LEAD_TIERS.map((t) => ({ key: t.key, label: t.label })),
              ]}
              active={tier}
              onPick={(k) => setTier(k as LeadTier | 'all')}
            />
            <FilterGroup
              label="Ngành"
              options={[
                { key: 'all', label: 'Tất cả' },
                ...LEAD_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
              ]}
              active={category}
              onPick={(k) => setCategory(k as LeadCategory | 'all')}
            />
            <Button
              size="sm"
              variant={overSlaOnly ? 'default' : 'ghost'}
              onClick={() => setOverSlaOnly((v) => !v)}
            >
              Quá SLA
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr] lg:gap-6">
          {/* 2.1 · danh sách. Bảng LUÔN nằm trên glass-b — luật 8. */}
          <GlassCard variant="b" className="p-5 lg:p-6">
            {isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : visible.length > 0 ? (
              <DataTable
                columns={[
                  { header: 'Mã', width: '0.9fr' },
                  { header: 'Công ty', width: '1.5fr' },
                  { header: 'Tỉnh', width: '0.9fr' },
                  { header: 'Ngành', width: '0.8fr' },
                  { header: 'Bậc', width: '0.8fr' },
                  { header: 'Bộ 10 câu', width: '0.9fr', align: 'right' },
                  { header: 'Người giữ', width: '1.2fr' },
                ]}
                rows={visible.map((l) => ({
                  id: l.code,
                  state: l.code === pickedCode ? 'selected' : 'default',
                  cells: [
                    <Chip key="c" onOpen={() => setPickedCode(l.code)}>
                      {l.code}
                    </Chip>,
                    l.company,
                    l.province,
                    LEAD_CATEGORIES.find((c) => c.key === l.category)?.label ?? l.category,
                    <Badge key="t" tone={TIER_TONE[l.tier]}>
                      {LEAD_TIERS.find((t) => t.key === l.tier)?.label ?? l.tier}
                    </Badge>,
                    <span key="a" className="tnum font-num">
                      {l.answered}/{INIT_DATA_SLOTS}
                    </span>,
                    l.owner ?? <span className="text-muted-foreground">chưa ai nhận</span>,
                  ],
                }))}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                message={
                  book.length === 0
                    ? 'Sổ lead chưa có dòng nào. Dữ liệu mock sẽ đổ vào sau khi chốt.'
                    : 'Không có lead nào khớp bộ lọc đang chọn.'
                }
                action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
                className="py-12"
              />
            )}
          </GlassCard>

          {/* 2.2 + 2.3 · thao tác trên lead đang chọn */}
          <div className="flex flex-col gap-4 lg:gap-6">
            <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
              <h3 className="text-[13px] font-semibold">Lead đang chọn</h3>

              {picked ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-semibold">{picked.company}</span>
                    <span className="text-muted-foreground text-[11.5px]">
                      {picked.province} ·{' '}
                      {LEAD_CATEGORIES.find((c) => c.key === picked.category)?.label} ·{' '}
                      {picked.owner ?? 'chưa ai nhận'}
                    </span>
                  </div>

                  <Progress
                    value={picked.answered / INIT_DATA_SLOTS}
                    label={`Bộ 10 câu · ${picked.answered}/${INIT_DATA_SLOTS} ô`}
                    tone={picked.answered < INIT_DATA_SLOTS ? 'warning' : 'primary'}
                  />

                  {/* Cổng MQL → SQL. Câu từ chối do engine trả, màn không tự chế. */}
                  <div className="flex flex-col gap-2">
                    <Button
                      size="md"
                      disabled={!gate?.ok}
                      onClick={() => {
                        /* Nối E3 khi có backend: đề nghị chuyển bậc chờ TP Kinh doanh gật. */
                      }}
                    >
                      <Icon icon={UserPlus} size={16} />
                      Nhận vào pipeline
                    </Button>
                    {gate && !gate.ok ? (
                      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                        {gate.reason}. Chưa đủ 10/10 thì agent 2 không chạy.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-muted-foreground text-[11.5px]">Giao cho</span>
                    <div className="flex flex-wrap gap-2">
                      {SALES.map((name) => (
                        <Button
                          key={name}
                          size="sm"
                          variant={name === picked.owner ? 'default' : 'ghost'}
                          onClick={() => {
                            /* Nối E3: đổi tay thì COMMISSION_SPLIT chia lại phần chốt. */
                          }}
                        >
                          <Icon icon={ArrowLeftRight} size={16} />
                          {name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Luật 10 · ContextRail dựng thẳng từ E1, màn không tự viết chip. */}
                  <ContextRail
                    objects={dasVina.graph.story(picked.code).map((o) => ({
                      code: o.code,
                      source: o.code !== picked.code,
                      onOpen: () => setPickedCode(o.code),
                    }))}
                  />
                </>
              ) : (
                <EmptyState
                  icon={Inbox}
                  message="Chọn một dòng trong sổ để giao, nhận hoặc báo lead có vấn đề."
                  action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
                  className="py-8"
                />
              )}
            </GlassCard>

            {/* 2.3 · report. ĐÚNG sáu lý do, không có ô "khác". */}
            <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
              <div className="flex items-center gap-2">
                <Icon icon={TriangleAlert} size={16} className="text-warning" />
                <h3 className="text-[13px] font-semibold">Lead có vấn đề</h3>
              </div>

              {reported ? (
                <div className="flex flex-col gap-3">
                  <Badge tone="warning" className="self-start">
                    Đã báo · {reported}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => setReported(null)}>
                    Rút lại
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {EXIT_REASONS.map((r) => (
                      <Button
                        key={r.label}
                        size="sm"
                        variant={draftReason === r.label ? 'default' : 'ghost'}
                        disabled={!picked}
                        onClick={() => setDraftReason(r.label)}
                      >
                        {r.label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    size="md"
                    variant="destructive"
                    disabled={!picked || !draftReason}
                    onClick={() => {
                      setReported(draftReason)
                      setDraftReason(null)
                      /* Nối E2 khi có backend: mọi lần đưa lead ra khỏi luồng phải ghi vết. */
                    }}
                  >
                    Đưa ra khỏi luồng
                  </Button>
                  <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                    Sáu lý do là toàn bộ danh sách, không có ô &quot;khác&quot;. Lý do thứ bảy phải
                    sửa fixture và test, không gõ vào màn.
                  </p>
                </>
              )}
            </GlassCard>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

/** Một nhóm nút lọc. Chưa tách ra @pv/ui vì mới dùng ở đúng một chỗ — tách khi
 *  màn thứ hai cần đến, và lúc đó phải lên trang kit cùng lúc. */
function FilterGroup({
  label,
  options,
  active,
  onPick,
}: {
  label: string
  options: { key: string; label: string }[]
  active: string
  onPick: (key: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {options.map((o) => (
        <Button
          key={o.key}
          size="sm"
          variant={active === o.key ? 'default' : 'ghost'}
          onClick={() => onPick(o.key)}
          className={cn(active === o.key && 'shadow-primary')}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

export default LeadsPage
