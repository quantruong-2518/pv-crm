import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { X } from '../icons'
import { Icon } from './icon'
import { cn } from '../lib/cn'

/** A-23 · TagInput — type text, press Enter, and each entry becomes a pill with
 *  its own remove button.
 *
 *  Controlled: `value` in, the new array out via `onChange`. Enter and comma
 *  commit an entry; Backspace on an empty box takes the last one back; leaving
 *  the box commits too, so clicking another field never loses typed text.
 *  Duplicates (case-insensitive) are ignored, and `max` shuts the box once it
 *  is full. `suggestions` are searched as the reader types, so one thing keeps
 *  one spelling. `onLeave` fires once focus has left the WHOLE box, with the
 *  final array — the moment to save, rather than once per pill. */
export type TagInputProps = {
  value: string[]
  onChange: (next: string[]) => void
  /** Names the field for a screen reader — the visible label sits outside. */
  label: string
  placeholder?: string
  /** Ceiling per tag, passed to the native `maxLength` of the box. */
  maxLength?: number
  /** Ceiling on the number of tags; the box shuts once it is reached. */
  max?: number
  /** Known entries offered while typing; ones already picked are left out. */
  suggestions?: string[]
  onLeave?: (value: string[]) => void
  invalid?: boolean
  disabled?: boolean
  /** Names the remove button of one tag. */
  removeLabel?: (tag: string) => string
}

/** A short list reads at a glance; a long one is a second search. */
const SHOWN = 6

export function TagInput({
  value,
  onChange,
  label,
  placeholder,
  maxLength,
  max,
  suggestions = [],
  onLeave,
  invalid,
  disabled,
  removeLabel = (tag) => `Xoá ${tag}`,
}: TagInputProps) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(-1)
  const box = useRef<HTMLInputElement>(null)
  const listId = useId()
  const full = max !== undefined && value.length >= max
  const has = (tag: string) => value.some((v) => v.toLowerCase() === tag.toLowerCase())

  const needle = draft.trim().toLowerCase()
  const offered =
    open && needle && !full
      ? suggestions.filter((s) => s.toLowerCase().includes(needle) && !has(s)).slice(0, SHOWN)
      : []

  /** Returns the array as it stands after the entry, for `onLeave`. */
  const add = (raw: string): string[] => {
    const typed = raw.trim()
    /* A known entry keeps its known spelling, however it was typed. */
    const tag = suggestions.find((s) => s.toLowerCase() === typed.toLowerCase()) ?? typed
    setDraft('')
    setAt(-1)
    if (!tag || full || has(tag)) return value
    const next = [...value, tag]
    onChange(next)
    return next
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    /* Enter that confirms an IME syllable (Telex) must not commit the tag. */
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (offered.length === 0) return
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setAt((at + step + offered.length) % offered.length)
    } else if (e.key === 'Enter' || e.key === ',') {
      /* Enter must not submit the form around the box. */
      e.preventDefault()
      add(offered[at] ?? draft)
    } else if (e.key === 'Escape') {
      /* With the list open, Escape shuts the list only, not a drawer around it. */
      if (offered.length > 0) e.stopPropagation()
      setOpen(false)
      setAt(-1)
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    /* Focus moving between the box and a remove button has not left. */
    if (e.currentTarget.contains(e.relatedTarget)) return
    setOpen(false)
    onLeave?.(add(draft))
  }

  return (
    <div
      onBlur={onBlur}
      onClick={(e) => e.target === e.currentTarget && box.current?.focus()}
      className={cn(
        'motion-std bg-input pointer-coarse:min-h-12 relative flex min-h-11 w-full flex-wrap items-center gap-2 rounded-md px-3 py-2',
        'focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
        invalid && 'shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="bg-surface-ink/9 text-foreground inline-flex items-center gap-1 rounded-sm py-1 pl-2 pr-1 text-[12px]"
        >
          {tag}
          <button
            type="button"
            disabled={disabled}
            aria-label={removeLabel(tag)}
            /* Safari does not focus a clicked button: without this the box blurs
               to nothing and `onLeave` fires before the removal. */
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(value.filter((v) => v !== tag))
              /* The pressed button unmounts; keep focus in the field. */
              box.current?.focus()
            }}
            className="text-muted-foreground hover:text-foreground motion-std focus-visible:outline-ring pointer-coarse:h-8 pointer-coarse:w-8 relative flex h-5 w-5 items-center justify-center rounded-sm after:absolute after:-inset-2 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Icon icon={X} size={14} />
          </button>
        </span>
      ))}
      <input
        ref={box}
        role="combobox"
        aria-expanded={offered.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={offered[at] ? `${listId}-${at}` : undefined}
        value={draft}
        disabled={disabled}
        readOnly={full}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={full ? `Tối đa ${max} mục` : value.length === 0 ? placeholder : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          setOpen(true)
          setAt(-1)
        }}
        onKeyDown={onKeyDown}
        className="text-foreground placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent text-[12.5px] outline-none"
      />
      {offered.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          /* A press on the list's own padding must not blur the box and save. */
          onMouseDown={(e) => e.preventDefault()}
          className="glass-overlay absolute inset-x-0 top-full z-30 m-0 mt-1 flex list-none flex-col rounded-lg p-1"
        >
          {offered.map((tag, i) => (
            <li
              key={tag}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === at}
              /* mousedown, not click: a click lands after blur has shut the list. */
              onMouseDown={(e) => {
                e.preventDefault()
                add(tag)
              }}
              onMouseMove={() => setAt(i)}
              className={cn(
                'text-foreground pointer-coarse:min-h-12 flex min-h-10 cursor-pointer items-center rounded-md px-2 text-[12.5px]',
                i === at && 'bg-surface-ink/10',
              )}
            >
              {tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
