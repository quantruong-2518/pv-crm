# Runbook — before flipping `PV_EMAIL_ENABLED=true`

## DNS — check with `dig`, do not trust the dashboard

```bash
dig +short TXT notify.pebblevina.com                      # SPF: v=spf1 include:… ~all
dig +short TXT resend._domainkey.notify.pebblevina.com    # DKIM
dig +short TXT _dmarc.pebblevina.com                      # DMARC: p=none → quarantine → reject
```

Three rules: **one** SPF record per hostname (merge into the existing one,
never add a second); raise DMARC gradually, only once alignment is confirmed
stable; and Postmaster Tools must have **both** `pebblevina.com` and
`notify.pebblevina.com` registered — keep the spam rate under 0.10%, hitting
0.30% is a failure.

## Secrets on Fly

```bash
fly secrets set --app pvone-crm-api \
  RESEND_API_KEY=re_xxx RESEND_WEBHOOK_SECRET=whsec_xxx
```

Addresses and ceilings go in `fly.toml`'s `[env]` — anyone reading the repo
should see them there. Only the two keys above are real secrets.

## Canary

Flip the flag, send **one** MAS run to a single recipient of your own (a lead intake no longer sends mail, ADR 0085), and check all four:
the mail arrives, `state='delivered'`, the webhook leaves a row, and
`/healthz/email` is clean. Only then send to real recipients.
