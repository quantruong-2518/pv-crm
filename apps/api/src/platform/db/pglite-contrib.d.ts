/** `tsconfig.api.json` resolves with node10, which cannot read the package's
 *  `exports` map — Node itself can, so only the type needs spelling out here. */
declare module '@electric-sql/pglite/contrib/pg_trgm' {
  import type { Extension } from '@electric-sql/pglite'
  export const pg_trgm: Extension
}
