# Proposal — Homepage Refactor (Professional Game Portal)

## Problem
Current `/` (HomeView) is functional but looks like a prototype: flat grid of cards, limited hierarchy, no discovery tools (search/filter), and weak branding.

## Goal
Make the GAMES homepage feel like a professional game portal while staying lightweight and maintainable.

## Non-Goals
- No redesign of individual game pages/engines.
- No backend, auth, or content management.
- No heavy animation libraries.

## Constraints
- Keep stack: Vue 3 + TS + Vuetify 3.
- Mobile-first; touch friendly.
- Must pass `npm run lint` and `npm run build`.

## Success Metrics
- Clear visual hierarchy (hero → featured → browse).
- Users can quickly find a game via search/filter.
- Responsive layout (phone/tablet/desktop).
