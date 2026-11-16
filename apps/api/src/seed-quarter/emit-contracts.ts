import { emitTemperatures } from './emit-contracts-care'
import { emitExtras } from './emit-contracts-extras'
import { emitContractRows, factsOf, indexPlan } from './emit-contracts-rows'
import { emitInstallments, emitTermination } from './emit-contracts-schedule'
import { beatsOf } from './emit-deals-view'
import type { AfterWrite, Ctx } from './types'

/** Every journey with a `signed` beat gets its contract, schedule, reasons,
 *  termination, paperwork and temperature readings. The contract code was minted by
 *  the deals emitter (the won quotation points at it), so it is read, never
 *  minted. The workstream's WON / LOST mark is the leads emitter's `syncClosed`,
 *  which folds over the contracts written here. */

export function emitContracts(ctx: Ctx): void {
  const index = indexPlan(ctx)
  for (const top of ctx.stories) {
    for (const story of [top, top.growth]) {
      if (!story || beatsOf(story, 'signed').length === 0) continue
      const f = factsOf(ctx, story)
      emitContractRows(ctx, f, index)
      const slots = emitInstallments(ctx, f)
      emitTermination(ctx, f, slots)
      emitExtras(ctx, f, slots, story.knobs.contract?.documentsMissing ?? false)
      emitTemperatures(ctx, f)
    }
  }
}

export const afterWrite: AfterWrite | undefined = undefined
