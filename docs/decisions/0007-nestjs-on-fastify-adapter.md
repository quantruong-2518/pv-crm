# 0007 · NestJS on `@nestjs/platform-fastify`

Status: accepted
Source: docs/ban-giao-api.md — table "Two last open items, locked in", row
"Framework: NestJS or Fastify", plus the paragraph right after the table, and
section "Nest friction — two stumbles, don't stumble again"

## Context

`docs/ban-giao-backend.md` left the BE framework question open: "Nest is
worth it if ≥3 people write BE and there is a `@pv/contracts` in zod so DTOs
are not written twice; below that threshold, Fastify + Drizzle is leaner."

## Decision

**NestJS on `@nestjs/platform-fastify`.** NestJS is the project owner's
choice, made knowing in advance three friction points with this repo
(DTO-class idiom vs zod · ESM vs decorators · a DI container layered on top of
an existing factory). All three have been neutralized; how is recorded below.

## Consequences

Runs on the Fastify adapter, not the default Express: Fastify's hook chain
matches the shape of the `BEFORE`/`AFTER` interceptor chain already built in
`apps/web/src/app/api/client.ts`, and it keeps a way back open if the Nest
layer is ever stripped out later.

Two friction points already hit, recorded so nobody hits them again:

1. **`ERR_REQUIRE_ESM`.** `packages/engines` and `contracts` declare
   `"type": "module"`; ts-node refuses to `require()` their `.ts` files. The
   BUILD output is unaffected (dist sits under `apps/api`'s CJS scope); only
   dev is caught. Fixed with `ts-node.moduleTypes` in `apps/api/tsconfig.json`.
2. **`consistent-type-imports` eats DI.** Lint wants
   `import { LeadRepository }` turned into `import type` — doing that makes
   `emitDecoratorMetadata` write `Object` into `design:paramtypes`, and Nest
   reports "Cannot resolve dependency" somewhere unrelated. **A blind
   `eslint --fix` will break the app.** The rule is turned off for `apps/api`,
   with the reason recorded in `eslint.config.js`.

Four `tsconfig.api.json` keys that must differ from web (`commonjs` ·
`node10` · `verbatimModuleSyntax: false` · `useDefineForClassFields: false`)
and `"type": "commonjs"` in `apps/api/package.json` — the full reasoning lives
in those two files themselves.
