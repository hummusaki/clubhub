# ClubHub — responsive interactions, stable controls, and custom dropdowns

## Assignment for the implementing agent

Implement this brief in the existing ClubHub repository. Do not return another plan in place of implementation. Inspect the current source, make the changes, test the behavior, and deliver a short implementation report with evidence.

This is a separate assignment from `docs/ui-density-implementation-brief.md`. Build on any density/layout improvements already present. This brief takes precedence for interaction timing, control stability, and dropdown implementation: specifically, any dropdown recommended by the earlier brief must now use an application-rendered custom control rather than a native `<select>` popup. Do not redo the density redesign or discard its useful changes.

Read applicable repository instructions and inspect `git status` first. The workspace has active frontend edits; preserve them. File names and symbols below describe the inspected code, but verify current implementations before editing. Do not reset files, reformat entire large components, or perform unrelated refactors.

The deliverable is implemented source plus verification. Do not deploy, push, send notifications, connect external accounts, modify production records, or run collection/sync jobs to test this work. Use isolated fixtures, mocks, and safe local data. Do not read or print secrets.

## 1. User goals

1. Buttons should feel responsive immediately. The user reports that task-board buttons appear to react roughly three seconds after clicking.
2. Buttons and neighboring controls should maintain their dimensions and positions when clicked, while saving, when labels change, and when related content updates.
3. Replace system dropdown menus with consistent, attractive custom dropdowns. Integrate search where the option set warrants it.

Do not confuse these three goals. A spinner is useful acknowledgement but does not, by itself, fix a status control that waits seconds to change. A faster request does not prevent a button from jumping when its label changes. Styling a `<select>` trigger does not replace its native popup.

Preserve the current theme, visual identity, responsive layout, permission rules, task ownership, and domain behavior.

## 2. Source evidence and diagnostic starting points

These observations come from source inspection. The reported three-second delay has not been timed in a browser. Do not assert a measured root cause until profiling it.

| Location | Observed behavior | Investigation/change |
| --- | --- | --- |
| `ClubTaskBoard.jsx`: `handleInlineTaskPatch` | Live updates await `updateClubTask` before `applyServerBoardUpdate`; local/demo updates happen immediately | Make reversible live edits optimistic with explicit pending/error states |
| `ClubTaskBoard.jsx`: `applyServerBoardUpdate` | Replaces multiple task/section arrays from mutation responses | Prevent late snapshots from overwriting newer local or acknowledged changes |
| `ClubTaskBoard.jsx`: `actionBusy` | Shared busy flag is used by several unrelated operations | Scope pending state to the affected form, row, field, or batch |
| `ClubTaskBoard.jsx`: `loadBoard` | Loads tasks and people together with `Promise.all`; has a load-sequence guard | Check whether ancillary people data delays board readiness; coordinate loads with mutations |
| `ClubTaskBoard.jsx`: `handleClearCompletedPersonal` | Deletes tasks sequentially, then applies the latest successful response | Show immediate scoped progress; handle partial failures honestly; inspect round trips |
| `workspaceClient.js`: `workspaceRequest` | Auth bootstrap, backend request, optional auth refresh/retry, then direct Supabase fallback | Measure each stage rather than assuming rendering is the only bottleneck |
| `client.js`: `fetchActionJSON` | Resolves an API base before request, then parses response | Inspect availability probes/cache behavior and failure paths |
| `supabaseDirectTasksAndPolls.js` | Several mutations return a rebuilt task-board response | Separate persistence time from follow-up board hydration when profiling |
| Task row controls | Status/priority badges appear conditionally; completion changes active/completed grouping | Prevent incidental movement and manage intentional row transitions |
| Shared `Button` | Fixed size classes, but no complete stable pending-label contract in the inspected implementation | Add consistent pending states and reserved content geometry |
| `TimePickerSelect.jsx` | Custom outer popover contains native hour/minute/AM-PM selects | Migrate the inner controls as well as ordinary page selects |

Native `<select>` elements were found in these components:

- `ClubTaskBoard.jsx`, `TaskModal.jsx`, `AvailabilityView.jsx`.
- `CalendarView.jsx`, `CalendarSyncModal.jsx`, `TimePickerSelect.jsx`.
- `ClubsHub.jsx`, `ClubRbacPanel.jsx`, `LinksResources.jsx`.
- `SettingsView.jsx`, `IntegrationsPanel.jsx`, `TargetedAnnouncementModal.jsx`.

