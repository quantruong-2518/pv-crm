import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ContractCode,
  ContractInstallmentsBody,
  ContractScheduleResponse,
  InstallmentConditionBody,
  InstallmentPaidBody,
  InstallmentRecordBody,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { CONTRACT_BOOK_KEY, contractDetailQuery } from '@/data/contracts'
import { vnToday } from '@/data/opportunities'
import { WORKSTREAM_BOOK_KEY } from '@/data/workstreams'

/** The six doors on a signed contract's schedule — contract and routes in
 *  `packages/contracts/src/sales/contract-schedule.ts`. Every door answers the
 *  whole contract re-read, so the detail is replaced, never patched here. */

const pathOf = (code: ContractCode) => `/sales/contracts/${encodeURIComponent(code)}/installments`

const need = (permission: 'contract.edit' | 'contract.record-payment'): ApiNeed => ({
  branch: 'Sales',
  permission,
  scoped: true,
})

/** `contract.edit` or `contract.record-payment` — one `permission` cannot say
 *  both, so the browser asks for the branch and the server judges. */
const RECORD_NEED: ApiNeed = { branch: 'Sales', scoped: true }

/** The day a user picked as the `Moment` a door takes. Today is the real
 *  instant; another day is noon in Vietnam, which reads as that same day in
 *  every zone the server may slice it in. */
export const momentOfDay = (day: string): string =>
  day === vnToday() ? new Date().toISOString() : `${day}T12:00:00+07:00`

/** Free-text ceilings of the instalment bodies, as `contract.ts` sets them. */
export const PAY_TEXT_MAX = { label: 200, what: 300, detail: 300, condition: 500, who: 120 }

/** Money moved, so the contract book, its summary, the workstream tree and the
 *  deal's `money` block all read a different number now. */
function useScheduleSettled(code: ContractCode) {
  const client = useQueryClient()

  return (row: ContractScheduleResponse) => {
    client.setQueryData(contractDetailQuery(code).queryKey, row)
    void client.invalidateQueries({ queryKey: CONTRACT_BOOK_KEY })
    void client.invalidateQueries({ queryKey: ['sales', 'ops'] })
    void client.invalidateQueries({ queryKey: WORKSTREAM_BOOK_KEY })
  }
}

type Write<Vars> = (vars: Vars) => Promise<ContractScheduleResponse>

function useScheduleDoor<Vars>(code: ContractCode, call: Write<Vars>) {
  const settled = useScheduleSettled(code)

  return useMutation<ContractScheduleResponse, ApiError, Vars>({
    mutationFn: call,
    onSuccess: settled,
  })
}

/** Replaces every unpaid instalment; paid ones stay. */
export const useReplaceSchedule = (code: ContractCode) =>
  useScheduleDoor<ContractInstallmentsBody>(code, (body) =>
    api.write<ContractScheduleResponse>(pathOf(code), {
      method: 'PUT',
      body,
      need: need('contract.edit'),
    }),
  )

export const useRecordPaid = (code: ContractCode) =>
  useScheduleDoor<{ no: number; body: InstallmentPaidBody }>(code, ({ no, body }) =>
    api.write<ContractScheduleResponse>(`${pathOf(code)}/${no}/paid`, {
      method: 'POST',
      body,
      need: need('contract.record-payment'),
    }),
  )

/** The server lets only whoever recorded the payment take it back. */
export const useUndoPaid = (code: ContractCode) =>
  useScheduleDoor<{ no: number }>(code, ({ no }) =>
    api.write<ContractScheduleResponse>(`${pathOf(code)}/${no}/paid`, {
      method: 'DELETE',
      need: need('contract.record-payment'),
    }),
  )

export const useAddReminder = (code: ContractCode) =>
  useScheduleDoor<{ no: number; body: InstallmentRecordBody }>(code, ({ no, body }) =>
    api.write<ContractScheduleResponse>(`${pathOf(code)}/${no}/records`, {
      method: 'POST',
      body,
      need: RECORD_NEED,
    }),
  )

export const useAddCondition = (code: ContractCode) =>
  useScheduleDoor<{ no: number; body: InstallmentConditionBody }>(code, ({ no, body }) =>
    api.write<ContractScheduleResponse>(`${pathOf(code)}/${no}/conditions`, {
      method: 'POST',
      body,
      need: need('contract.edit'),
    }),
  )

export const useDoneCondition = (code: ContractCode) =>
  useScheduleDoor<{ no: number; id: string }>(code, ({ no, id }) =>
    api.write<ContractScheduleResponse>(
      `${pathOf(code)}/${no}/conditions/${encodeURIComponent(id)}/done`,
      { method: 'POST', need: need('contract.edit') },
    ),
  )
