import { useQuery } from '@tanstack/react-query'
import { MY_WORK_SECTION_LABEL } from '@pv/contracts'
import { Button, Icon, Skeleton, TriangleAlert } from '@pv/ui'
import { useI18n } from '@/app/i18n'
import { refPath } from '@/data/assistant'
import { BRIEF_COPY as B, myWorkQuery } from '@/data/assistant-brief'
import { ASSISTANT_COPY as C, openLabel } from '@/data/assistant-copy'
import { CodeChip } from './assistant-bits'

/** Chips per section; the rest is a count, not a longer list. */
const SHOWN = 3

/** The "today's work" card at the top of the assistant panel (ADR 0154). The Drawer
 *  drops its body on close, so every opening mounts the card and asks again.
 *  Only sections with work, or that could not be read, are drawn. */
export function AssistantBriefCard({ openPath }: { openPath: (path: string) => void }) {
  const { t, lang, number } = useI18n()
  const work = useQuery(myWorkQuery)
  const sections = work.data?.sections.filter((s) => s.count > 0 || s.skipped) ?? []

  return (
    <section className="bg-muted mb-5 flex min-w-0 flex-col gap-3 rounded-lg p-4">
      <h2 className="m-0 text-[14px] font-semibold">{t(B.title)}</h2>
      {work.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : work.isError ? (
        <div
          role="alert"
          className="text-destructive-foreground flex items-center gap-3 text-[12.5px]"
        >
          <Icon icon={TriangleAlert} size={16} className="shrink-0" />
          <span className="flex-1">{t(C.loadFailed)}</span>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            onClick={() => void work.refetch()}
          >
            {t(C.retry)}
          </Button>
        </div>
      ) : sections.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[13px]">{t(B.empty)}</p>
      ) : (
        sections.map((s) => (
          <div key={s.section} className="flex min-w-0 flex-col gap-2">
            <p className="m-0 flex items-baseline gap-2 text-[13px] font-semibold">
              <span className="min-w-0 flex-1">{MY_WORK_SECTION_LABEL[s.section]}</span>
              {!s.skipped && (
                <span className="tnum shrink-0">
                  {number(s.count)}
                  {s.more && '+'}
                </span>
              )}
            </p>
            {s.skipped ? (
              <p className="text-muted-foreground m-0 text-[12.5px]">{t(B.skipped)}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {s.refs.slice(0, SHOWN).map((ref) => (
                  <li
                    key={`${ref.kind}:${ref.code}`}
                    className="pointer-coarse:min-h-12 flex min-w-0 items-center gap-2"
                  >
                    <CodeChip
                      code={ref.code}
                      label={openLabel(ref.code, lang)}
                      onOpen={() => openPath(refPath(ref))}
                      className="shrink-0"
                    />
                    <span className="min-w-0 truncate text-[13px]">
                      {ref.label.split(' · ')[0]}
                    </span>
                  </li>
                ))}
                {s.refs.length > 0 && !s.more && s.count - Math.min(s.refs.length, SHOWN) > 0 && (
                  <li className="text-muted-foreground text-[12.5px]">
                    {t(B.rest(number(s.count - Math.min(s.refs.length, SHOWN))))}
                  </li>
                )}
              </ul>
            )}
          </div>
        ))
      )}
    </section>
  )
}
