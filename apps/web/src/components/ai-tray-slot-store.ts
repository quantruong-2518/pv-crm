import { create } from 'zustand'

/** The header's slot for the AI tray button. The tray host lives outside the
 *  header, so it finds the slot through this store instead of the DOM. */
export const useSlot = create<{ el: HTMLElement | null; set: (el: HTMLElement | null) => void }>()(
  (set) => ({ el: null, set: (el) => set({ el }) }),
)

export const useAiTraySlot = () => useSlot((s) => s.el)
