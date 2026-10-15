import { useState } from 'react'
import { Badge, GlassCard, SegmentedControl } from '@pv/ui'
import {
  LOSS_REASON_DO_NOT_CONTACT_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  StageKey,
  type ConfigEntry,
} from '@pv/contracts'
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
  const products = [...(catalog?.PRODUCT ?? [])].sort(byOrd)
  const reasons = catalog?.LOSS_REASON ?? []
  const requotes = [...(catalog?.QUOTE_REVISION_REASON ?? [])].sort(byOrd)
  return (
    <>
      <Section at="freshness">
        <ActivityFreshnessConfig />
      </Section>

      <Section at="care-reasons" summary={<EntryCount rows={reasons} noun="lý do" />}>
        <CareReasons rows={reasons} usage={catalog?.usage.LOSS_REASON ?? {}} />
        <AddLossReason />
      </Section>

      {/* 5.4d — why a waiting quotation round closed when a new round was
          recorded. Not `LOSS_REASON`: the deal carries on. */}
      <Section at="quote-reasons" summary={<EntryCount rows={requotes} noun="lý do" />}>
        {requotes.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">Chưa có lý do nào.</p>
        ) : (
          <GlassCard variant="b" className="p-4">
            <ul className="flex flex-col gap-2">
              {requotes.map((r) => (
                <li key={r.id}>
                  <EntryRow
                    entry={r}
                    list="QUOTE_REVISION_REASON"
                    usage={catalog?.usage.QUOTE_REVISION_REASON[r.id] ?? 0}
                    unit="lần báo giá"
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        <AddEntry list="QUOTE_REVISION_REASON" placeholder="Thêm lý do báo giá lại" />
      </Section>

      {/* 5.4c — the only catalog with a real foreign key pointing at it. It
          starts EMPTY on purpose: the migration seeds no undeclared products. */}
      <Section at="products" summary={<EntryCount rows={products} noun="mục" />}>
        {products.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">Chưa có sản phẩm/dịch vụ nào.</p>
        ) : (
          <GlassCard variant="b" className="p-4">
            <ul className="flex flex-col gap-2">
              {products.map((p) => (
                <li key={p.id}>
                  <EntryRow
                    entry={p}
                    list="PRODUCT"
                    usage={catalog?.usage.PRODUCT[p.id] ?? 0}
                    unit="cơ hội"
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
        summary={<EntryCount rows={catalog?.CONTRACT_KIND ?? []} noun="loại" />}
      >
        <FlatListConfig list="CONTRACT_KIND" unit="lần dùng" addLabel="Thêm loại hợp đồng" />
      </Section>
    </>
  )
}

/** A reason with no stage applies in every column (ADR 0064 §6), so it has its
 *  own tab instead of repeating under each column. */
const ANY_STAGE = 'any'

/** 5.4b — why a DEAL leaves the board; a different catalog from 5.4 (why a LEAD
 *  stops). Read one column at a time: the list is long and a seller only ever
 *  meets the reasons of the column the deal stands in. */
function CareReasons({ rows, usage }: { rows: ConfigEntry[]; usage: Record<string, number> }) {
  const [tab, setTab] = useState<string>('new' satisfies StageKey)
  const inTab = (r: ConfigEntry, key: string) => (r.stage ?? ANY_STAGE) === key
  const tabs = [
    ...StageKey.options.map((key) => ({
      value: key as string,
      label: OPPORTUNITY_STAGE_LABEL[key],
    })),
    { value: ANY_STAGE, label: 'Mọi giai đoạn' },
  ].map((t) => ({ ...t, count: rows.filter((r) => inTab(r, t.value)).length }))

  return (
    <>
      <SegmentedControl
        label="Giai đoạn của cơ hội"
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
                  unit="cơ hội"
                  extra={
                    r.doNotContact ? (
                      <Badge tone="warning">{LOSS_REASON_DO_NOT_CONTACT_LABEL}</Badge>
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
