import { useId, type ReactNode } from 'react'
import { GlassCard, cn, sectionTitleVariants } from '@pv/ui'

/** The one frame for the body cards of a profile (ADR 0078 §1, rule 2): one
 *  padding and one title row, so only the content differs between screens.
 *
 *  `work` carries the 16px title of a working card. `reference` (description,
 *  forms) is set lighter: a 14px muted title and no lift — the inset sheen
 *  stays, so it still reads as a card in Aurora. `.glass-a`: a body card is
 *  neither a table nor a long list (law 8). The todo card is heavier on
 *  purpose and keeps its own frame. */
export function RecordCard({
  title,
  tone = 'work',
  hint,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  tone?: 'work' | 'reference'
  /** One sentence under the title. */
  hint?: ReactNode
  /** Beside the title — an edit button, a save state. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const titleId = useId()
  const reference = tone === 'reference'

  return (
    <GlassCard
      role={title ? 'region' : undefined}
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-4 p-4 sm:p-5',
        reference && 'shadow-[inset_0_1px_0_var(--sheen-a)]',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4">
          {title && (
            <div className="flex min-w-0 flex-col gap-1">
              <h2
                id={titleId}
                className={cn(
                  sectionTitleVariants({ size: reference ? 'md' : 'detail' }),
                  reference && 'text-muted-foreground',
                )}
              >
                {title}
              </h2>
              {hint && (
                <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">{hint}</p>
              )}
            </div>
          )}
          {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </GlassCard>
  )
}
