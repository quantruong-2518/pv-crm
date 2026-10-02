import type { ReactNode } from 'react'
import { Pencil } from '@pv/ui'
import { Button, GlassCard, Icon, SectionTitle } from '@pv/ui'

/** The frame every block of the run rail shares: a `.glass-b` card (law 8), a
 *  title, an optional slot beside it and, when the reader may change the
 *  block, one edit button. */
export function RunBlock({
  title,
  onEdit,
  aside,
  children,
}: {
  title: string
  onEdit?: (() => void) | undefined
  /** Beside the title, before the edit button — a count, a state. */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 p-5" aria-label={title}>
      <SectionTitle
        size="detail"
        actions={
          (aside || onEdit) && (
            <>
              {aside}
              {onEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  aria-label={`Sửa ${title.toLowerCase()}`}
                  onClick={onEdit}
                >
                  <Icon icon={Pencil} size={16} />
                  Sửa
                </Button>
              )}
            </>
          )
        }
      >
        {title}
      </SectionTitle>
      {children}
    </GlassCard>
  )
}
