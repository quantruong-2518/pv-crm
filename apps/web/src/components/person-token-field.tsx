import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, X } from '@pv/ui'
import { Avatar, Icon, Input, cn } from '@pv/ui'

/** A list of people already chosen, plus one box to add the next one.
 *
 *  Three doors now ask the same question — who is hosting, who is attending,
 *  who receives this letter — and each one used to answer it differently: a
 *  select that emptied itself, a stack of rows with a delete button, a grid of
 *  toggle cards. One shape for one question, so a person who has learnt to add
 *  a host already knows how to add a recipient.
 *
 *  NOT in `@pv/ui` yet on the rule in `apps/web/CLAUDE.md`: it earns the move
 *  once a fourth screen wants it. */
export type TokenPerson = {
  id: string
  name: string
  /** Second line in the suggestion list and under the name — title, company,
   *  address. Whatever tells two people with the same name apart. */
  note?: string
  /** A word riding inside the token itself — which one chairs. */
  tag?: string
}

export type PersonTokenFieldProps = {
  /** Accessible name of the search box. The visible heading sits above it. */
  label: string
  tokens: readonly TokenPerson[]
  /** Everyone still addable. The caller drops the already-picked ones, because
   *  only the caller knows what "already picked" means on its own list. */
  suggestions: readonly TokenPerson[]
  onPick: (id: string) => void
  onRemove: (id: string) => void
  /** Enter on text that matches nobody. Returning a sentence REFUSES the text
   *  and prints that sentence under the box; returning null accepts it. Absent
   *  means typing alone adds nobody, which is right for the staff directory. */
  onFreeText?: (text: string) => string | null
  placeholder: string
  /** Absent when the caller's own field frame already prints one — the deal
   *  form puts the hint under the box together with the server's refusal. */
  hint?: ReactNode
  /** Sentence shown in place of the list when there is nothing to suggest. */
  emptyNote?: string
  /** Where the chosen people sit.
   *
   *  `stacked` (the default) keeps them on their own row above the search box,
   *  which is what a list of eight recipients needs. `inline` puts them INSIDE
   *  the control with a chevron at its right edge, so a box holding one person
   *  reads as an ordinary picker rather than as a search with a result stuck
   *  above it — the deal form asks for one sale owner nine times out of ten.
   *
   *  A VARIANT RATHER THAN A SECOND COMPONENT on purpose: the keyboard rules,
   *  the portalled list and the backspace-removes-the-last-token behaviour are
   *  the part that costs, and two copies of them drift apart on the first fix. */
  variant?: 'stacked' | 'inline'
}

/** How many suggestions are drawn at once. A list longer than this is a list
 *  nobody reads to the end; the search box is the way through it. */
const SHOWN = 8

/** Geometry of the floating list, copied in spirit from `Select` in `@pv/ui`:
 *  gap under the box, inset from the viewport edge, ceiling on the height. */
const MENU_GAP = 8
const VIEWPORT_INSET = 8
const MAX_MENU_HEIGHT = 320

type MenuBox = { left: number; width: number; maxHeight: number; top?: number; bottom?: number }

export function PersonTokenField({
  label,
  tokens,
  suggestions,
  onPick,
  onRemove,
  onFreeText,
  placeholder,
  hint,
  emptyNote,
  variant = 'stacked',
}: PersonTokenFieldProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [refusal, setRefusal] = useState('')
  const field = useRef<HTMLInputElement>(null)
  /* The list lines up with the CONTROL, which in the inline variant is wider
     than the text box inside it. */
  const shell = useRef<HTMLDivElement>(null)
  const box = useMenuBox(open, shell)

  const needle = query.trim().toLocaleLowerCase('vi')
  const matches = useMemo(
    () =>
      suggestions
        .filter((person) =>
          needle === ''
            ? true
            : `${person.name} ${person.note ?? ''}`.toLocaleLowerCase('vi').includes(needle),
        )
        .slice(0, SHOWN),
    [suggestions, needle],
  )

  const pick = (id: string) => {
    onPick(id)
    setQuery('')
    setRefusal('')
    field.current?.focus()
  }

  const takeTyped = () => {
    if (!onFreeText || !query.trim()) return
    const problem = onFreeText(query.trim())
    setRefusal(problem ?? '')
    if (!problem) setQuery('')
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    /* Backspace on an empty box drops the last token — the hint under this
       field promises exactly that, and a hint for a behaviour that does not
       exist is worse than no hint. */
    if (event.key === 'Backspace' && query === '') {
      const last = tokens[tokens.length - 1]
      if (last) onRemove(last.id)
      return
    }
    if (event.key !== 'Enter') return
    /* Enter inside a form would submit it; here it means "take this one". */
    event.preventDefault()
    const first = matches[0]
    if (first) pick(first.id)
    else takeTyped()
  }

  /* One set of handlers for both variants — a second copy of the keyboard
     rules is where the two shapes drift. An option's own `mousedown` calls
     `preventDefault`, so `onBlur` never runs for a real pick. */
  const typing = {
    'aria-label': label,
    value: query,
    placeholder,
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    onKeyDown: onKey,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value)
      setRefusal('')
      setOpen(true)
    },
  }

  const chosen = tokens.map((person) => (
    <Token key={person.id} person={person} onRemove={() => onRemove(person.id)} />
  ))

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {variant === 'inline' ? (
        <div
          ref={shell}
          className="bg-input flex min-h-10 w-full min-w-0 flex-wrap items-center gap-2 rounded-md px-2 py-1"
        >
          {tokens.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">{chosen}</ul>
          )}
          <input
            ref={field}
            {...typing}
            className="placeholder:text-muted-foreground text-foreground min-w-[7rem] flex-1 bg-transparent text-[12.5px] outline-none"
          />
          <Icon
            icon={ChevronDown}
            size={16}
            className="text-muted-foreground pointer-events-none shrink-0"
          />
        </div>
      ) : (
        <>
          {tokens.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{chosen}</ul>
          )}
          <div ref={shell} className="relative min-w-0">
            <Icon
              icon={Search}
              size={16}
              className="text-muted-foreground pointer-events-none absolute left-3 top-3"
            />
            <Input ref={field} {...typing} className="pl-8" />
          </div>
        </>
      )}

      {open && box && (
        <SuggestionMenu
          box={box}
          matches={matches}
          searching={needle !== ''}
          freeText={Boolean(onFreeText)}
          emptyNote={emptyNote}
          onPick={pick}
        />
      )}

      {refusal ? (
        <p className="text-warning m-0 text-[11px] leading-[1.5]">{refusal}</p>
      ) : (
        hint && <p className="text-muted-foreground m-0 text-[11px] leading-[1.5]">{hint}</p>
      )}
    </div>
  )
}

