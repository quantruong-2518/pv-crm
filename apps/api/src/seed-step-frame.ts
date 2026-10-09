import type { StepTemplateValues } from '@api/branches/sales/config/step-frame.schema'

/** The first next-step templates of the journey frame (ADR 0080) — the same
 *  eleven rows, ids included, that migration `0091_step_frame.sql` plants.
 *
 *  Kept here as well because the dev seed and a staff reset empty the table
 *  and no migration re-runs. The fixed ids are what let a seeded next step
 *  point at a template on any machine. Read by `seed.ts` and
 *  `seed-reference.ts`; names are content, hence Vietnamese. */
const ROWS = [
  ['15feea98-1dab-4596-af1b-4af4d03ac1ea', 'assigned', 'Gọi khách chốt nhu cầu', 'SK-01', 1],
  ['c47170cc-5e67-4d60-bda3-164e10aace2a', 'assigned', 'Hẹn gửi sample', 'SK-04', 2],
  ['603f7276-8fda-449f-9ff1-4a48c029eefd', 'assigned', 'Hẹn demo', 'SK-02', 3],
  ['e36b7214-57b1-4586-bb09-80b787c80cd1', 'assigned', 'Hẹn khảo sát nhà máy', 'SK-02', 4],
  ['ca88899b-7c6c-42b6-a5c3-7b6abc5be597', 'engaged', 'Theo dõi phản hồi sample', 'SK-06', 1],
  ['f656faf1-3740-4aa8-9ee6-f209013ec7c5', 'engaged', 'Hẹn POC', 'SK-02', 2],
  ['5012cf25-6fdb-4132-b6cd-2fa75835b3af', 'engaged', 'Hẹn demo', 'SK-02', 3],
  ['525d3428-dab7-471d-8655-ca81baa96d75', 'engaged', 'Gửi báo giá', 'SK-05', 4],
  ['7e5442b5-417b-4530-92b8-1029ea2a4f10', 'quotation', 'Theo dõi báo giá', 'SK-06', 1],
  ['30b979c5-4003-4e36-9a2b-24f80f837fe3', 'quotation', 'Đàm phán điều khoản', 'SK-02', 2],
  ['51a7292f-2288-43c1-9b96-4c1f28b4f89b', 'quotation', 'Đề nghị ký', 'SK-02', 3],
] as const

export const STEP_TEMPLATE_SEED: StepTemplateValues[] = ROWS.map(
  ([id, stateKey, name, kindId, ord]) => ({
    id,
    objectKind: 'opportunity',
    stateKey,
    name,
    kindId,
    ord,
  }),
)
