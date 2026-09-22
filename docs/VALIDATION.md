# Validation — 2026-09-21

## Verified

- `npm run check`: **15 tests passed**, userscript bundle built successfully.
- Dependency installation audit: no known vulnerabilities reported by npm at installation time.
- Real SpellTable lobby, signed-in Chrome: temporarily loaded the built script, displayed its interface, read current lobby cards, matched a `b3` table using `BR3`, showed its `3/4` occupancy, and excluded full tables. No real table was joined. Temporary injection and its test settings were removed afterward.
- Current public SpellTable client source and live DOM informed the adapter selectors. The implementation invokes native DOM controls; it does not import that source, read authentication tokens, patch private React state, or call backend APIs directly.
- In-app browser simulation: edit/save/reload a loadout; start and cancel the countdown; complete a second countdown; enter the simulated prejoin screen; automatically click Join Now; select Krenko with the native-style picker; verify the player row; prepare a Moxfield message without sending; prepare the native-style deck-link dialog.
- Responsive checks: desktop at 1536 × 1024, narrow layout at 390 × 844, and the default app viewport. At 390 CSS pixels, page width was 390 with no horizontal overflow, a single-column layout, and four matching rows.

## Not yet verified

- Installed Tampermonkey sandbox behavior in a real user session.
- Joining an actual multiplayer room, applying a commander there, or persisting the native profile deck link.
- Real partner/background commander combination, non-English site UI, Firefox, Safari, or physical mobile devices.
- A real text-chat integration. The current inspected app has no native text composer; clipboard sharing and native deck-link preparation are the supported paths.

## Design review

Working concept: `docs/design-concept.png`, generated with the built-in image tool. Browser render: `docs/preview.png`, captured using the supported browser CDP screenshot capability. Both files were inspected with the image viewer. No external Playwright browser was required. Browser capture scaling was inconsistent across Windows display scale and emulated viewport sizes; the final in-app capture uses an explicit scale and shows the complete interface. CSS viewport dimensions were separately checked in the browser.

| Comparison | Result |
| --- | --- |
| Layout | Preserved header, left loadout rail, right filtering area, flat matching-table list, and status footer. |
| Palette | Charcoal `#101719`, sage `#bedc9b`, light text, and subdued borders preserved. |
| Typography | System sans-serif; explicit sizes on fields, buttons, headings, row text, and status. |
| Controls | Full-width primary Start button, outlined deck actions and Join buttons, 8px input corners. |
| Copy | Primary headings, labels, call to action, and four example table titles match the concept. |
| Responsive layout | Changed the stack breakpoint to 760px after a narrow two-column render compressed the filters. |

Intentional differences from the generated concept: two automation preference checkboxes; a current-page/format scope explanation; real empty/error/countdown messages; an edit dialog; a compact in-game panel; smaller system-font typography in some controls; flat color fills instead of generated lighting. These support the requested behavior and clarify its boundaries. No decorative bitmap assets are needed in the shipped UI. The preview includes the clearly labeled simulation below the panel.

The implemented visual system was checked against the concept for layout, palette, typography, spacing, controls, copy, and mobile behavior. It is not a pixel-identical rendering of the generated image.

## Concept brief

Built-in Image Gen; UI mockup of a complete, practical SpellTable Plus control panel. Charcoal and sage palette; system sans-serif; header with Native lobby; a 310px-class loadout rail; commander display and Edit/Share actions; matching and exclusion inputs; Start auto-join; four table rows with occupancy and Join; status footer. No illustrations, fake metrics, unrelated navigation, or decorative logos. The actual prompt's requested working copy is represented by the concept and the UI source.
