# Documentation

Three kinds of thing live here, and nothing else.

| Folder           | Holds                                                                                                               | Rots? |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| `design-system/` | The Aurora v2.0 laws, the real token names, the three device frames. The only copy — no linter holds laws 12 and 13 | No    |
| `decisions/`     | One ratified decision per file, ADR-numbered. Plus `open-questions.md` for what is still unsettled                  | No    |
| `runbooks/`      | Manual verification procedures. The mail layer deliberately has no automated tests; its runbook is the substitute   | No    |

## What is deliberately not here

**Status** — what is built, what is next, what is owed. It rots by the day and it
is already readable from `git log` and from the code. Five documents used to
answer that question and they disagreed with each other.

**Plans and roadmaps.** A plan that survives in a document outlives the reasoning
that produced it. The decisions that came out of a plan are in `decisions/`; the
plan itself is not.

**Anything the code already says.** A document restating a schema or a function
signature is a second copy that drifts on the next edit.

## Conventions

Folders and filenames are English, ASCII, kebab-case, no dates. Content is
English too. Every folder carries an `index.md` naming every file in it — a file
no index mentions is one nobody will find again. ADRs are `NNNN-<verb-phrase>.md`
and numbers are never reused.

`pnpm ctx` enforces the shape and fails `pnpm check` when a path, command or
agent named anywhere in the instruction layer stops existing.

## History

On 16/09 this directory was 23 Vietnamese-named, Vietnamese-language files,
477 KB, in which the same status was written five times and no two copies agreed.
They were mined for decisions and deleted. `git log` still has every one of them
if a wording ever needs checking.