Re-run the inventory before implementation; the repository may have changed. Also check native `<datalist>` popups and custom controls that accidentally delegate their visible selection UI to the browser.

## 3. Interaction performance requirements

### 3.1 Immediate response

- Every enabled activation must receive visible acknowledgement without waiting for network completion. Target the next paint and, on the tested environment, less than 100ms from activation to visible feedback for common interactions.
- Ordinary menu/disclosure opens, tab switches, and local filters must update locally. Do not gate them on a fetch.
- Reversible inline task changes should show the requested value immediately, with a restrained saving indicator until acknowledged.
- Critical feedback must use urgent React state updates. Do not place the selected value or initial pending indicator inside a deferred transition.
- Preserve pressed/hover/focus feedback. Use color, background, opacity, or an inset ring; do not scale or translate the button on press.
- Do not add artificial delays, debounce ordinary clicks, or hold the UI in a loading state just to show an animation.
- A success notification must represent confirmed success. Optimistic selection may appear immediately, but it must not be described as saved until confirmed.
- If a request takes more than about one second, the affected area must still make it clear what is pending. Use reserved inline status or an existing non-layout-shifting notification area.
- Network failure must not strand controls in loading/disabled state. Always settle pending state with `try/catch/finally` or an equivalent robust lifecycle, including thrown exceptions as well as `{ ok: false }` responses.

### 3.2 Profile before broad optimization

Instrument a representative task completion, status change, priority change, modal save, club switch, and dropdown opening. Capture:

1. Activation timestamp.
2. First visible acknowledgement/optimistic paint.
3. Request start and auth/API-discovery stages where relevant.
4. Server/direct-client response arrival.
5. Reconciliation completion and subsequent paint.

Use browser performance/network tools and React profiling where available. Distinguish main-thread work, network latency, auth/probing overhead, and response-driven rerenders. Profile a realistic populated board using safe fixtures. Do not infer performance solely from the immediate demo path.

Only optimize expensive filtering, sorting, derived data, or row rendering when profiling supports it. Preserve stable keys and object identity where useful; memoize row boundaries selectively. Do not add `useMemo`/`useCallback` everywhere or introduce virtualization without evidence of a large-list problem.

## 4. Task mutation model and correctness

### 4.1 Scope state correctly

Introduce a small reusable task-mutation hook/helper if it improves clarity. Keep business rules in their existing locations. Track pending state by authenticated account/session, club, entity, and operation rather than one board-wide boolean.

For example, maintain confirmed entity state plus a small set of optimistic overlays and operation metadata. An operation should capture its own club/task identifiers and session generation before awaiting anything; do not read a different selected club from mutable state when its response arrives.

- A task A update must not disable task B or prevent opening a menu elsewhere.
- A form submission may disable its own submit button to prevent duplicates while leaving unrelated navigation available.
- A batch action may lock its targeted entities, but not the entire application.
- Coalesce equivalent reads/auth bootstrap where safe. Never share private cache state across accounts.

### 4.2 Which actions update optimistically

| Action | Immediate UI behavior | Persistence/failure rule |
| --- | --- | --- |
| Status, priority, personal completion | Apply requested value immediately; show scoped pending state | Reconcile confirmed value; restore affected prior value on definite rejection |
| Club completion for current user | Update only current user's completion membership | Preserve all other users' completion records and aggregate semantics |
| Inline rename | Keep entered title visible and show saving state | Keep recoverable edit/draft on failure; prevent Enter and blur from submitting twice |
| Filter/view/club selector | Update selection and open state immediately | Fetch data separately; never show old club data as though it belongs to the new club |
| Modal create/save | Show saving state immediately in a stable-size submit control | Default to keeping form/draft until success; temporary optimistic rows only if reliable reconciliation is implemented |
| Delete/clear completed | Show immediate per-row/batch pending state after existing confirmation | Prefer confirmed removal unless a complete optimistic restore path exists; report partial failures accurately |
| External reminder/share | Show sending/opening state immediately | Do not claim delivery optimistically or automatically retry possibly-sent messages |

Do not force all actions into the same optimistic behavior. Immediate acknowledgement is universal; optimistic data changes depend on reversibility and correctness.

### 4.3 Repeated clicks and out-of-order responses

Explicitly implement and test concurrency behavior. Choose a simple safe policy rather than leaving it accidental:

