# 0059 · Write doors refuse cross-site requests, because `SameSite=None` cannot

Status: accepted
Source: auth review, 20/09/2026 — reproduced against the running API before
the fence was written

## Context

The web app is served from `crm.pebblevina.com`; this API answers on
`pvone-crm-api.fly.dev`. Two different registrable domains, so the session
cookie has to be `SameSite=None` or it never travels at all — `auth/cookie.ts`
states that half and stops there.

`None` is the half that was not written down. It means the browser attaches
the cookie to **cross-site** requests too, and CORS does not stop a request
being _sent_ — only the response being _read_. Three facts, each verified
against the running server:

1. the cookie is `SameSite=None; Secure` whenever `NODE_ENV=production`;
2. the handler runs whatever `Origin` says — `POST /auth/forgot-password`
   with `Origin: https://evil.example` answered `204`, work done;
3. `application/x-www-form-urlencoded` is parsed. It is one of the three CORS
   "simple" content types, so a form carrying it is sent with **no preflight**.

Together those are an ordinary CSRF hole. A page anywhere can auto-submit

```html
<form method="post" action="https://<api>/sales/campaigns/X/start"></form>
```

which arrives with the victim's cookie, `ActorGuard` resolves them, `AccessGuard`
waves it through because they genuinely hold `campaign.broadcast`, and a
campaign goes out. The attacker never reads the answer and never needed to.

The bodyless `POST` doors are the sharpest, because a form with no fields at
all reaches them: `leads/:code/contacted`, `/reopen`, `/resume`,
`campaigns/:code/start`, `/stop`, `auth/sign-out`. `PATCH` and `DELETE` were
never exposed — neither is a CORS-simple method, so both are always
preflighted and CORS really does fence them. The `/users` and `/roles` write
doors were also already covered, by `@NeedsReauth()`.

## Decision

`CrossSiteGuard`, registered as the **first** global guard — before
`ActorGuard`, so a forged request is refused before it costs a session lookup.
On every method that is not `GET`/`HEAD`/`OPTIONS` it asks two questions:

- **Origin.** Present and not ours → 403. This is the load-bearing rule and
  the only one that reaches a write carrying no body: a browser cannot be
  talked out of sending `Origin` on a cross-origin request, and script cannot
  forge it. Absent stays allowed — that is `curl`, a webhook, a same-origin
  navigation.
- **Content type.** One of the three no-preflight types → 403. This covers
  what the first cannot, a client that omits `Origin`, and it states the rule
  positively: write doors speak JSON, JSON is not simple, so every one of them
  is preflighted and CORS finishes the job.

`@MachineDoor()` opts out the two doors a program opens rather than a browser:
the Resend webhooks (HMAC over the raw bytes) and RFC 8058 one-click
unsubscribe (signed token in the path, and a form body the spec _requires_).
Neither waives authentication — each proves itself another way, and the fence
being waived could only ever produce a false refusal for them.

The origin comparison moves into one function, `platform/http/origin.ts`.
There were two copies before this ADR (`main.ts` for CORS, `lead-intake.guard`
for the public door) and this would have made a third; the failure mode is
silent in both directions, and `env.ts` already carries a dated note about a
trailing slash that cost every sign-in a preflight error.

## Consequences

- A write door now refuses a request shape it used to serve. Nothing the web
  app sends is that shape: it sends JSON, from an allowed origin, and attaches
  `Content-Type` only when there is a body.
- `LeadIntakeGuard.assertOrigin` is now redundant for the one route it guards.
  It is kept: it names _which_ door refused, and a public form is the one
  caller that reads the sentence. Both read `isAllowedOrigin`, so they cannot
  drift apart.
- **This is a fence, not the fix.** The structural answer is one origin —
  serve the API under the web app's domain, let the cookie return to
  `SameSite=Lax`, and the whole class closes with no guard at all. Until that
  move, this guard stands in for it, and it should be deleted the day the move
  happens rather than kept as belt-and-braces nobody re-reads.
