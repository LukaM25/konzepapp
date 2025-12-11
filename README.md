# Konzepapp — Shared Shopping, Smart Recipes, Indoor Nav (Expo)

Expo (web/iOS/Android) prototype that matches the reference: shared shopping lists with invites/roles, AI recipe bubble, mock indoor navigation, offline-first cues, and freemium tiers ready to wire to real services.

## Quickstart
- `npm install` (already done by scaffold)
- `npm run web` or `npm run ios` / `npm run android`
- Toggle `Offline-Sync` in the list to see queued changes; use the floating **AI** bubble to trigger AI flows (deducts from the free quota).

## Features in this prototype
- **Shared lists**: presence avatars, assignee badges, priority tags, one-tap check-off, quick add, roles scaffolded.
- **Offline-first**: local state persists; actions queue while offline and surface a sync log.
- **AI bubble**: omnipresent FAB with canned prompts; selects pantry-based recipes, tracks free-tier AI quota (10).
- **Smart recipes**: cards with diet/allergen tags, pantry source, servings, AI cost flag; highlight selected suggestion.
- **Indoor nav (mock)**: aisle pins and a route bar; free hints vs. “turn-by-turn” call-out for Pro/Family.
- **Auth entry points**: Google, Apple, Email buttons (stubbed), household concept shown in presence list.
- **Multi-language scaffold**: DE/EN toggle for hero and offline messaging (extendable to full copy).
- **Monetization**: Free, Pro (Single), Family/WG tiers with perks matching the requested pricing copy.
- **Branding/theming**: neutral premium palette, rounded cards, badges, floating AI CTA.

## Files & structure
- `App.tsx` — all UI/state for lists, recipes, nav mock, AI bubble, language toggle, and tier cards.
- `assets/` — Expo defaults (replace with brand assets as needed).

## How to extend
- **Auth**: connect the buttons to Firebase/Auth0/Clerk; wire Google/Apple providers and household roles.
- **AI backend**: replace `requestAI` with OpenAI calls; enforce quota server-side; add allergy/diet filters to prompts.
- **Persistence**: sync list/recipes to your backend or Supabase; store offline data via SQLite/AsyncStorage.
- **Indoor navigation**: swap mock aisles for store-map data; render true paths (SVG/canvas) and ETA; gate advanced routing for Pro/Family.
- **Internationalization**: expand `translations` in `App.tsx` and route all copy through it.
- **Payments**: connect the tiers to in-app purchases/subscriptions; surface upgrade moments when AI quota nears zero.

## Notes
- Built with Expo SDK 54, React Native 0.81, React 19.
- No tests run in this iteration. If you want, I can add lightweight component tests or snapshot checks.
