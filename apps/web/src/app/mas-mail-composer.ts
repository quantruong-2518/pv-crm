import { create } from 'zustand'
import type { MasMailModalProps } from '@/components/mas-mail-modal'

/** Context a screen hands to the one app-wide MAS composer. */
export type MasMailRequest = Omit<MasMailModalProps, 'open' | 'onClose' | 'onQueued'> & {
  /** Screen-local cleanup after the server accepted the run (for example,
   * clearing selected book rows). The host always closes the modal itself. */
  onQueued?: () => void
}

type ActiveRequest = {
  id: number
  value: MasMailRequest
}

type MasMailComposerState = {
  sequence: number
  active?: ActiveRequest
  open: (request: MasMailRequest) => void
  close: () => void
}

/** Store is exported only for the global host. Screens use `openMasMail`, so
 * they do not subscribe to modal lifecycle or rerender with its draft. */
export const useMasMailComposer = create<MasMailComposerState>()((set) => ({
  sequence: 0,
  open: (request) =>
    set((state) => ({
      sequence: state.sequence + 1,
      active: { id: state.sequence + 1, value: request },
    })),
  close: () => set({ active: undefined }),
}))

/** Open the shared composer from any screen or event handler. */
export function openMasMail(request: MasMailRequest): void {
  useMasMailComposer.getState().open(request)
}

/** Public mainly for app/test lifecycle cleanup; the modal normally closes it. */
export function closeMasMail(): void {
  useMasMailComposer.getState().close()
}
