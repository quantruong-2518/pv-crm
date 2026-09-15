# Checklist before opening a PR

Source: `docs/luat-thiet-ke.md` §8.

- [ ] §8.1 — No hex anywhere in code outside the token layer →
      `aurora/no-raw-hex`
- [ ] §8.2 — No border around a box outside the high-contrast variant →
      `aurora/no-box-border`
- [ ] §8.3 — Every table/long list sits on `.glass-b` → styling layer,
      `DataTable` does not paint its own glass
- [ ] §8.4 — Every AI block has "Căn cứ:" + a button; no action runs on its
      own → styling layer + `E3.proposeFromAi`
- [ ] §8.5 — Every screen has a ContextRail → `E1.story()`
- [ ] §8.6 — Padding/gap only from the 8 steps → `aurora/spacing-scale`
- [ ] §8.7 — `prefers-reduced-motion` turns off all aurora animation
- [ ] **§8.8 — Background is exactly 4 layers · contrast ≥ 4.5:1 · tablet
      buttons ≥ 48px**

The first seven lines are **machine-gated** — `pnpm check` runs all of them.
The last line is eyes-only, and is in
`.github/pull_request_template.md`.

> §8.8 originally read "diff the built screen against `screens-png/` at 100%
> zoom, drift < 4px." The reference images were deleted along with `project/`,
> so the criterion changed to three things checkable by eye without the
> original images. Rebuild the image set and the old criterion comes back.
