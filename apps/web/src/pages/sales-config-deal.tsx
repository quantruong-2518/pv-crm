import { useState } from 'react'
import { message, useI18n } from '@/app/i18n'
import { Badge, GlassCard, SegmentedControl } from '@pv/ui'
import { LOSS_REASON_DO_NOT_CONTACT_LABEL, StageKey, type ConfigEntry } from '@pv/contracts'
import { AddLossReason, AddProduct } from './sales-config-add-rows'
import { AddEntry, EntryRow, FlatListConfig } from './sales-config-comm'
import { ActivityFreshnessConfig } from './sales-config-freshness'
import { byOrd } from './sales-config-model'
import { EntryCount, Section, type AreaProps } from './sales-config-section'

/** The deal flow — how stale a deal's last activity may get, why a deal is
 *  stopped, why a quotation is redone, what the department sells and what
 *  kinds of contract it signs. Switched-off rows stay listed in every catalog:
 *  off is the only delete this system has. */
export function DealArea({ catalog }: AreaProps) {
  const { t } = useI18n()
  const products = [...(catalog?.PRODUCT ?? [])].sort(byOrd)
  const reasons = catalog?.LOSS_REASON ?? []
  const requotes = [...(catalog?.QUOTE_REVISION_REASON ?? [])].sort(byOrd)
  return (
    <>
      <Section at="freshness">
        <ActivityFreshnessConfig />
      </Section>

      <Section
        at="care-reasons"
        summary={<EntryCount rows={reasons} noun="lý do" />} // i18n-ignore
      >
        <CareReasons rows={reasons} usage={catalog?.usage.LOSS_REASON ?? {}} />
        <AddLossReason />
      </Section>

      {/* 5.4d — why a waiting quotation round closed when a new round was
          recorded. Not `LOSS_REASON`: the deal carries on. */}
      <Section
        at="quote-reasons"
        summary={<EntryCount rows={requotes} noun="lý do" />} // i18n-ignore
      >
        {requotes.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">
            {t(message('Chưa có lý do nào.', 'No reasons yet.', '사유가 없습니다.'))}
          </p>
        ) : (
          <GlassCard variant="b" className="p-4">
            <ul className="flex flex-col gap-2">
              {requotes.map((r) => (
                <li key={r.id}>
                  <EntryRow
                    entry={r}
                    list="QUOTE_REVISION_REASON"
                    usage={catalog?.usage.QUOTE_REVISION_REASON[r.id] ?? 0}
                    unit={message('lần báo giá', 'quotes', '견적')}
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        <AddEntry
          list="QUOTE_REVISION_REASON"
          placeholder={t(
            message('Thêm lý do báo giá lại', 'Add a quote revision reason', '견적 수정 사유 추가'),
          )}
        />
      </Section>

      {/* 5.4c — the only catalog with a real foreign key pointing at it. It
          starts EMPTY on purpose: the migration seeds no undeclared products. */}
      <Section
        at="products"
        summary={<EntryCount rows={products} noun="mục" />} // i18n-ignore
      >
        {products.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">
            {t(
              message(
                'Chưa có sản phẩm/dịch vụ nào.',
                'No products or services yet.',
                '제품 또는 서비스가 없습니다.',
              ),
            )}
          </p>
        ) : (
          <GlassCard variant="b" className="p-4">
            <ul className="flex flex-col gap-2">
              {products.map((p) => (
                <li key={p.id}>
                  <EntryRow
                    entry={p}
                    list="PRODUCT"
                    usage={catalog?.usage.PRODUCT[p.id] ?? 0}
                    unit={message('cơ hội', 'opportunities', '기회')}
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        <AddProduct />
      </Section>

      {/* 5.15 — what a quotation or contract is for; a quotation and a
          contract store the code, so a switched-off kind keeps its name. */}
      <Section
        at="contract-kinds"
        summary={<EntryCount rows={catalog?.CONTRACT_KIND ?? []} noun="loại" />} // i18n-ignore
      >
        <FlatListConfig
          list="CONTRACT_KIND"
          unit={message('lần dùng', 'uses', '사용')}
          addLabel={message('Thêm loại hợp đồng', 'Add a contract type', '계약 유형 추가')}
        />
      </Section>
    </>
  )
}

/** A reason with no stage applies in every column (ADR 0064 §6), so it has its
 *  own tab instead of repeating under each column. */
const ANY_STAGE = 'any'
const stageCopy = (key: StageKey) => {
  switch (key) {
    case 'new':
      return message('Khởi tạo', 'New', '신규')
    case 'assigned':
      return message('Đang phân công', 'Assigned', '배정 중')
    case 'engaged':
      return message('Chăm sóc', 'In progress', '관리 중')
    case 'quotation':
      return message('Báo giá', 'Quotation', '견적')
  }
}

/** 5.4b — why a DEAL leaves the board; a different catalog from 5.4 (why a LEAD
 *  stops). Read one column at a time: the list is long and a seller only ever
 *  meets the reasons of the column the deal stands in. */
function CareReasons({ rows, usage }: { rows: ConfigEntry[]; usage: Record<string, number> }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<string>('new' satisfies StageKey)
  const inTab = (r: ConfigEntry, key: string) => (r.stage ?? ANY_STAGE) === key
  const tabs = [
    ...StageKey.options.map((key) => ({
      value: key as string,
      label: t(stageCopy(key)),
    })),
    { value: ANY_STAGE, label: t(message('Mọi giai đoạn', 'All stages', '모든 단계')) },
  ].map((t) => ({ ...t, count: rows.filter((r) => inTab(r, t.value)).length }))

  return (
    <>
      <SegmentedControl
        label={t(message('Giai đoạn của cơ hội', 'Opportunity stage', '기회 단계'))}
        hideLabel
        tone="quiet"
        options={tabs}
        value={tab}
        onChange={setTab}
      />
      <GlassCard variant="b" className="p-4">
        <ul className="flex flex-col gap-2">
          {rows
            .filter((r) => inTab(r, tab))
            .sort(byOrd)
            .map((r) => (
              <li key={r.id}>
                <EntryRow
                  entry={r}
                  list="LOSS_REASON"
                  usage={usage[r.id] ?? 0}
                  unit={message('cơ hội', 'opportunities', '기회')}
                  extra={
                    r.doNotContact ? (
                      <Badge tone="warning">
                        {t(
                          message(LOSS_REASON_DO_NOT_CONTACT_LABEL, 'Do not contact', '연락 금지'),
                        )}
                      </Badge>
                    ) : null
                  }
                />
              </li>
            ))}
        </ul>
      </GlassCard>
    </>
  )
}