- For absolute field values such as priority/status, serialize writes per entity and coalesce queued changes to the latest intended value when appropriate. Render the latest intended value immediately.
- For toggle-only API operations, do not fire uncontrolled parallel toggles or blindly retry. Serialize/coalesce desired state against confirmed state, or temporarily lock only that toggle with visible pending feedback. Preserve the distinction between absolute set operations and non-idempotent toggles.
- Mutations for unrelated tasks may run concurrently.
- Assign local operation sequence/generation identifiers. Older responses must not overwrite newer user intent, including after the newer operation has already been acknowledged.
- Whole-board mutation responses require special care: merging a stale full snapshot can revert unrelated task edits. Apply the relevant entity result, preserve newer confirmed/optimistic changes, and perform a guarded refresh after operations settle if needed. A request sequence alone is insufficient if the payload includes snapshots of other concurrently modified entities.
- Coordinate read refreshes with pending mutations. A load started before a mutation must not erase its result when it finishes later.
- On switching clubs/accounts, late responses may update only their correctly scoped cache or be ignored. They must never update the currently visible wrong board, resurrect signed-out data, or close another form.
- Rollback only fields affected by the failed operation; never restore an entire old board snapshot over unrelated changes.
- If the server cannot establish whether an operation committed after a connection failure, treat the outcome as unknown and reconcile before offering a potentially duplicate retry. Do not falsely claim definitive rollback.
- On permission errors, remove rejected optimistic effects, preserve recoverable drafts where appropriate, and refresh authoritative permission state. UI optimism must never bypass backend authorization.

### 4.4 Network-path improvements

Profile the real configured request route before changing `client.js`, `workspaceClient.js`, or the direct Supabase adapter.

- Check for repeated backend availability probes, repeated auth bootstrap, unnecessary full-board reads after each mutation, and nonessential serial requests.
- Preserve the intentional Express/direct-Supabase fallback and auth-refresh logic. Do not route directly to a backend just because an earlier request once failed.
- Any capability cache needs bounded expiry, configuration/account scoping where applicable, and a recovery/invalidation path.
- Avoid reloading the whole board or people directory after every tiny mutation when the response provides enough authoritative data.
- If independent people/group metadata delays initial board content, separate its loading lifecycle while keeping actions that require that metadata correctly gated.
- Optimize batch deletion only with correct partial-failure tracking. Bounded concurrency may be appropriate; do not launch an unbounded request burst or apply each returned whole-board snapshot indiscriminately.
- Do not add automatic retries for create/delete/toggle/external-send operations without an idempotency or reconciliation strategy.
- Aborting a request on unmount does not undo server work. Treat uncertain outcomes correctly.
- Preserve existing API contracts where possible. If a contract change is demonstrably necessary, implement compatible server/client coverage and tests; do not redesign the backend for perceived latency alone.

## 5. Stable size and position requirements

### 5.1 Shared button contract

Extend the existing shared button primitive with a documented pending-state contract, such as `pending`, `pendingLabel`, and a way to reserve finite state labels. Reuse it for affected local buttons instead of inventing several incompatible spinner patterns.

- The rendered button border box must retain its width/height across idle, hover, pressed, pending, success, failure, and disabled states at a fixed viewport.
- Reserve space for the longest known label/state using a CSS grid overlay or a bounded content slot. Hidden measuring labels must be `aria-hidden` and must not create duplicate accessible text.
- Reserve the icon/spinner slot. Swap within it rather than inserting a spinner that pushes the label and surrounding controls.
- Preserve padding and border width across states. Use a transparent border at rest if needed; use outline/box-shadow for focus without changing layout dimensions.
- Do not use `transition-all` on controls where it animates geometry. Restrict transitions to intended properties.
- Avoid making all buttons the same fixed width. Size each control to its purpose and responsive container; use controlled widths for finite state choices.
- Preserve visible labels and valid accessible names during pending state. Expose busy state without repeated screen-reader spam.
- For controls that must retain focus while temporarily inactive, use a deliberate `aria-disabled` pattern with handler guards where appropriate; use native disabled behavior when appropriate. Do not rely on appearance alone to prevent duplicate submissions.

### 5.2 Toolbars and rows

