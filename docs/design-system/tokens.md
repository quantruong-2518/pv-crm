# Real token names

Source: `docs/luat-thiet-ke.md` §2. Exact names, copy verbatim. The single
source of truth is `packages/tokens/globals.css`.

```
screen bg           var(--background)         #0B1220   · screen frame uses .aurora-field
primary text        var(--foreground)         #E5E7EB
secondary text      var(--muted-foreground)   #93A1B8
text on frosted glass var(--glass-foreground)  #B4BECD   · body 11.5–12.5px inside .glass-b
azure background    var(--primary)            #2E63E6
azure text           var(--accent-foreground)  #7FA3FF
azure background, light var(--accent)          rgba(46,99,230,.22)
success              var(--success)            #22B573   · text #B9E7D2 / number #5EE0A8
warning              var(--warning)            #FFCD00   · text #FFE9A3
danger background    var(--destructive)        #DA251D   · text #FF6B5E / #FFD9D5
```

Glass:

- `.glass-a` — cards, KPI, hero cell, main panel.
- `.glass-b` — tables, long lists, right sidebar, popover.
- AI block — `linear-gradient(90deg, rgba(46,99,230,.22), rgba(46,99,230,.06))`
  \+ `inset 0 1px 0 var(--sheen-ai)`; the vertical panel variant uses `150deg`.

**Missing a token? ASK, do not invent a new hex.** `pnpm tokens:check` blocks
any `var(--x)` that points at a token that doesn't exist.
