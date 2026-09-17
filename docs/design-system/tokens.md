# Real token names

Source: the Pebble Aurora design system, adopted 17/09/2026. Exact names, copy
verbatim. The single source of truth is `packages/tokens/globals.css`; the
comment beside each line there names the Pebble Aurora token it carries.

```
screen bg            var(--background)         #070B16   · bg-000, .aurora-field frames the screen
panel                var(--card)               #0D1424   · bg-100, opaque — .glass-a / .glass-b
nested surface       var(--muted)              #131C31   · bg-200, table head, hover row
control ground       var(--input)              #1A2540   · bg-300, input, secondary button
primary text         var(--foreground)         #EEF2FB   · ink
secondary text       var(--muted-foreground)   #A3AEC8   · ink-muted
third reading level  var(--glass-foreground)   #8491B0   · ink-subtle, body 11.5–12.5px
brand background     var(--primary)            #3D6DF5   · button ramp ends at --primary-strong #2D59D9
brand text           var(--accent-foreground)  #A9C1FF   · brand-ink
brand tint           var(--accent)             rgba(61,109,245,.16)
success              var(--success)            #5AD49A   · status-won
warning              var(--warning)            #F4B860   · status-todo — the warm "do this now" tone
danger background    var(--destructive)        #DA251D   · Flag Red · text #FF8A8F
```

Surfaces are flat: a block leaves the page by lightness plus `--shadow-panel`,
never by a border and never by a blur.

- `.glass-a` — cards, KPI, hero cell, main panel.
- `.glass-b` — tables, long lists, right sidebar, popover.
- Both paint the one panel surface now; the split only says what may sit on
  what (law 8).
- AI block — `linear-gradient(90deg, rgba(61,109,245,.16), rgba(61,109,245,.04))`
  over `--card` \+ `inset 0 1px 0 var(--sheen-ai)`; the vertical panel variant
  uses `150deg`.

Pebble Aurora also carries `status-new` and `status-care` (and their tints),
which no screen consumes yet — they are not declared here. Ask before a screen
needs them; do not invent a near-miss out of `--accent` or `--success`.

**Missing a token? ASK, do not invent a new hex.** `pnpm tokens:check` blocks
any `var(--x)` that points at a token that doesn't exist.