- Use stable grid/flex slots for task status, priority, due date, and row actions. A new badge or a longer selected value must not push the completion/edit buttons to another line.
- Keep a bounded label area in dropdown triggers, with a reserved chevron and clear-button slot. Selected values may truncate visually inside that area; full labels remain accessible in the popup/detail view.
- Reserve reasonable space for finite status/priority labels using their longest values. Do not reserve unlimited width for arbitrary user-generated club names.
- Count badges use tabular numerals and enough space for ordinary digit changes; keep oversized counts from displacing main actions.
- Place saving/error status in a reserved row slot or a non-layout-shifting notification area. Do not prepend a new banner above the button just activated.
- Keep row keys stable by entity ID, not index, label, status, or pending flag. Avoid replacing a whole row/control subtree merely to show a spinner.
- Preserve scroll and focus during background refresh. Do not remount the board or replace existing rows with a skeleton for a small edit.
- Opening a menu/popover overlays content and must not insert space into the document. Scroll locking must not move the page horizontally; use stable scrollbar handling where necessary.
- Forms that replace a create button with cancel/save controls should use a stable action region, not unpredictably shift neighboring controls.

### 5.3 Intentional structural changes

Stable controls do not mean the page can never reflow. Resizing a viewport, expanding details, adding/deleting a row, and applying a filter can intentionally change layout.

Handle task completion explicitly: checking an item should update in place immediately. Keep its row mounted and in its current position while the mutation is pending; do not remove/reinsert it with every optimistic/server snapshot. After confirmation, a task may move into the completed group or leave an active-only filter as the workflow requires. Make that a single deliberate transition, with sensible focus placement if the focused control disappears. Do not add arbitrary delays to simulate stability or keep stale rows indefinitely.

For operations that change sort order, keep the action target stable through the interaction and reconcile ordering deliberately after settlement. Opening and choosing a dropdown option should not move the trigger while the popup is open.

## 6. Custom dropdown system

### 6.1 Scope and appearance

Replace visible app-owned native selection dropdowns throughout `src/components`, including nested selects inside time controls. CSS `appearance: none` on a native select does not satisfy this requirement. Do not retain native selects only on mobile.

This brief concerns option-selection dropdowns and action menus. OS file choosers, browser permission dialogs, and date-calendar pickers are not required to be redesigned. Existing native date inputs may remain unless they directly prevent the requested behavior; do not expand into a full custom date-picker project without need. A hidden noninteractive form value is acceptable, but no native popup should be exposed for migrated dropdowns.

Use existing surface/background/text/border tokens, rounded corners consistent with the app, restrained shadow, clear hover/focus/selection, and consistent vertical rhythm. Support light/dark themes and reduced motion. Use checkmarks or another non-color-only selection indicator. Reuse established action-menu foundations where suitable, but keep action menus and value-selection semantics distinct.

### 6.2 Shared component API

Prefer one reusable custom select/combobox foundation, perhaps in a dedicated `src/components/Select.jsx` rather than growing an already large shared file indefinitely. Extend existing components where practical. Inspect installed dependencies before choosing an implementation; reuse an established accessible primitive if available. Add a dependency only when justified by actual positioning/accessibility needs.

Support:

- Controlled `value`/`onValueChange`, stable option IDs, label, optional description/icon/group, disabled options, and placeholder.
- A field label/accessible name, error/helper association, disabled/read-only/busy state, and required-value validation.
- Search mode, search placeholder, empty/no-results/loading states, and a configurable search predicate for domain-specific metadata.
- Bounded trigger width, menu min/max width, maximum height, placement/collision handling, and a reserved clear control where allowed.
- Existing form value/name semantics. If replacing a required `<select>`, explicitly preserve validation, focus-on-error, and submission values. A hidden input alone does not enforce required validation.
- Preserve typed IDs and sentinel values (`all`, empty, etc.) consistently; do not accidentally convert numbers, lose unknown saved values, or substitute the first option silently.
- Options that load later, options that disappear after permission changes, and selected values absent from current filtered results.
- Multi-select only for existing multi-selection workflows; do not turn all selectors into chips or change selection semantics.

Adapt call sites deliberately from `event.target.value` to the shared value callback. Do not pass fake DOM events throughout the new API just to avoid updating handlers.

### 6.3 When to include search

| Selector | Search behavior |
| --- | --- |
| Clubs, people, assignees, groups, resources/channels with long lists | Search enabled; match relevant names and safe visible metadata |
| Poll selector or task sections | Search when the full option set is substantial; default threshold about 8–10 options |
| Status, priority, theme, density, short view modes | No search box; use custom select or a suitable existing segmented control |
| Hour/minute/AM-PM | Custom compact controls; no pointless search for AM/PM; retain exact minute values and 12/24h behavior |
| Large dynamic lists | Filter locally when loaded; use existing remote-search support only when available and needed |