function Token({ person, onRemove }: { person: TokenPerson; onRemove: () => void }) {
  return (
    <li className="bg-surface-ink/9 flex min-w-0 max-w-full items-center gap-2 rounded-md p-1">
      <Avatar size="sm" name={person.name} />
      <span className="truncate text-[12px] font-medium">{person.name}</span>
      {person.tag && (
        /* `--on-tint-primary`, not `--accent-foreground`: the ground is already
           tinted, and azure text on it measures 4.49:1 in stone mode — under
           the 4.5 floor of law 13. */
        <span className="text-on-tint-primary bg-primary/24 shrink-0 rounded-sm px-2 py-1 text-[10.5px] font-medium">
          {person.tag}
        </span>
      )}
      <button
        type="button"
        aria-label={`Bỏ ${person.name}`}
        onClick={onRemove}
        className="motion-std hover:bg-surface-ink/16 pointer-coarse:size-12 flex size-8 shrink-0 items-center justify-center rounded-md"
      >
        <Icon icon={X} size={14} />
      </button>
    </li>
  )
}

function SuggestionMenu({
  box,
  matches,
  searching,
  freeText,
  emptyNote,
  onPick,
}: {
  box: MenuBox
  matches: readonly TokenPerson[]
  searching: boolean
  freeText: boolean
  emptyNote?: string
  onPick: (id: string) => void
}) {
  return createPortal(
    <div
      style={{
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
        ...(box.top === undefined ? { bottom: box.bottom } : { top: box.top }),
      }}
      className="glass-overlay shadow-panel fixed z-[100] overflow-y-auto rounded-lg p-2"
    >
      {matches.length === 0 ? (
        <p className="text-glass-foreground m-0 px-2 py-2 text-[11.5px] leading-[1.5]">
          {!searching
            ? (emptyNote ?? 'Không còn ai để thêm.')
            : freeText
              ? 'Không tìm thấy ai — nhấn Enter để thêm tên vừa gõ.'
              : 'Không tìm thấy ai.'}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {matches.map((person) => (
            <li key={person.id} className="min-w-0">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(person.id)}
                className={cn(
                  'motion-std hover:bg-surface-ink/8 flex min-h-12 w-full min-w-0 flex-col',
                  'items-start justify-center gap-1 rounded-md px-3 py-2 text-left',
                )}
              >
                <span className="text-foreground truncate text-[12.5px] font-medium">
                  {person.name}
                </span>
                {person.note && (
                  <span className="text-glass-foreground truncate text-[11px]">{person.note}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  )
}

/** Where the floating list goes, measured against the viewport.
 *
 *  THE LIST IS PORTALLED, and that is a fix rather than a taste: both doors open
 *  it inside an `overflow-y-auto` panel, which clips an absolutely positioned
 *  child at the panel's bottom edge. `Select` in `@pv/ui` went to the viewport
 *  for exactly this reason and says so in its own docblock. */
function useMenuBox(open: boolean, field: RefObject<HTMLElement | null>): MenuBox | null {
  const [box, setBox] = useState<MenuBox | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setBox(null)
      return
    }
    const place = () => {
      const rect = field.current?.getBoundingClientRect()
      if (!rect) return
      const roomBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_INSET
      const roomAbove = rect.top - MENU_GAP - VIEWPORT_INSET
      const below = roomBelow >= roomAbove
      setBox({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(MAX_MENU_HEIGHT, Math.max(below ? roomBelow : roomAbove, 0)),
        ...(below
          ? { top: rect.bottom + MENU_GAP }
          : { bottom: window.innerHeight - rect.top + MENU_GAP }),
      })
    }
    place()
    window.addEventListener('resize', place)
    /* Capture phase: the panel this sits in scrolls, and a scroll inside it
       does not bubble to `window`. */
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, field])

  return box
}
