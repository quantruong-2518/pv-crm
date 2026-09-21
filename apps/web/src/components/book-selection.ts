import { useEffect, useRef, useState, type PointerEvent } from 'react'

const NO_SELECTED_CODES: ReadonlySet<string> = new Set()

/** Pointer gesture shared by both book selection and the campaign audience
 * picker. State ownership stays with the caller; this hook owns only the
 * mouse/pen paint protocol and the click that follows pointer-up. */
export function useSelectionGesture(
  selectedCodes: ReadonlySet<string>,
  setOne: (code: string, on: boolean) => void,
) {
  const dragIntent = useRef<'select' | 'deselect' | null>(null)
  const suppressClick = useRef<string | null>(null)

  const beginDrag = (code: string, event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0) return
    event.preventDefault()
    const intent = selectedCodes.has(code) ? 'deselect' : 'select'
    dragIntent.current = intent
    suppressClick.current = code
    setOne(code, intent === 'select')
  }

  const paintSelection = (code: string, event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || event.buttons !== 1 || dragIntent.current === null) return
    setOne(code, dragIntent.current === 'select')
  }

  const changeSelection = (code: string, on: boolean) => {
    if (suppressClick.current !== code) setOne(code, on)
  }

  const toggleSelection = (code: string) => {
    if (suppressClick.current !== code) setOne(code, !selectedCodes.has(code))
  }

  const resetGesture = () => {
    dragIntent.current = null
    suppressClick.current = null
  }

  useEffect(() => {
    const finish = () => {
      dragIntent.current = null
      /* The press's own click fires immediately after pointerup. Keep the guard
         through that click, then release it for the next deliberate action. */
      window.setTimeout(() => {
        suppressClick.current = null
      }, 0)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [])

  return { beginDrag, paintSelection, changeSelection, toggleSelection, resetGesture }
}

/** Selection behaviour shared by books that offer bulk actions.
 *
 * Codes deliberately outlive the current page. Mouse/pen users can paint a
 * selection across rows; touch keeps native scrolling and toggles by click. */
export function useBookSelection<Row extends { code: string }>(pageRows: readonly Row[]) {
  const [selectedCodes, setSelectedCodes] = useState<ReadonlySet<string>>(NO_SELECTED_CODES)

  const pageSelected = pageRows.filter((row) => selectedCodes.has(row.code)).length
  const allPageSelected = pageRows.length > 0 && pageSelected === pageRows.length

  const setCodeSelected = (code: string, on: boolean) => {
    setSelectedCodes((current) => {
      const next = new Set(current)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })
  }

  const { beginDrag, paintSelection, changeSelection, resetGesture } = useSelectionGesture(
    selectedCodes,
    setCodeSelected,
  )

  const selectPage = (on: boolean) => {
    setSelectedCodes((current) => {
      const next = new Set(current)
      for (const row of pageRows) {
        if (on) next.add(row.code)
        else next.delete(row.code)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedCodes(NO_SELECTED_CODES)
    resetGesture()
  }

  return {
    selectedCodes,
    pageSelected,
    allPageSelected,
    changeSelection,
    beginDrag,
    paintSelection,
    selectPage,
    clearSelection,
  }
}
