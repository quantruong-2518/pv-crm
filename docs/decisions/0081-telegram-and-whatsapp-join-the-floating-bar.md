# 0081 · Telegram and WhatsApp join Gọi / Zalo / Gửi mail on the floating bar

Status: accepted (amends 0075 §3 and §7, 0077 §4 and §6, 0078 §1 and §2: the set of floating-bar buttons grows from three to five)
Source: project owner's request, 08/10/2026

## Context

The floating bar of lead, opportunity, contract and installment screens carried
Gọi / Zalo / Gửi mail (0075 §3, 0078 §1). The owner asked for Telegram and
WhatsApp beside them.

## Decision

### 1 · Five buttons, one path

The bar is Gọi / Zalo / Telegram / WhatsApp / Gửi mail (+ "Khác"). A press on
Telegram or WhatsApp goes through the same comm confirm as the others: the record
is created first (POST → 201), then the link opens.

### 2 · Both chats are reached through the contact's phone number

Telegram opens `https://t.me/+<E.164 digits>`, WhatsApp opens
`https://wa.me/<digits>`. The comm's identity is minted or looked up on the
phone channel, as for Zalo. No handle field exists. `ContactChannel` (the
contact's preferred channel) is NOT widened.

### 3 · Contract and data

`CommsChannel` gains `'whatsapp'`; `CommActionChannel` is phone, zalo-oa,
telegram, whatsapp, email; `WorkstreamChannel` gains `'whatsapp'`. Migration
`0092_comms_whatsapp_channel.sql` widens the CHECKs on `comms.identity` and
`comms.thread`. A whatsapp identity address must be E.164.

### 4 · Counting

- The opportunity book's "Hoạt động cuối" counts Telegram and WhatsApp as
  customer contact, like Zalo (0077 §4).
- Pressing any chat button on a LEAD moves the lead to `working` at once, exactly
  like Zalo (0075 §7).

### 5 · Logos

Decided by the owner 09/10/2026: the Zalo, Telegram and WhatsApp buttons carry each
app's real logo shape, drawn by `BrandMark` (A-25, inline SVG, Simple Icons paths),
in ONE color — the surrounding text color (`fill-current`), not brand colors. No
brand tokens exist (`--brand-zalo/--brand-telegram/--brand-whatsapp` were removed),
so law 1 needs no exception. Law 11 keeps a narrow exception (a filled logo glyph,
not a Hugeicons stroke): only these three buttons; nothing else may use `BrandMark`.
This closes the third Open item below.

## Open

- The last-activity tooltip still names Zalo only.
- Whether `ContactChannel` widens to Telegram / WhatsApp.
- A real WhatsApp icon: `MessageSquare` is a stand-in.

## Amends

- **0075 §3, §7** — the buttons that create a record and move a lead.
- **0077 §4, §6** — the channels counted in "Hoạt động cuối"; the buttons in the bar.
- **0078 §1, §2** — the floating bar's button set.

## Out of scope

- A handle or username field for either chat.
- Any change to the confirm flow or the three comm states (0075 §2).
