import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from '../icons'
import { cn } from '../lib/cn'
import { Icon } from './icon'

/** A-15 · Select — một ô lọc, một dòng.
 *
 *  Trigger gói nhãn và giá trị hiện tại vào một ô để người dùng đọc được bộ
 *  lọc mà không phải quét một hàng nút. Menu dùng listbox riêng thay vì popup
 *  của `<select>` gốc: popup hệ điều hành không nhận token của app nên có thể
 *  thành một mảng trắng, hàng thấp và trạng thái chọn rất khó thấy.
 *
 *  Listbox giữ đủ bàn phím (mũi tên, Home/End, Enter, Esc và tìm theo chữ cái),
 *  mỗi lựa chọn cao 48px để đọc/chạm thoải mái. Nó được portal ra viewport để
 *  không bị cắt bởi bảng, drawer hoặc panel có overflow.
 *
 *  Ô đang lọc khác mặc định thì SÁNG LÊN. Nếu không, người dùng nhìn một bảng
 *  6 dòng sẽ không hiểu những dòng còn lại đã đi đâu. */
export type SelectOption = { value: string; label: string }

export type SelectProps = {
  /** Nhãn đứng trước ô — "Trạng thái", "Ngành". Luôn có, kể cả khi ẩn. */
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** Giá trị "không lọc gì". Mặc định là option đầu. */
  neutralValue?: string
  /** Ẩn nhãn khỏi mắt, giữ cho trình đọc màn hình. */
  hideLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

type MenuPosition = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
  placement: 'above' | 'below'
}

const MENU_GAP = 8
const VIEWPORT_INSET = 8
const MIN_MENU_WIDTH = 240
const MAX_MENU_HEIGHT = 320
const OPTION_HEIGHT = 48
const MENU_PADDING = 16

export function Select({
  label,
  value,
  options,
  onChange,
  neutralValue,
  hideLabel = false,
  size = 'md',
  className,
}: SelectProps) {
  const uid = useId()
  const labelId = `${uid}-label`
  const valueId = `${uid}-value`
  const listboxId = `${uid}-listbox`
  const neutral = neutralValue ?? options[0]?.value ?? ''
  const active = value !== neutral
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedLabel = options[selectedIndex]?.label ?? value

  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(Math.max(selectedIndex, 0))
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const typeahead = useRef('')
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openMenu = (index = selectedIndex >= 0 ? selectedIndex : 0) => {
    if (options.length === 0) return
    setHighlighted(index)
    setOpen(true)
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const width = Math.min(
        Math.max(rect.width, MIN_MENU_WIDTH),
        viewportWidth - VIEWPORT_INSET * 2,
      )
      const left = Math.min(
        Math.max(rect.left, VIEWPORT_INSET),
        viewportWidth - width - VIEWPORT_INSET,
      )
      const wantedHeight = Math.min(options.length * OPTION_HEIGHT + MENU_PADDING, MAX_MENU_HEIGHT)
      const roomBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_INSET
      const roomAbove = rect.top - MENU_GAP - VIEWPORT_INSET
      const placement = roomBelow >= wantedHeight || roomBelow >= roomAbove ? 'below' : 'above'
      const available = placement === 'below' ? roomBelow : roomAbove
      const maxHeight = Math.max(OPTION_HEIGHT + MENU_PADDING, Math.min(MAX_MENU_HEIGHT, available))

      setPosition({
        left,
        width,
        maxHeight,
        placement,
        ...(placement === 'below'
          ? { top: rect.bottom + MENU_GAP }
          : { bottom: viewportHeight - rect.top + MENU_GAP }),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  useEffect(
    () => () => {
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current)
    },
    [],
  )

  const stepHighlight = (step: 1 | -1) => {
    setHighlighted((current) => {
      if (options.length === 0) return 0
      return (current + step + options.length) % options.length
    })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (options.length === 0) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openMenu()
      } else {
        stepHighlight(event.key === 'ArrowDown' ? 1 : -1)
      }
      return
    }

    if (open && event.key === 'Home') {
      event.preventDefault()
      setHighlighted(0)
      return
    }

    if (open && event.key === 'End') {
      event.preventDefault()
      setHighlighted(options.length - 1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(highlighted)
      else openMenu()
      return
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      return
    }

    if (event.key === 'Tab') {
      setOpen(false)
      return
    }

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key !== ' '
    ) {
      typeahead.current += event.key.toLocaleLowerCase()
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current)
      typeaheadTimer.current = setTimeout(() => {
        typeahead.current = ''
      }, 600)

      const start = open ? highlighted + 1 : Math.max(selectedIndex + 1, 0)
      const match = Array.from(
        { length: options.length },
        (_, offset) => (start + offset) % options.length,
      ).find((index) => options[index]?.label.toLocaleLowerCase().startsWith(typeahead.current))

      if (match !== undefined) {
        event.preventDefault()
        setHighlighted(match)
        setOpen(true)
      }
    }
  }

  const menuStyle: CSSProperties | undefined = position
    ? {
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        top: position.top,
        bottom: position.bottom,
      }
    : undefined

  return (
    <div ref={rootRef} className={cn('relative inline-flex min-w-0', className)}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${uid}-option-${highlighted}` : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        disabled={options.length === 0}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          'motion-std relative inline-flex min-w-0 flex-1 items-center gap-2 rounded-md pl-3 pr-8 text-left outline-none',
          size === 'sm' ? 'h-8 text-[11.5px]' : 'h-10 text-[12.5px]',
          active ? 'bg-primary/24 text-accent-foreground' : 'bg-white/9 text-foreground',
          'focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
          open && 'shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_40%,transparent)]',
          options.length === 0 && 'text-muted-foreground cursor-not-allowed opacity-60',
        )}
      >
        <span
          id={labelId}
          className={cn(
            'shrink-0 whitespace-nowrap text-[11px]',
            hideLabel && 'sr-only',
            active ? 'text-accent-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <span id={valueId} className={cn('min-w-0 flex-1 truncate', active && 'font-semibold')}>
          {selectedLabel}
        </span>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn(
            'motion-std pointer-events-none absolute right-2',
            active ? 'text-accent-foreground' : 'text-muted-foreground',
            open && 'rotate-180',
          )}
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={labelId}
            style={menuStyle}
            className={cn(
              'glass-overlay shadow-panel fixed z-[100] flex flex-col gap-1 overflow-y-auto rounded-lg p-2',
              position.placement === 'above' ? 'origin-bottom' : 'origin-top',
            )}
          >
            {options.map((option, index) => {
              const selected = option.value === value
              const focused = index === highlighted

              return (
                <button
                  key={option.value}
                  ref={(node) => {
                    optionRefs.current[index] = node
                  }}
                  id={`${uid}-option-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  onPointerMove={() => setHighlighted(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  className={cn(
                    'motion-std flex h-12 w-full shrink-0 items-center gap-3 rounded-md px-3 text-left text-[12.5px] outline-none',
                    selected
                      ? 'bg-primary/24 text-on-tint-primary font-semibold shadow-[inset_0_1px_0_var(--sheen-ai)]'
                      : focused
                        ? 'text-foreground bg-white/10'
                        : 'text-glass-foreground hover:bg-white/8 hover:text-foreground',
                  )}
                >
                  <span className="min-w-0 flex-1 leading-[1.4]">{option.label}</span>
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-sm',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-primary'
                        : 'text-muted-foreground bg-white/5',
                    )}
                  >
                    {selected ? <Icon icon={Check} size={16} strokeWidth={1.9} /> : null}
                  </span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
