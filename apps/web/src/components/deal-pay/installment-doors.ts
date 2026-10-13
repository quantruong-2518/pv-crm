import type { InstallmentRow, OpportunityMoneyContract } from '@pv/contracts'

/** Which write doors of one instalment this reader gets, off the contract's own
 *  verdict (`can`). Undoing a payment is offered to whoever recorded it; the
 *  server still judges every press. */
export function installmentDoorsOf(
  installment: InstallmentRow,
  can: OpportunityMoneyContract['can'],
  me: string | undefined,
) {
  const paid = installment.paidAt !== undefined
  return {
    pay: can.recordPayment && !paid,
    undo: can.recordPayment && paid && installment.paidBy?.id === me,
    remind: (can.recordPayment || can.editSchedule) && !paid,
    /** Adding a condition and marking one done share this door. */
    condition: can.editSchedule && !paid,
  }
}
