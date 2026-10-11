import type { ConstraintBook } from '@api/platform/http/db-error'

/** `sales.campaign` constraints → what the user reads. A LABEL table, like its
 *  siblings: the rule itself lives in `campaign.schema.ts`.
 *
 *  One entry, the fence 0100 added: `owner_id` now points at `platform.actor`.
 *  The create and patch doors pass the body's id straight through, so this
 *  foreign key IS the check — the same call `contract_owner_id_actor_id_fk` made. */
export const CAMPAIGN_CONSTRAINTS: ConstraintBook = {
  campaign_owner_id_actor_id_fk: {
    kind: 'invalid',
    fields: ['ownerId'],
    message: 'Người phụ trách không có trong sổ nhân sự — chọn lại người phụ trách.',
  },
}