Compute whether search is shown from the full option set, not the filtered results, so it does not disappear while typing. Keep local filtering immediate; debounce only actual remote searches when useful, cancel/ignore stale responses, and preserve the user's query while results arrive. Search queries for a popup may reset on close, but selected values and page filters must not reset accidentally.

Display a clear `No matches` state and an accessible clear-search action. Do not silently clear the current selection when filtering excludes it. Do not automatically select the first match on blur or close.

### 6.4 Interaction and accessibility

Implement an established select-only or editable combobox/listbox pattern appropriate to the control. Verify current primary accessibility guidance if implementing the behavior from scratch.

- Open on normal click/tap and keyboard activation; reflect expanded state immediately.
- Arrow keys navigate options; Enter chooses; Escape closes without changing the value; Home/End and typeahead behave appropriately for the pattern.
- In a searchable combobox, printable keys edit the query and the input retains the correct focus/active-descendant relationship.
- If focus stays on the input/trigger, use `aria-activedescendant` correctly with stable rendered option IDs. If using roving focus, implement that pattern consistently instead.
- Selected and keyboard-highlighted options are distinct. Disabled options are announced and cannot be selected.
- Tab must not trap users in an ordinary dropdown. Closing on outside pointer interaction must not prevent the pointer target from receiving its intended click.
- On Escape/selection, return focus appropriately to the trigger; on Tab/outside click, do not forcibly steal focus back.
- Nested popups in dialogs must close one layer at a time; Escape on an open select must not also close the containing task modal.
- Portaled dropdowns must work with parent focus containment, outside-click detection, z-index, and scroll containers. Do not let the parent dismiss when interacting with a child popup.
- Keep the active option scrolled into view without scrolling the whole page or moving the trigger.
- Provide a real accessible label; placeholder text alone is insufficient.
- On mobile, use the same custom system. Position above/below the trigger with collision handling; a searchable sheet may be used for long lists if it preserves the same selection contract and correct dialog semantics. Account for the visual viewport and keyboard.
- Menus must not clip under card overflow or exceed the viewport. Anchor updates on scroll/resize should keep the trigger stationary.
- Avoid arbitrary focus timers and blur workarounds that cause first-click misses, double activation, or lost selections.

## 7. Implementation sequence

### Pass A — diagnosis and inventory

1. Inspect current changes and existing UI primitives/helpers.
2. Inventory native selects/datalists, their option sizes, validation, and domain handlers.
3. Measure task-board interaction timing, including a live-compatible mocked slow request rather than only demo mode.
4. Record button/neighbor bounding boxes through idle, pending, and settled states.
5. Document the smallest supported mutation-concurrency policy before implementing it.

### Pass B — stable shared controls

Files: `src/components/ui.jsx`, `src/index.css`, a shared select/popover module if needed.

1. Add the stable pending-button contract and bounded icon/label slots.
2. Build or extend the custom select/combobox and popup positioning/focus behavior.
3. Verify simple, searchable, disabled, empty, loading, long-label, and modal-contained examples before mass migration.
4. Integrate mobile touch sizing and theme/reduced-motion behavior.

### Pass C — task-board responsiveness

Files: `src/components/ClubTaskBoard.jsx`, `src/components/TaskModal.jsx`, narrowly scoped mutation helper/tests.

1. Add per-entity pending tracking and immediate optimistic inline changes.
2. Implement scoped reconciliation, rollback, repeated-click policy, and late-response guards.
3. Replace broad busy locks where they block unrelated work; preserve duplicate-submit prevention.
4. Keep pending task rows and action slots stable; handle completion/filter movement deliberately.
5. Fix Enter/blur duplicate rename submissions if present.
6. Replace task/section/club/status/priority/assignee native selectors with the shared custom controls.
7. Improve actual request overhead only where measured; include API adapter/server changes only when necessary and compatible.

### Pass D — remaining dropdowns and stateful controls

Migrate all remaining native selects in the inventory: availability, calendar/sync, clubs/RBAC, resources, settings, integrations, announcement targeting, and the inner time-picker controls.

Preserve option labels, sentinel values, role filtering, validation, selected state, and saved preferences. Reuse searchable controls for long lists rather than building page-specific search popups. Keep short choices simple.

Audit other asynchronous buttons in those pages for delayed acknowledgement and changing geometry. Apply the shared pending contract without forcing optimistic updates onto external sends or destructive operations. Keep errors and busy indicators in reserved positions.

### Pass E — verification and reporting

