import { sql, type SQL } from 'drizzle-orm'

/** `n` fresh human codes `<prefix><number>` off one sequence, ascending.
 *
 *  The number is zero-padded to `width` but never cut. Postgres `lpad`
 *  TRUNCATES a longer string, so the old `lpad(v, 4, '0')` printed sequence
 *  value 12345 as "1234" — a code an older row already holds. `nextval` sits in
 *  FROM so the padding can read the value twice without drawing it twice.
 *  `prefix` and `seq` travel as bound parameters, never as SQL text. */
export const seqCodes = (prefix: string | SQL, seq: string, n = 1, width = 4): SQL => sql`
    SELECT ${prefix} || lpad(v::text, greatest(${sql.raw(String(width))}, length(v::text)), '0') AS code
      FROM (SELECT nextval(${seq}::regclass) AS v FROM generate_series(1, ${n})) minted
     ORDER BY v`
