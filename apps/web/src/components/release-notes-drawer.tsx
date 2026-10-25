import { Badge, Drawer } from '@pv/ui'
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
  const { open, fresh } = useReleaseNotes()

  return (
    <Drawer open={open} onClose={closeReleaseNotes} title="Có gì mới" subtitle="PV One">
      <div className="flex flex-col gap-6">
        {RELEASE_NOTES.map((note, index) => (
          <Release key={note.id} note={note} isNew={index < fresh} />
        ))}
      </div>
    </Drawer>
  )
}

function Release({ note, isNew }: { note: ReleaseNote; isNew: boolean }) {
  const modules = [...new Set(note.items.map((item) => item.module))]

  return (
    <section className="flex flex-col gap-3" aria-label={`Bản ngày ${note.date}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-foreground m-0 text-[13px] font-semibold">{note.date}</h3>
        {isNew && <Badge tone="success">Mới</Badge>}
      </div>
      {modules.map((module) => (
        <div key={module} className="flex flex-col gap-2">
          <p className="text-muted-foreground m-0 text-[11.5px] font-semibold">{module}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {note.items
              .filter((item) => item.module === module)
              .map((item) => (
                <Line key={`${item.feature}-${item.text}`} item={item} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Line({ item }: { item: ReleaseNoteItem }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 text-[13px] leading-[1.55]">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-foreground font-medium">{item.feature}</span>
        <Badge tone={item.kind === 'fix' ? 'warning' : 'draft'}>
          {RELEASE_NOTE_KIND_LABEL[item.kind]}
        </Badge>
      </span>
      <span className="text-glass-foreground">{item.text}</span>
    </li>
  )
}
