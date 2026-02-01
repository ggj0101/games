# Design — Homepage Refactor

## Visual Direction
- **Modern dark portal**: gradient accents, glass/tonal surfaces, clear typography.
- Minimal but deliberate motion: transform on hover/press.

## Components (Vuetify)
- Hero: `v-container` + `v-row` + big `h1`, supporting text, CTA `v-btn`.
- Featured: `v-card` with bigger cover block + CTA.
- Browse:
  - `v-text-field` (search)
  - `v-chip-group` (tags)
  - `v-row` grid of cards

## Responsive
- xs: single column, stacked controls.
- sm/md: 2–3 column grid.
- lg+: 3–4 column grid.

## A11y
- Clickable cards use button semantics and focus ring.
- Do not rely on color alone for status.
