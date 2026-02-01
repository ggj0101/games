# Specs — Homepage Refactor

## IA (Information Architecture)
1. **Hero**: brand title, short tagline, primary CTA.
2. **Featured**: highlight one "ready" game (or first available).
3. **Browse**:
   - Search by name/description
   - Filter by tags
   - Separate **Ready** vs **Coming soon**

## UI Requirements
- Dark theme friendly, high contrast, modern.
- Cards include:
  - icon / cover block
  - title
  - short description
  - tags
  - status chip
  - primary action
- Hover/press micro-interactions (subtle).

## UX Requirements
- Entire card is clickable when ready.
- Keyboard accessible: Enter/Space on focused card triggers navigation.
- Search & filters update instantly.

## Data Model
`GameMeta` fields:
- `key`, `title`, `description`, `to`
- `status`: `ready | coming-soon`
- `tags`: string[]
- `icon`: mdi icon name
- optional: `minutes`, `age`

## Acceptance
- `/` renders hero + featured + browse sections.
- Search and tag filters work.
- Lint/build pass.
