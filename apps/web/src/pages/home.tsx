import {
  Bell,
  Calculator,
  ChartColumn,
  Factory,
  FolderOpen,
  House,
  ListChecks,
  Package,
  Search,
  ShieldCheck,
  SquareCheckBig,
  Users,
  UsersRound,
} from 'lucide-react'
import { AiAction, AppShell, BriefCard, Icon, OrderLifecycleCard, StatCard } from '@pv/ui'

/** Màn 01 · Home / Morning brief (AGENTS.md §7).
 *  Nguồn: project/handoff/screens/One 01 - Home (Desktop) EN.dc.html — bản EN
 *  là bản CHỐT duy nhất cho màn này, nội dung giữ nguyên tiếng Anh theo file.
 *  Kịch bản 1 · Sao Đỏ, đóng băng 10 Aug 07:58 (CLAUDE.md). */
export function HomePage() {
  return (
    <AppShell
      activeNav="home"
      approvalsCount={7}
      sidebar={{
        product: 'PV One',
        org: 'Thắng Lợi Engineering',
        groups: [
          {
            items: [
              { icon: House, label: 'Home', active: true },
              { icon: SquareCheckBig, label: 'Approvals', count: 7 },
              { icon: Bell, label: 'Notifications', count: 12 },
              { icon: Search, label: 'Global search' },
            ],
          },
          {
            kicker: 'Branches owned',
            items: [
              { icon: Users, label: 'Sales' },
              { icon: Package, label: 'Supply' },
              { icon: Factory, label: 'Factory' },
              { icon: Calculator, label: 'Finance' },
            ],
          },
          {
            kicker: 'One Plus',
            items: [
              { icon: UsersRound, label: 'People' },
              { icon: FolderOpen, label: 'Documents & processes' },
              { icon: ListChecks, label: 'Work' },
              { icon: ChartColumn, label: 'Reports' },
            ],
          },
        ],
        footer: (
          <div className="flex items-center gap-2.5 rounded-md bg-white/5 px-3 py-[11px]">
            <Icon icon={ShieldCheck} size={16} className="text-muted-foreground" />
            <div className="text-muted-foreground text-[11px] leading-[1.5]">
              Admin
              <br />
              &amp; audit log
            </div>
          </div>
        ),
      }}
      topbar={{
        user: { name: 'Nguyễn Văn Thắng' },
        unread: true,
        assistantLabel: 'Assistant',
        search: { placeholder: 'Search customers, orders, work orders, documents…' },
      }}
    >
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">
            Good morning, Mr. Thắng
          </h2>
          <p className="text-muted-foreground mt-1.5 text-[12px]">
            Monday 10 Aug · Sales, Supply, Factory, Finance combined · updated{' '}
            <span className="font-mono">07:58</span> · 4 things need your eye
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:auto-rows-[150px] lg:grid-cols-4 lg:gap-4">
          <OrderLifecycleCard
            className="col-span-2 lg:row-span-2"
            state="bad"
            title="Sao Đỏ order — SO-0891"
            amount="₫1.84bn"
            description="2 days late · Ø40 steel short · customer deadline 22 Aug"
            progress={{ label: 'Work order WO-1180', value: 0.68 }}
            milestones={['ok', 'ok', 'ok', 'ok', 'ok', 'current', 'next', 'next', 'next', 'next']}
            milestoneLabels={['8 Jul lead', 'today 10 Aug', '25 Aug invoice']}
            objects={[
              { code: 'HĐ-2607' },
              { code: 'Supply · SO-0891', source: true },
              { code: 'Factory · WO-1180', source: true },
              { code: 'Supply · PO-0455', source: true },
            ]}
          />

          <StatCard
            value="₫4.2bn"
            label="August revenue"
            delta={{ direction: 'up', text: '12% over plan', tone: 'success' }}
            sparkline={{
              points: [22, 18, 20, 13, 15, 8, 9, 3],
              source: 'Aug · Sales',
              tone: 'success',
            }}
          />
          <StatCard
            value="86%"
            label="On-time delivery"
            delta={{ direction: 'flat', text: 'flat · target 90%', tone: 'warning' }}
            sparkline={{
              points: [12, 11, 13, 12, 12, 13, 11, 12],
              source: '90d · Supply',
              tone: 'warning',
            }}
          />
          <StatCard
            value="₫890M"
            label="Overdue receivables"
            delta={{ direction: 'up', text: '2 invoices · 12 days overdue', tone: 'danger' }}
            sparkline={{
              points: [20, 19, 16, 17, 11, 10, 6, 4],
              source: '30d · Finance',
              tone: 'danger',
            }}
          />
          <StatCard
            value="91.4%"
            label="Equipment effectiveness · plant X1"
            delta={{ direction: 'down', text: 'CNC-03 down 37 min', tone: 'warning' }}
            sparkline={{
              points: [6, 5, 8, 7, 6, 14, 19, 11],
              source: '24h · Factory',
              tone: 'warning',
            }}
          />

          <BriefCard
            className="col-span-2"
            state="warning"
            title="3 deals at risk"
            badge={{ label: 'Sales', tone: 'warning' }}
            description="Sao Đỏ silent 6 days on the BG-0512 extension · Trường Thịnh wants 8% off · Hòa Phong stopped replying."
            objects={[{ code: 'Sales · BG-0512', source: true }, { code: 'LD-0334' }]}
          />
          <BriefCard
            className="col-span-2"
            state="bad"
            title="CNC-03 down for the 3rd time this week"
            badge={{ label: 'Factory', tone: 'danger' }}
            description="Fault E-214, 37 minutes total this morning. Maintenance order BT-0310 went to Mr. Hải, no response yet."
            objects={[{ code: 'Factory · CNC-03', source: true }, { code: 'BT-0310' }]}
          />
        </div>

        <AiAction
          suggestion="AI assistant suggests: approve PO-0455 today and move 30% of WO-1180 onto CNC-05 → delivery holds at 22 Aug with a day to spare."
          basis="K1-A2 stock · plant X1 capacity · contract SO-0891 · CNC-03 maintenance schedule."
          basisLabel="Basis"
          confirmLabel="Do it"
          onConfirm={() => {}}
          inspectLabel="See the basis"
          onInspect={() => {}}
        />
      </div>
    </AppShell>
  )
}

export default HomePage
