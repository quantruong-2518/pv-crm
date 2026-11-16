/** The run day as the DATABASE sees it, for the raw-SQL checks. A literal date
 *  would pin every check to one day; the seed runs on the real day (`--today`
 *  is PGlite-only and the bell markers read this same clock). */

export const VN_DAY = `((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`
