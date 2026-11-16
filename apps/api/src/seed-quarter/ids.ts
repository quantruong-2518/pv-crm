/** Codes minted so far, keyed so a later emitter can find what an earlier one
 *  wrote. Filled in run order (see `emitters.ts`); an emitter reads only what
 *  an EARLIER emitter set. Story keys are `Story.key` ('J0001'), and a growth
 *  journey is keyed `<parent key>-G`. */

export type Ids = {
  /** AC code by company index. */
  account: string[]
  /** CT code by company index, then contact index. */
  contact: string[][]
  /** REF code by partner index. */
  partner: string[]
  /** CP code by campaign key in `params.CAMPAIGNS`; minted before any emitter runs. */
  campaign: Map<string, string>
  lead: Map<string, string>
  workstream: Map<string, string>
  opportunity: Map<string, string>
  contract: Map<string, string>
  /** `comms.identity.id` of each cast actor's member mailbox (planted or found). */
  identity: Map<string, string>
}

export const emptyIds = (): Ids => ({
  account: [],
  contact: [],
  partner: [],
  campaign: new Map(),
  lead: new Map(),
  workstream: new Map(),
  opportunity: new Map(),
  contract: new Map(),
  identity: new Map(),
})
