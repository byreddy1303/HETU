# HETU: the reasoning observatory

HETU helps GATE CS learners turn answer evidence into diagnosis, retrieval, and fresh transfer. Its interface should make those connections tangible and keep actual study work readable.

## Directions considered

1. **A floating study desk.** Layered paper, tilted question cards, and physical notebook details. Familiar, but too close to the existing ledger and floating-card landing page.
2. **A knowledge galaxy.** Subjects as stars and progress as constellations. Visually immersive, but suggests relationships and mastery that the underlying evidence may not establish.
3. **A reasoning observatory — selected.** A sculptural three-dimensional loop expresses practice, diagnosis, and recall. Selecting a stage explains what it does; the authenticated dashboard pairs the same instrument with the learner's actual next actions.

```text
Desktop
┌ Brand                 Method / Workspace        Sign in / Request access ┐
│                                                                        │
│ Large left-aligned promise        Interactive 3D learning sculpture      │
│ Product explanation               Stage annotation + motion control    │
│ Primary action / Explore                                               │
│                                                                        │
│ Practice                        Diagnose                       Recall   │
├────────────────────────────────────────────────────────────────────────┤
│ One question through the loop   Interactive example with clear labels   │
│ Workspace features              Focused study / planner / evidence      │
│ Clear final invitation                                                  │
└────────────────────────────────────────────────────────────────────────┘

Mobile: navigation → copy → actions → sculpture → stage controls → example.
```

## Visual tokens

- Observatory plum: `#251720`, the immersive stage and dashboard hero.
- Deep garnet: `#98182B`, HETU's existing identity and primary daylight actions.
- Rose metal: `#EFA8A1`, illuminated geometry and active dark-stage controls.
- Warm ivory: `#FFF5EC`, legible dark-stage typography.
- Soft porcelain: `#F7F1EF`, daylight explanatory sections.
- Muted brass: `#D9BA84`, small diagram details.

Bricolage Grotesque carries the large, tightly set headings. Schibsted Grotesk carries explanations and controls. Existing Azeret Mono remains reserved for actual technical content, such as a cache-address breakdown. Headings and paragraphs are left aligned; geometric centers are reserved for the sculpture itself.

## Interaction and restraint

The sculpture is the signature. It uses projected three-dimensional geometry with subtle pointer response, and changes with a deliberately chosen practice/diagnosis/recall phase. A visible pause control and system reduced-motion support are required. Canvas rendering stops when hidden or outside the viewport, caps display resolution and frame rate, and has a static fallback.

The example is explicitly illustrative; its outcomes are never presented as the learner's results. Dashboard numbers continue to come from existing user evidence. There are no invented progress scores, streaks, rank predictions, or new infrastructure.

## Critique before building

The existing page already has floating cards, repeated reveal animations, and decorative scroll lines. Repeating those would add movement without clarifying the learning loop. The selected direction replaces scattered decoration with one substantial sculpture and a user-controlled walkthrough. Motion is concentrated in orientation and user action, while forms, timed practice, and dense evidence views keep their existing behavior.

## Implemented and verified

The landing page and dashboard hero now share the canvas sculpture without adding a graphics dependency. The landing example accepts a cache-index answer, explains the address breakdown, and offers a fresh retrieval with a reveal control. Forward navigation moves keyboard focus into the next example panel. All primary landing content sits within one main landmark.

The dashboard preserves its existing queue calculation and primary action, displays real due/carried-forward values, and uses a compact side-by-side sculpture and count on phones. The loop rotates within an orientation range that keeps its opening visible.

Verification: production build and strict lint pass; 619 unit tests across 107 files pass; six Playwright browser tests pass. Browser checks cover 320, 390, 768, and 1440px widths, both themes, keyboard example navigation, request-access/sign-in links, motion pause/resume, static reduced motion, existing study-route navigation, Planner persistence, and PYQ-to-recovery flow. Authenticated checks used the existing local sandbox.
