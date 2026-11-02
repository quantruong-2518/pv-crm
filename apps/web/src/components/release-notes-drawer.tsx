import { Badge, Drawer } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { closeReleaseNotes, useReleaseNotes } from '@/app/release-notes'
import {
  RELEASE_NOTES,
  RELEASE_NOTE_KIND_LABEL,
  type ReleaseNote,
  type ReleaseNoteItem,
} from '@/data/release-notes'

/** The what's-new drawer, mounted once beside the router (`main.tsx`) so the
 *  menu row can open it from any screen. Each release lists its changes under
 *  the module they belong to, one line per function. */
export function ReleaseNotesDrawer() {
  const { t } = useI18n()
  const { open, fresh } = useReleaseNotes()

  return (
    <Drawer
      open={open}
      onClose={closeReleaseNotes}
      title={t(message('Có gì mới', 'What’s new', '새로운 기능'))}
      subtitle="PV One"
    >
      <div className="flex flex-col gap-6">
        {RELEASE_NOTES.map((note, index) => (
          <Release key={note.id} note={note} isNew={index < fresh} />
        ))}
      </div>
    </Drawer>
  )
}

function Release({ note, isNew }: { note: ReleaseNote; isNew: boolean }) {
  const { t, date } = useI18n()
  const modules = [...new Map(note.items.map((item) => [item.module.vi, item.module])).values()]
  const when = date(note.id)

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t(message(`Bản ngày ${when}`, `Release of ${when}`, `${when} 릴리스`))}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-foreground m-0 text-[13px] font-semibold">{when}</h3>
        {isNew && <Badge tone="success">{t(message('Mới', 'New', '신규'))}</Badge>}
      </div>
      {modules.map((module) => (
        <div key={module.vi} className="flex flex-col gap-2">
          <p className="text-muted-foreground m-0 text-[11.5px] font-semibold">{t(module)}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {note.items
              .filter((item) => item.module.vi === module.vi)
              .map((item) => (
                <Line key={`${item.feature.vi}-${item.text.vi}`} item={item} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Line({ item }: { item: ReleaseNoteItem }) {
  const { t } = useI18n()
  return (
    <li className="flex min-w-0 flex-col gap-1 text-[13px] leading-[1.55]">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-foreground font-medium">{t(item.feature)}</span>
        <Badge tone={item.kind === 'fix' ? 'warning' : 'draft'}>
          {t(RELEASE_NOTE_KIND_LABEL[item.kind])}
        </Badge>
      </span>
      <span className="text-glass-foreground">{t(item.text)}</span>
    </li>
  )
}
