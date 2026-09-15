# Runbook — recovering rows stuck in `state='dead'`

```sql
SELECT event_key, recipient, attempt_count, last_error_code, last_error_summary
FROM platform.email_delivery WHERE state = 'dead' ORDER BY updated_at DESC;
```

Read `last_error_code` first. If it is a configuration error (`401`, `403`,
wrong domain), fix the configuration before releasing anything. Release a row
by putting it back to `pending`:

```sql
UPDATE platform.email_delivery
SET state = 'pending', next_attempt_at = NULL, attempt_count = 0
WHERE event_key = 'lead-intake/internal/v1/LD-0233';
```

The next poll picks it up. **Be careful with rows older than 24 hours:**
Resend's idempotency window has closed by then, so if Resend actually received
the mail the first time, releasing it sends a second copy. Check
`provider_email_id` first — a value there means the mail already went out.

## Releasing a wrongly-suppressed address

```sql
UPDATE platform.email_suppression SET released_at = now() WHERE recipient = 'a@x.vn';
```

Do not release a hard-bounced address and then send to it again — a repeat
bounce is the fastest way to damage sender reputation.
