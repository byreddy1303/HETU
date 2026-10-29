# Minimal local study interface

The local daily queue shows one next action, selected using saved progress, due dates and the chosen time budget. Action buttons name their purpose. The recommendation reason and study tools expand on request; alternative work stays grouped in the existing queue. Due-review summaries use the backend forecast count rather than counting a sprint as one question.

Prepared practice prioritises an activity already in progress, then the oldest due activity. Other due activities and future checks occupy separate closed disclosures, with accurate counts. Future-only work shows its next date and does not offer an early start. Automatic preparation controls and healthy status stay inside their disclosure; errors and recovery controls remain visible. The existing practice prepare/start/resume and saved evidence services remain authoritative.

Local study pages use compact text headers to keep the activity in view. Repeated tip cards and motivational footers are omitted on these focused local pages. Sources, history, model configuration and saved records remain available when needed.

## Desktop upgrade migration

An old service worker can serve a cached page before a new renderer can unregister it. The Electron main process now removes service-worker registrations, CacheStorage and HTTP cache for the exact loopback app origin before loading the first page. It explicitly preserves IndexedDB, localStorage, cookies and the SQLite workspace. Local renderer startup no longer registers a new PWA service worker. Hosted PWA behaviour stays separate.

Native regression verification seeded a disposable Electron profile with a service worker that demonstrably served a stale screen, plus a localStorage draft and IndexedDB notes. Restarting that profile with the packaged app loaded the new interface, removed the worker and preserved both draft stores. A separate populated native flow verified one practice recommendation, expandable alternatives and preparation controls, answer-safe previews, and blind recovery resume/pause.
