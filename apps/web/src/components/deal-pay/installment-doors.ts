import type { InstallmentRow } from '@pv/contracts'

/** The two verdicts a contract hands out: `recordPayment` is the contract's
 *  `canCollect` (its PIC, the head of sales, the director), `editSchedule` its
 *  closer's side. A reminder is open to either, as the server's door is. */
type Can = { editSchedule: boolean; recordPayment: boolean }

/** Which write doors of one instalment this reader gets. Undoing a payment is
 *  offered to whoever recorded it; the server still judges every press. */
export function installmentDoorsOf(installment: InstallmentRow, can: Can, me: string | undefined) {
  const paid = installment.paidAt !== undefined
  return {
    pay: can.recordPayment && !paid,
    undo: can.recordPayment && paid && installment.paidBy?.id === me,
    remind: (can.recordPayment || can.editSchedule) && !paid,
    /** Adding a condition and marking one done share this door. */
    condition: can.editSchedule && !paid,
  }
}
