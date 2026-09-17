import type { ConstraintBook } from '@api/platform/http/db-error'

/** Second net behind `StageCriterionService.assertLabelFree`, for the one path
 *  the service check cannot see: two approvals racing inside the same second. */
export const STAGE_CRITERION_CONSTRAINTS: ConstraintBook = {
  stage_criterion_stage_label: {
    kind: 'conflict',
    message: 'Chặng này đã có một tiêu chí cùng tên.',
    fields: ['label'],
  },
  stage_criterion_stage_known: {
    kind: 'invalid',
    message: 'Chặng không hợp lệ.',
    fields: ['stage'],
  },
}
