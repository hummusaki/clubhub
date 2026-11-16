# ClubHub interaction responsiveness

## Timing and layout

Headless Chromium at 1440×900 ran the same signed-in fixture before and after the change. The board contained 24 club tasks and eight personal tasks. The fixture used the workspace client with a warmed API route and a seeded fixture session. Durations measure activation through the first animation frame after the relevant visual state appeared in the DOM.

| Interaction | Before | After | Maximum change to measured control or neighbor while pending |
| --- | ---: | ---: | ---: |
| Complete a personal task | 3,041 ms | 22 ms | Row moved on confirmation before the change. The new pending row stayed in place at 0 px. |
| Set club task status | 3,039 ms | 22 ms | 0 px before and after |
| Set club task priority | 3,035 ms | 22 ms | 0 px before and after |
| Submit a new task | 21 ms | 22 ms | 64.1 px before, 0 px after |
| Open the searchable club selector | Native popup | 9 ms | 0 px after |
| Switch clubs | 35 ms | 11 ms | 0 px before and after |

With the three-second response delay, the original inline edits waited for the mutation response before applying the task state. The revised inline edits painted during the request. Confirmation still took about 3.06 seconds. The original modal already gave prompt feedback, but its pending label narrowed the submit button and moved Cancel.

The revised menu opening made zero requests. The warm baseline inline requests started within 1 ms in this fixture, with no additional API discovery or authentication request during the action. At a 120 ms response delay with 45 ms of synthetic main-thread work, the revised interactions showed feedback in 48–86 ms. A separate run delayed people data by 1.2 seconds and verified that the task rows appeared while that request was still pending. [Baseline trace](/Users/gabrielmortimer/.codex/visualizations/2026/11/16/01a1e1c0-ccb8-7e82-bc93-61ae72a8e064/baseline-timing.jsonl) · [Updated trace](/Users/gabrielmortimer/.codex/visualizations/2026/11/16/01a1e1c0-ccb8-7e82-bc93-61ae72a8e064/updated-timing.jsonl) · [Stress trace](/Users/gabrielmortimer/.codex/visualizations/2026/11/16/01a1e1c0-ccb8-7e82-bc93-61ae72a8e064/updated-stress-timing.jsonl)

## Save and reconciliation behavior

- Status and priority apply immediately. Writes serialize per task, and queued field changes coalesce to the latest values. Unrelated tasks can save concurrently. Mutation responses reconcile only their target entity, and revision checks discard board reads that overlap writes.
- Personal and per-member completion update immediately. Each toggle accepts one pending write, and the member version preserves other members’ completion records. Personal rows stay mounted during the request and change groups after confirmation. Focus moves to the section header if the focused row disappears.
- Definite rejections clear the affected optimistic state. Rename drafts remain recoverable, and permission failures trigger an authoritative reload. When delivery is ambiguous, a read checks the outcome before retry is available. Where the read cannot establish the outcome, the board offers a refresh. Scoped responses are discarded after a club or session change.
- Create and edit forms retain their drafts during saving. Deletes remove confirmed items, and clear-completed reports partial success. A lost reminder response does not trigger a second delivery attempt.

## Controls and verification

The shared control replaced 53 native selects and the Discord channel suggestions list. Club and people lists use search, including roster seats and channel suggestions. Polls, sections, and longer category lists enable search by option count. Status, priority, settings, and time parts use compact selectors. The time picker supports every minute and both clock modes. App-owned selectors use the existing surface and typography tokens, and the brief excludes browser date calendars, file choosers, and permission prompts. [W3C combobox guidance](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

- Chromium passed keyboard navigation, Escape and focus return, touch emulation, required-field validation, nested time menus, viewport bounds, out-of-order replies, rejected and dropped responses, stale reads, session and club changes, duplicate rename prevention, and partial deletion. Checked light and dark themes, standard and compact spacing, reduced motion, the five target viewport sizes, and responsive breakpoints. [Browser checks](/Users/gabrielmortimer/.codex/visualizations/2026/11/16/01a1e1c0-ccb8-7e82-bc93-61ae72a8e064/browser-checks.txt) · [Desktop board](/Users/gabrielmortimer/.codex/visualizations/2026/11/16/01a1e1c0-ccb8-7e82-bc93-61ae72a8e064/clubhub-tasks-desktop.png) · [Mobile selector](/Users/gabrielmortimer/.codex/visualizations/2026/11/16/01a1e1c0-ccb8-7e82-bc93-61ae72a8e064/clubhub-dropdown-mobile.png)
- `npm test` passed all 51 tests, including five new task-write tests. `npm run build` passed with Vite’s bundle-size advisory. `git diff --check` passed.
- Measurements cover the local Express-shaped fixture. Live Clerk or Supabase timings, physical mobile keyboards, and screen-reader output remain unverified.
