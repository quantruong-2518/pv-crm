import { useSlot } from './ai-tray-slot-store'

/** What the header holds left of Approvals and the bell: the AI tray button's
 *  slot. The language switch lives in the avatar menu. */
export function HeaderUtility() {
  return <span ref={useSlot.getState().set} className="contents" />
}
