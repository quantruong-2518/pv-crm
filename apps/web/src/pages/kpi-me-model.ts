import type { RoleId } from '@pv/contracts'

/** Scroll targets on the personal KPI screen: a strip row jumps to its card. */
export const FORECAST_ANCHOR = 'me-forecast'
export const confirmAnchor = (role: RoleId) => `me-confirm-${role}`
