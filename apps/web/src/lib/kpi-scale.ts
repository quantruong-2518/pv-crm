import { KPI_COVERAGE_LOW } from '@pv/contracts'

/** The pipeline-coverage axis runs to twice the low-coverage line, so the line sits
 *  mid-gauge on every screen that draws it. */
export const COVERAGE_AXIS_MAX = 2 * KPI_COVERAGE_LOW
