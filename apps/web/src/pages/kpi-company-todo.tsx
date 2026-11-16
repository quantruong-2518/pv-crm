import { Button, GlassCard, Icon, ArrowRight } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { TILE } from './home-tiles'

/** The "to do" strip on the company tab (ADR 0159 §5): only what the caller can act on
 *  today, each with its button. Drawn only when there is at least one item,
 *  so the heading never sits over nothing. */

export type CompanyTodoItem = {
  id: string
  text: string
  action: string
  onAct: () => void
}

export function CompanyTodo({ items }: { items: CompanyTodoItem[] }) {
  const { t } = useI18n()
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[15px] font-semibold">
        {t(message('Cần làm', 'To do', '할 일'))}
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <GlassCard className={`${TILE} sm:flex-row sm:items-center sm:justify-between`}>
              <p className="m-0 text-[13px] leading-5">{item.text}</p>
              <Button
                variant="secondary"
                className="pointer-coarse:h-12 shrink-0 self-start sm:self-center"
                onClick={item.onAct}
              >
                {item.action}
                <Icon icon={ArrowRight} size={16} />
              </Button>
            </GlassCard>
          </li>
        ))}
      </ul>
    </section>
  )
}
