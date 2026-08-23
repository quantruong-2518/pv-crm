# apps/api — NestJS on Fastify; read `app.module.ts` first, it names both halves

Two halves, and the line between them is a lint rule, not a convention:

- `platform/` — belongs to NO branch. Engines (E1–E4 as providers, never wrapped
  in a class), the access guard, the Problem filter, session, db pool, audit,
  object graph. Nothing here may import from `branches/`.
- `branches/<name>/` — one Nest module per business branch, one Postgres schema
  per branch. `branches/sales` never imports `branches/supply`. Cross-branch
  reads go through a module's exported service, never through its tables.

Inside a branch module, four files per feature and each knows exactly one thing:

| File              | Knows                                                      | Never touches          |
| ----------------- | ---------------------------------------------------------- | ---------------------- |
| `*.controller.ts` | HTTP, `@Need`, zod pipe                                    | SQL, business rules    |
| `*.service.ts`    | repository **and** engine — the only place that knows both | HTTP, `req`/`res`      |
| `*.repository.ts` | SQL (Drizzle)                                              | permissions, decisions |
| `*.schema.ts`     | table shape                                                | everything else        |

**The load-bearing rule:** engines are synchronous and pure — they receive data
already loaded and return a decision. Repositories are async and decide nothing.
Break that and E1/E2 stop running on both ends, which is the whole point of
`packages/engines` being React-free.

Contracts are zod in `@pv/contracts` — it is the single type source (decision #4
in `docs/ban-giao-backend.md`). No class-validator, no DTO classes. Validation
goes through `platform/http/zod.pipe.ts`.

Config that must differ from the web tsconfig (CommonJS, decorators) is
explained in `tsconfig.api.json`; read it before changing a compiler flag.

Run locally — no Docker, no daemon, nothing to install:

```bash
cp apps/api/.env.example apps/api/.env   # defaults to pglite://./.pglite
pnpm db:migrate && pnpm db:seed && pnpm dev:api
```

`pglite://` runs real Postgres compiled to WASM inside this Node process — same
engine, so recursive CTEs, two schemas, `text[]` and `uuid` all behave. Single
connection only, so it is a development tool: `env.ts` refuses to boot on it
when `NODE_ENV=production`. For a production-shaped run, `pnpm db:up` starts
Postgres in Docker and you point `DATABASE_URL` at it — nothing else changes.
