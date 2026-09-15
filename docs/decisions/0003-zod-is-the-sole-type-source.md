# 0003 · zod in `@pv/contracts` is the sole type source

Status: accepted
Source: docs/ban-giao-backend.md — table "Locked in", row #4

## Context

Preparing to build `apps/api`, cut 23/08/2026. The BE framework was still open
at the time (later locked in as NestJS, see ADR 0007), but the question "where
do data types live" was decided first, independent of the framework.

## Decision

**zod is the sole type source.** TS types are inferred with `z.infer`. Where a
platform contract already exists, use `satisfies z.ZodType<T>` so `tsc` guards
against drift.

## Consequences

No class-validator, no DTO classes — even once the framework later locked in
as NestJS, where DTO classes are the default idiom. This is one of three known
friction points between Nest and this repo (DTO-class idiom vs zod), and the
way it is neutralized is recorded in ADR 0007.