Run the tests and visual/interaction checks below. Compare timings and geometry against the baseline. Fix regressions rather than merely documenting obvious broken migrated controls.

## 8. Test and acceptance plan

### 8.1 Timing and geometry

- Measure at least task completion, status, priority, modal save, and opening a searchable club selector.
- Test normal mocked latency, 3-second latency, network rejection, thrown exception, and intentionally out-of-order responses.
- Target initial feedback under 100ms and ordinary custom-menu opening under 100ms on the measured environment. Report actual measurements; do not promise these numbers for every device/network.
- For state-only changes, assert button and neighboring control bounding-box position/size changes are at most approximately 1 CSS pixel at a fixed viewport. Test short/long labels, spinner swaps, selection labels, and count changes.
- Do not use global CLS alone: layout shifts after user input can be excluded from that metric. Compare element geometry directly and inspect recordings.
- Confirm slow requests leave unrelated rows/actions usable and do not blank/remount the board.
- Verify initial feedback is visible under main-thread stress as well as slow networking; a state setter that cannot paint for seconds is not a solution.

### 8.2 Mutation correctness cases

- Complete/uncomplete one task; verify personal status and per-user club completion semantics separately.
- Change the same status/priority rapidly; final UI and server state match the final accepted intent without stale rollback.
- Update task A and task B concurrently with reversed response order; neither result disappears.
- Fail one operation while another succeeds; only the failed operation's changes are reverted.
- Finish an old board refresh after a mutation; confirmed/optimistic changes are not lost.
- Switch clubs while a request is pending; the response never appears in the new club.
- Sign out/change account while pending; old private data does not reappear.
- Return 403 during an optimistic edit; permissions and UI reconcile correctly.
- Complete a task in an active-only view; pending row stays stable, then removal/focus behavior is intentional.
- Trigger rename with Enter followed by blur; at most one mutation occurs for the same edit.
- Partially fail clear-completed; keep failed items, remove successful items, and report counts accurately.
- Simulate an ambiguous network failure after a server commit; reconciliation avoids double toggle/create/send.

### 8.3 Dropdown cases

- No visible native select popup remains in the migrated app views, including mobile and the time picker.
- Simple/select-only and searchable variants both work by pointer, touch, and keyboard.
- Search handles no matches, clearing, accented/case variations where supported, long labels, groups, disabled options, and delayed results.
- Selection survives filtering; closing without choosing does not change values.
- Required fields still block invalid submissions and focus a visible control on error.
- Popup opening/closing/selection never shifts the trigger or adjacent toolbar controls.
- Nested dropdowns remain inside the effective dialog interaction layer; Escape dismisses only the top layer.
- Screen-reader name/role/value and selected/expanded/disabled state are correct. Run automated accessibility checks where available and manually verify keyboard behavior.

### 8.4 Viewports and existing checks

Verify 1440×900, 1280×720, 768×1024, 390×844, and 320×568, plus responsive breakpoint boundaries. Use long titles/options and populated lists. Check light/dark, comfortable/compact, and reduced motion. Test at least the task-board workflow and searchable dropdown in a narrow viewport with the virtual keyboard visible when tooling permits.

Run `npm test` and `npm run build`. Add meaningful behavior tests for the mutation reconciliation and dropdown keyboard/focus contracts using existing infrastructure where practical. Unlike a purely visual spacing change, this work changes state coordination and warrants concurrency/failure tests. Avoid tests that only assert CSS class names or mock away the core race being tested.

If browser automation is unavailable, finish source/unit verification and clearly identify unverified visual behaviors. Never fabricate screenshots or latency measurements.

## 9. Deliverables and completion criteria

Deliver the implementation plus a concise Markdown report covering:

1. Measured causes of delayed task feedback, distinguishing evidence from hypotheses.
2. The chosen optimistic/concurrency policy and handling of failures, retries, permission changes, and stale responses.
3. Before/after activation-to-feedback timings and fixed-viewport geometry measurements.
4. Dropdown migration coverage, search-enabled selectors, and any intentionally excluded system UI.
5. Test/build results, keyboard/mobile/theme checks, and remaining limitations.
6. Links to relevant screenshots/recordings/test artifacts where available.

Complete only when enabled actions visibly acknowledge input immediately, common reversible task edits no longer wait on the server to appear, state changes do not cause incidental control jumps, and app-owned option dropdowns use the custom accessible system. Preserve all existing domain behavior and the user's ongoing changes.
