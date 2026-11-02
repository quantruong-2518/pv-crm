import type { ReactNode } from 'react'
import { Pencil } from '@pv/ui'
import { Button, GlassCard, Icon, SectionTitle } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'

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
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 p-5" aria-label={title}>
      <SectionTitle
        size="detail"
        className="items-center"
        actions={
          (aside || onEdit) && (
            <>
              {aside}
              {onEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:h-12"
                  aria-label={t(
                    message(
                      `Sửa ${title.toLowerCase()}`,
                      `Edit ${title.toLowerCase()}`,
                      `${title} 수정`,
                    ),
                  )}
                  onClick={onEdit}
                >
                  <Icon icon={Pencil} size={16} />
                  {t(message('Sửa', 'Edit', '수정'))}
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
