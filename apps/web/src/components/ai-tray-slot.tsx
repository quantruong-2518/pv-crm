import { LanguagePicker } from '@/components/auth-card'
import { useSlot } from './ai-tray-slot-store'

/** What the header holds left of Approvals and the bell: the AI tray button's
 *  slot, then the language switch. */
export function HeaderUtility() {
  return (
    <>
      <span ref={useSlot.getState().set} className="contents" />
      <LanguagePicker />
    </>
  )
}
