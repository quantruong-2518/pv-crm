# Three devices, three roles

Source: `docs/luat-thiet-ke.md` §3.

| Device      | Frame      | Its own rules                                                                                                                                              |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop** | 1440 × 900 | office, deep business logic. Sidebar 232 · topbar 64 · bento 4 columns, gap 16 · every dashboard has exactly **one 2×2 hero cell**                         |
| **Tablet**  | 1024 × 768 | the field, kiosk. Header 72 · no sidebar · buttons ≥ 48px · has a "high contrast" toggle button                                                            |
| **Mobile**  | 440 × 956  | in-pocket. iPhone 17 Pro Max, includes device frame + dynamic island. Status bar 62 · bottom nav 84 (Home · Approvals · Search · Assistant) · safe-area 34 |

> **Still open, not decided.** The theme kit build T-03 draws mobile at
> **390 × 844 · status 44**; the table above says **440 × 956 · status 62**.
> Original note: "the old One build is still built at 390×844; raise it to 440
> when it's revised." The build inside `@pv/ui` currently follows 390×844.
> Say the word and it changes.
