/** The address of each KPI tab and the one query name every KPI address
 *  carries its month under. Lives in lib/ so `components/` and `pages/`
 *  read one copy. */

export const MONTH_PARAM = 'month'

export const ME_PATH = '/sales/kpi/me'
export const UNIT_PATH = '/sales/kpi/unit'
export const COMPANY_PATH = '/sales/kpi/company'

export const oneOnOneHref = (month: string, person: string) =>
  `/sales/kpi/one-on-one?${new URLSearchParams({ [MONTH_PARAM]: month, person }).toString()}`
