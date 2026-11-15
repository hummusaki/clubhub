# ClubHub UI density and intentional actions — implementation brief

## Instructions for the implementing agent

Implement the changes in this document in the existing ClubHub repository. This is an implementation assignment, not a request for another plan. Inspect the current code, implement the changes, verify them, and report the result. Use judgment for routine layout choices; ask only if a material ambiguity cannot be resolved from the repository or this brief.

Read applicable `AGENTS.md` instructions before editing. Inspect `git status` and the current source. At the time this brief was prepared, many frontend files already had uncommitted changes. Treat those changes as the user's work: build on them, do not reset, overwrite, or revert them. File descriptions below refer to the inspected source and may have evolved. Resolve symbols and behavior from the current files rather than relying on old line numbers.

Work in the existing checkout unless instructed otherwise. Do not deploy, push, change backend contracts, alter production data, send messages, connect external accounts, or run data-collection/sync jobs for this task. Do not add dependencies unless existing tools and components genuinely cannot support the required interaction. Do not introduce a design-system rewrite or unrelated cleanup.

Complete the requested UI changes. If browser verification or a particular signed-in state is unavailable, complete what can be verified and clearly identify the remaining limitation. Never report screenshots, measurements, or interactions as tested unless actually observed.

## 1. Outcome and scope

Make the desktop UI use vertical space more efficiently; make mobile layouts use both dimensions efficiently; make buttons purposeful, specific, and proportionate to their importance.

The intended outcome is an application where useful information appears earlier, common tasks require fewer competing decisions, and secondary controls do not dominate the content. Achieve density by removing repetition, improving grouping, and revealing detail when needed. Do not achieve it by shrinking everything.

Primary scope:

- Shared app shell, page headings, spacing, buttons, and action menus.
- Overview and its embedded summaries.
- Task board, calendar, availability polls, clubs/community, and resources.
- Settings, integrations, and dialogs where affected by shared changes or where an existing action is relocated.

Keep the current Material-style visual identity, theme tokens, fonts, icon library, and basic navigation structure. Preserve all meaningful existing workflows. Authentication screens need only regression checks for shared component changes; redesigning sign-in is outside scope.

## 2. Current implementation observations

These are source observations, not measured browser findings. Capture actual rendered baselines before choosing final spacing.

| Area | Observed structure | Consequence to address |
| --- | --- | --- |
| App shell | Fixed 64px top bar; 256px desktop sidebar; page padding; separate in-flow heading | Page-specific toolbars often become another stacked header |
| Overview | Heading, four stat tiles, AI search/advisor card, then events and announcements | Multiple introductory layers precede actionable content |
| Overview shortcut | Large availability navigation card despite availability already being in primary navigation | A repeated navigation action occupies a full section |
| Header utilities | Theme, notifications, settings, and account controls | Settings also appears in the sidebar and account menu |
| Mobile navigation | Six labeled bottom-navigation items below the `lg` breakpoint | Width and bottom clearance require narrow-screen verification |
| Task board | Club rail, club identity, actions, view controls, focus/filter controls, optional reminder settings | Header height can grow substantially before tasks appear |
| Calendar | View/filter controls plus separate Google, Apple, and sync settings actions | Integration configuration competes with calendar use |
| Polls | Wrapping poll buttons, week navigation, sharing methods, lifecycle actions | Many actions compete before the availability grid |
| Clubs | Six section tabs, layout controls, category controls, padded cards | Nested structure and controls consume mobile space |
| Shared buttons | Several variants and 32/40/44px sizes; many locally styled buttons | Visual hierarchy and touch sizing are inconsistent |
| Interactive surfaces | Some navigation is implemented with clickable `div` elements | Keyboard and semantic behavior must be corrected during consolidation |

There are existing mobile-specific calendar and availability layouts. Improve them rather than replacing them blindly. The task board already has conditional advanced filters and permission-aware controls; retain that behavior.

## 3. Non-negotiable behavioral constraints

- Preserve guest, signed-in member, officer/board, and poll-creator distinctions. Moving a control must not grant access or remove checks.
- Keep personal tasks separate from club tasks. Do not turn multiple task scopes into an ambiguous generic creation action.
- Preserve joined-club filtering, RSVP state, task assignments, subgroup targeting, reminders, poll responses, calendar bookings, and resource pinning/editing.
- Preserve existing navigation intents, deep links, selected club/poll context, query state, and browser history behavior where present.
- Preserve saved user preferences, including compact density, calendar view, theme, filters, and reduced motion. Do not silently overwrite explicit preferences.
- Keep standard search distinct from AI club discovery. Opening AI must not replace the standard search behavior or discard an active query.
- Collapsing a panel or resizing the viewport must not clear form drafts, AI conversations, selected filters, or pending edits.
- Menus and sheets must invoke the existing handlers. Do not reimplement business logic simply to relocate its controls.
- Keep existing confirmations for destructive actions. Do not add confirmation dialogs to routine reversible actions.
- Preserve clear loading, saving, disabled, error, success, and empty states.
- Do not edit real user data for screenshots. Use existing safe preview states or isolated test fixtures when necessary; never add fabricated production records.

## 4. Layout and visual guidelines

### 4.1 Density targets

Use these as starting values, then validate visually. They are not permission to force fixed heights on wrapping content.

| Element | Desktop starting point | Mobile starting point |
| --- | --- | --- |
| Horizontal page gutter | 24px; 20px on tighter desktop layouts if needed | 12px, increasing to 16px where space permits |
| Top content gap below app bar | 16px | 12px |
| Gap between major sections | 16px | 12px |
| Standard card padding | 16px | 12px |
| Gap within related controls | 8px | 8px |
| Dense list-row vertical padding | 8–12px | 10–12px, with touch targets preserved |
| Page-title text | 22–24px | 20–22px |
| Standard action visual height | 36–40px for pointer use | At least 44px interactive height |
| Compact-mode adjustment | Reduce decorative padding/gaps modestly | Reduce decorative padding/gaps, never touch targets |

Create a small, understandable spacing system in `src/index.css` and/or shared layout components. Use existing theme variables. Avoid scattered one-off values and broad selectors that unexpectedly compress all content.

Retain readable text sizes: generally 14px for primary body text, 12px or more for secondary metadata, and 16px for mobile text inputs. Do not shrink already-small navigation labels to make them fit. Do not use clipping or `overflow-x: hidden` as a substitute for fixing a layout overflow.

### 4.2 Page hierarchy

- Each page has one page heading and one clear primary action when a creation/action workflow exists. Read-only or discovery pages do not need an invented primary button.
- On desktop, align title, compact context, and primary action in a shared toolbar. Put search, view controls, and filters on one supporting row when necessary.
- On mobile, aim for a heading/action row plus one search/filter row. Exceptionally narrow screens may use an additional row rather than truncate an essential action.
- Remove subtitles that merely repeat the title. Keep specific instructions where needed, especially poll interaction and unusual empty states.
- Remove redundant outer surfaces when a card is only a padded wrapper around an entire page of other cards. Preserve real grouping and contrast; do not flatten unrelated content indiscriminately.
- A parent owns section spacing. Child components should not also add unrelated external margins.
- Status, counts, and permissions should be compact metadata, not large button-shaped elements unless interactive.
- Keep comparable list rows aligned and stable. Avoid hover-only layout changes and hover-only access to actions.
- Use desktop columns where they improve scanning, but do not force two columns when the available content width makes both cramped. Account for the sidebar when deciding breakpoints.

### 4.3 Mobile behavior

- Design mobile composition explicitly; do not just let desktop action clusters wrap into many rows.
- Keep high-frequency actions visible. Put low-frequency configuration and secondary filters behind labeled controls.
- Prefer compact list rows for clubs/resources. Keep identity, title, key status, and the most relevant action visible; disclose long descriptions and optional metadata on expansion/detail view.
- Keep task title, status, and deadline visible. Reveal extended assignment/reminder metadata in task detail or expansion when needed.
- Make important labels wrap naturally. Truncate secondary metadata only when the full value is available in an accessible detail view; a mouse-only tooltip is insufficient.
- Keep the six existing primary mobile destinations unless actual testing proves they cannot fit with readable labels and 44px-wide targets at 320px. First reduce decoration and utility clutter. Do not silently drop polls or resources from navigation.
- Horizontal scrolling is acceptable only within intentional bounded controls or inherently two-dimensional content. The page itself must not scroll horizontally. Do not hide every meaningful tab in a scroll rail without a discoverability cue.
- Preserve safe-area insets. Derive bottom content clearance from the actual bottom bar height plus safe area and a small gap; synchronize toast offsets with the revised navigation.
- Do not add a floating action button on top of an existing primary action or stack multiple sticky toolbars over content.
- Forms/dialogs must remain usable with the keyboard open. Use a bounded `dvh`-aware dialog, one principal scrolling body, and reachable actions. Sticky actions must not obscure the focused input or final field.

## 5. Button and action rules

### 5.1 Decide whether a control deserves to exist

Audit each visible action cluster and classify each control as: keep prominent, keep secondary, move into a named menu, replace with status, merge with an equivalent action, relabel, or remove a true duplicate.

Remove a control only when its behavior is redundant in the same context, it has no useful effect, or its action remains clearly accessible through the replacement. A shortcut can be useful even if the destination also exists in navigation; evaluate whether it saves a meaningful step. Do not delete distinct capabilities just to reduce the button count.

For every consolidated action, retain an obvious path to it. Do not hide common actions such as RSVP, joining a club, saving a task, or marking availability in an overflow menu.

### 5.2 Visual hierarchy and language

- Use a filled button for the main action within the current page, dialog, or actionable empty state. Avoid several filled buttons competing in the same toolbar. Repeated item-level actions may use quieter styles.
- Use outlined/tonal buttons for meaningful secondary actions and text treatment for low-emphasis navigation or cancellation.
- Use plain text/badges for status. A connected provider label must not look like a button if it does nothing.
- Use a verb plus object: `Share poll`, `Calendar sync`, `Create club task`, `Add personal task`, `Add resource`, `Browse clubs`.
- Avoid standalone `Open`, `Manage`, `Try`, `More`, or provider names when they obscure the action. When a generic overflow icon is appropriate, give it a specific accessible name, such as `Poll actions`.
- In a page context, concise labels are welcome; do not repeat the entire section title in every button.
- Keep toggles visually and semantically distinct from commands. Show selection with more than color where possible.
- Icon-only controls are reserved for familiar utilities such as close, previous/next, search, or overflow. Give every one an accessible name and, where useful, a tooltip.
- Do not put a primary filled action on a whole card and repeat it as a button inside the same clickable surface.

### 5.3 Concrete action changes

| Existing pattern | Required treatment | Behavior to preserve |
| --- | --- | --- |
| Settings in top bar, sidebar, account menu | Remove top-bar gear; keep desktop sidebar and account-menu access | Settings remains reachable on mobile, including guest contexts |
| Persistent theme button | Move to account menu; settings remains another route | Current theme preference and instant switching |
| Calendar Google/Apple/Sync Settings controls | One `Calendar sync` entry point to the existing sync dialog | Provider setup, subscription/export options, connected status, failure feedback |
| Poll copy-link/Discord/email controls | One `Share poll` menu with `Copy invite link`, `Share to Discord`, `Share by email` | Existing actual send/open behavior, permission checks, busy states, feedback |
| Poll archive/unarchive/delete cluster | `Poll actions` menu, separated from sharing | Creator restrictions, archive recovery, existing deletion confirmation |
| Task reminders/roster configuration | Secondary action group or specifically labeled menu | Reminder counts/status and routes to roles/groups remain discoverable |
| Multiple task creation scopes | Keep explicit context-specific labels and destinations | Personal vs. club ownership and board restrictions |
| `All Grid` in clubs | `Grid view` | Existing grouping/category behavior |
| Overview availability promotional card | Small `Find a meeting time` navigation link | Opens existing availability workflow; does not create a poll automatically |
| AI prompts `Try`/`Hide` and separate collapse controls | Clear `Example prompts` disclosure and one consistent panel close/collapse action | Drafts, conversation, prompts, results, and configuration remain available |
| Noninteractive tiles with interactive hover styling | Remove misleading interactive treatment | Actual navigable stats remain accessible |

### 5.4 Accessibility and component contracts

- Use buttons for commands and links for actual navigable URLs. App-state navigation without a URL may remain a semantic button consistent with the current router approach.
- Replace clickable `div` navigation surfaces in touched components. Do not nest interactive controls inside buttons or links. For cards with multiple actions, make the title the navigation target and keep other buttons separate.
- Ensure Enter/Space activation as appropriate, visible focus, logical tab order, and adequate contrast in both themes.
- Menus/disclosures need accurate `aria-expanded` and associated controls. Implement keyboard semantics consistent with the chosen pattern; do not apply ARIA menu roles without the corresponding keyboard behavior.
- Dialogs/sheets must have accessible names, focus entry, focus containment, Escape dismissal, and focus return. Closing a disclosure must not leave focus on a hidden element.
- Preserve pending/loading state and avoid duplicate submissions. Communicate disabled reasons where the reason is not obvious.
- Target at least 44×44px for mobile/coarse-pointer buttons, icons, and filter controls. Larger invisible hit areas must not overlap adjacent controls. Specialized availability-grid cells need a separately usable touch interaction; do not force desktop grid geometry onto mobile.
- Inspect the shared `Button` API before reuse. The inspected implementation accepts `icon`, while some call sites pass `leadingIcon`. Normalize touched call sites or deliberately support a backward-compatible alias; do not leak unsupported props onto DOM elements.
- Add reusable primitives only where there are real repeated consumers, such as a page toolbar, action disclosure, or filter sheet. Prefer the existing modal and button foundations over parallel competing systems.

## 6. File-by-file implementation plan

Paths below are relative to the repository root. Verify current structure first.

### Pass A — baseline and shared foundations

Files: `src/index.css`, `src/components/ui.jsx`, relevant existing shared utilities.

1. Read current changes and identify existing density, theme, menu, modal, and viewport helpers.
2. Capture representative baseline screenshots and record content-start measurements.
3. Add the minimal shared spacing tokens and page-toolbar composition needed by subsequent passes.
4. Standardize button sizing and touch behavior without globally inflating desktop tables or making small embedded controls overflow.
5. Implement/reuse accessible action disclosure and filter-sheet behavior where subsequent pages need it.
6. Fix touched interactive surface semantics and inconsistent button icon props.

Acceptance: existing pages still render; shared changes do not break authentication/settings dialogs; both density modes and themes remain coherent.

### Pass B — shell and page headers

Files: `src/App.jsx`, `src/components/Header.jsx`, `src/components/Sidebar.jsx`, `src/components/ui.jsx` (`ToastViewport`).

1. Separate the fixed app-bar concerns from the in-flow page-heading composition. Keep global search, notifications, and account state wired to existing handlers.
2. Give each page one heading with action slots. Avoid a duplicate heading when a page already has a club/context header.
3. Keep a compact greeting on the overview; other pages use concise titles. Move useful context into the toolbar, not a second large introductory block.
4. Remove the top-bar settings gear and move theme switching into account controls. Ensure a fallback if an account menu is not rendered in a supported guest state.
5. Reduce shell top/gutter spacing using the shared values. Retain the 64px bar and 256px desktop sidebar initially; compress the content stack before changing structural navigation dimensions.
6. Align bottom padding and toast placement with actual mobile navigation height and safe areas.
7. Ensure the keyboard search shortcut focuses the visible search field at mobile and desktop sizes; avoid duplicate refs pointing to a hidden input.

Acceptance: settings/theme/search remain reachable, one visible page heading exists, fixed surfaces do not cover content, and navigation fits the narrowest supported viewport.

### Pass C — overview

Files: `src/App.jsx`, `src/components/StatCards.jsx`, `src/components/AiOverviewSearchBar.jsx`, compact modes of `CalendarView.jsx`, `Announcements.jsx`, `ClubsHub.jsx`, `LinksResources.jsx` as applicable.

Target desktop order: compact page heading/actions → summary strip → events and announcements → compact club/resource previews. Put the small availability link in an appropriate section header or shortcut row without reserving a promotional card.

Target mobile order: compact heading/search → compact summary → upcoming events → announcements → club/resource previews. The idle AI feature must not occupy a large card before events.

1. Replace the four large stat tiles with a concise desktop strip; use a compact two-column summary on narrow mobile widths. Keep labels and counts readable and meaningful.
2. Remove child-owned external margins from the stats component. Keep navigation targets and noninteractive values semantically distinct.
3. Expose `Find clubs with AI` near search or the overview toolbar. Expand the existing AI experience only after explicit interaction.
4. Keep the AI component state stable when collapsed. Do not clear committed turns/drafts or lose in-flight results. Preserve existing standard search results independently.
5. Keep AI configuration inside the expanded experience or its settings; do not display setup controls in the default overview toolbar.
6. Move events/announcements above secondary previews. On desktop use two columns only when the available content width supports readable event rows.
7. Consolidate zero-membership discovery messaging into one actionable overview empty state. Individual widgets may retain concise status text without repeating filled discovery buttons.

Acceptance: default overview reaches real content earlier; AI remains fully usable; active searches and zero-membership states remain understandable.

### Pass D — task board

Files: `src/components/ClubTaskBoard.jsx`, `src/components/TaskModal.jsx`, `src/components/LeadershipShortcutBar.jsx` where affected.

1. Merge page/club identity, compact counts, and the context-appropriate creation action into a compact header.
2. Replace the mobile club rail with one club selector when necessary. On desktop avoid displaying a full rail and duplicate jump selector simultaneously without a demonstrated need.
3. Keep member/board view selection visible to users who have both; treat it as a view control, not a competing primary action.
4. Put focus tabs, search, and a counted `Filters` control into a coherent secondary toolbar. Keep existing advanced-filter conditions and saved preferences.
5. Move reminder configuration and roster/group navigation to secondary controls. Preserve useful reminder counts or a small status indicator.
6. Make mobile task rows prioritize title, status, deadline, and completion. Put secondary details in the existing task detail/expansion workflow. Do not hide the completion action.
7. Keep creation paths explicit: `Create club task` where authorized and `Add personal task` in the personal area. Preserve section defaults and subgroup targeting.
8. Remove repeated section explanation and unnecessary padding without collapsing meaningful task groups.

Acceptance: the first task is visible substantially earlier on populated boards; members cannot acquire board actions; personal tasks remain isolated; filters and selected club survive navigation as before.

### Pass E — calendar and availability

Files: `src/components/CalendarView.jsx`, `src/components/CalendarSyncModal.jsx`, `src/components/AvailabilityView.jsx`, `src/components/TimePickerSelect.jsx` where affected.

Calendar:

1. Compose date navigation, view selection, relevant filters, and the authorized add-event action into no more than two ordinary toolbar rows where width allows.
2. Replace repeated Google/Apple/settings buttons in full and compact views with `Calendar sync`, reusing the existing dialog and handlers. Keep a concise connected state where helpful.
3. On first mobile use, choose agenda only if there is no explicit navigation view or user-selected/saved view. Inspect how default settings are populated: a synthesized default of `month` must not be confused with a deliberate user preference. If explicitness cannot be established safely, preserve the current preference and document that constraint.
4. Do not switch views unexpectedly when the viewport resizes. Preserve explicit calendar navigation from event/AI links.
5. Keep event details and RSVP actions accessible. Preserve current mobile week/day representations and improve their spacing.

Availability:

1. Use a compact selected-poll control; switch to a dropdown on mobile when multiple polls would wrap. Keep `New poll` discoverable.
2. Keep week/day navigation close to the grid. Keep instructions short and specific; do not hide how to mark availability.
3. Consolidate sharing into `Share poll`, with explicitly named destinations and existing busy/error feedback.
4. Consolidate creator-only lifecycle operations into `Poll actions`; retain archive recovery and deletion confirmation.
5. Keep the mobile single-day grid. Reduce duplicated metadata, legends, and padding around it rather than shrinking it into unusable cells.
6. Make participant details and explanatory sections collapsible where helpful. Keep the grid and best meeting windows easy to reach. On wide screens, use a secondary column if it reduces needless vertical stacking without narrowing the grid excessively.
7. Preserve booking/unscheduling flows and participants' data. Creation forms must retain their drafts when an unrelated disclosure changes.

Acceptance: calendar sync and all poll actions remain reachable; grid use works by touch; archive permissions and RSVP/booking behavior remain unchanged.

### Pass F — clubs, resources, and adjacent forms

Files: `src/components/ClubsHub.jsx`, `src/components/LinksResources.jsx`, `src/components/ClubRbacPanel.jsx`, `src/components/IntegrationsPanel.jsx`, `src/components/SettingsView.jsx`, relevant creation/detail dialogs.

1. Remove redundant outer-card padding and repeated headings on full-page views; retain meaningful content sections.
2. Keep the current club section destinations discoverable. Make mobile tabs a clear single-row navigation treatment; avoid stacking multiple category/layout rails below it. Put secondary category/sort/layout controls in a counted filter/options sheet as needed.
3. Relabel `All Grid` as `Grid view`. Preserve the effect of category selection on grouped/grid layouts.
4. Render compact mobile club rows with emblem, name, short metadata, and the useful membership action. Open detailed descriptions/rosters through the title/detail action. Keep join/leave behavior and confirmations intact.
5. Make resources compact rows with title, club/source, type, and relevant pin/edit actions. Use the resource title as its link when appropriate. Remove a separate `Open` button only when it duplicates that exact destination and does not lose behavior.
6. Retain `Add resource` as the clear page action. Keep pinned resources visible without unnecessary duplicate rendering of the same item in adjacent sections.
7. Move optional form fields/settings into clear disclosures only where doing so does not hide required information or validation errors.
8. Ensure settings/integrations still provide the controls relocated from headers. Avoid duplicating an entire settings editor in several pages when a contextual link suffices.
9. Verify all modified dialogs at narrow widths and with the keyboard open. Keep submit/cancel actions inside the active form context.

Acceptance: readable lists fit at 320px, all club sections remain reachable, distinct membership/resource/role operations remain available, and forms do not lose drafts or hide validation.

## 7. Implementation discipline

- Follow the passes in dependency order: shared foundations → shell → overview → task/calendar/poll pages → remaining lists/forms → verification.
- Keep each pass reviewable. Do not reformat entire large JSX files or split them wholesale as part of a spacing change.
- Use React state and CSS responsive behavior; avoid direct DOM manipulation for ordinary layout.
- Do not duplicate mounted stateful forms solely to have separate desktop and mobile markup. Hidden copies can duplicate IDs, handlers, focus targets, and requests.
- Prefer responsive CSS for layout. If viewport-dependent initialization is needed, reuse an existing helper or implement a small safe one; clean up listeners and do not reset user choices on every resize.
- Keep Tailwind classes statically discoverable. Avoid runtime string construction that produces classes omitted from the build.
- Check shared button changes against all consumers, including auth, settings, and modal controls.
- Do not move an action without carrying over its condition, selected state, pending state, disabled state, permission guard, and feedback.
- Distinguish code improvements necessary for this task from unrelated defects. Report unrelated issues instead of expanding scope indefinitely.

## 8. Verification and acceptance

### 8.1 Baseline and measurements

Use the same viewport, user/role, data, scroll position, theme, and density for each before/after comparison. For populated views, measure the vertical position of the first actual event/task/club/resource row or first usable grid cell. A heading, stat tile, loading placeholder, or promotional block does not count as useful content for this measurement.

Record measurements for overview, task board, calendar, and polls. Aim for approximately 25% less vertical space before useful content on the most crowded screens. This is a target, not a reason to remove required information or shrink touch targets. Where the baseline is already efficient, explain the smaller gain. Also compare how many useful rows fit initially and whether action consolidation added unreasonable steps.

### 8.2 Viewport matrix

| Viewport | Primary checks |
| --- | --- |
| 1440×900 | Desktop overview columns, task density, sidebar alignment |
| 1280×720 | Short desktop viewport, toolbar wrapping, first useful content |
| 1024×768 | Desktop navigation breakpoint and available content width |
| 768×1024 | Tablet with bottom navigation, intermediate wrapping |
| 390×844 | Normal mobile workflows, sheets, dialogs, touch controls |
| 320×568 | Narrow/short layout, labels, navigation, no clipped actions |

Inspect around actual responsive breakpoints as well as the named sizes. Test browser zoom/reflow, long club names, long task titles, large counts, and missing optional data. Check both themes and both density settings on representative screens; the most crowded configurations deserve full coverage.

### 8.3 Workflow checks

- Navigate every primary page; verify settings/theme remain accessible on mobile and desktop.
- Use standard search and its keyboard shortcut at mobile and desktop widths.
- Open AI discovery, submit/refine a query when the environment supports it, collapse/reopen it, and verify state retention. Verify unconfigured/error UI without requiring external credentials.
- Join/open a club through an authorized safe test state; verify the row and overview update correctly.
- Create/edit/complete a personal task and an authorized club task in isolated test data; verify permissions and scope.
- Apply/reset task filters, switch clubs, and switch member/board views where authorized.
- Switch calendar views, inspect an event, RSVP in safe test data, and open sync settings. Do not connect accounts or modify external calendars merely to validate the UI.
- Switch/create a poll in safe test data, mark availability, open sharing, and inspect creator actions. Do not actually send Discord/email messages for visual verification.
- Verify the sharing menu invokes the correct existing handlers using mocks or isolated tests where possible.
- Open/add/edit/pin a resource in safe test data; verify links and action separation.
- Exercise keyboard focus, Escape dismissal, focus return, outside click, and mobile touch on each new shared disclosure/sheet.
- Verify no content is hidden behind the top bar, bottom navigation, toasts, modal actions, or virtual keyboard.

### 8.4 Automated checks

Run `npm test` and `npm run build`. Inspect the repository's existing tests before adding coverage. Add focused behavior tests only for genuinely changed logic, such as initial calendar-view precedence or a new menu's interaction behavior, using existing test infrastructure where practical. Do not write brittle tests that merely assert Tailwind class strings or mirror component implementation.

A passing build and unit suite do not establish visual correctness. Perform browser checks when available. If tests already fail before your change, record the baseline failure and distinguish it from regressions rather than quietly ignoring it or repairing unrelated systems.

### 8.5 Final acceptance checklist

- [ ] Useful content starts earlier on the crowded desktop and mobile screens, supported by comparisons.
- [ ] All pages have clear heading/action hierarchy without redundant introductory layers.
- [ ] The idle overview AI experience and availability shortcut no longer occupy large blocks before core content.
- [ ] Settings, theme, calendar sync, sharing, and secondary configuration remain discoverable after consolidation.
- [ ] Frequent actions stay visible; no arbitrary overflow menu becomes a dumping ground for core workflows.
- [ ] Mobile layouts work at 320px without page-level horizontal scrolling or clipped labels/actions.
- [ ] Mobile touch targets and readable text remain intact in both density modes.
- [ ] Permission-dependent behavior, task scopes, saved preferences, drafts, and navigation context are preserved.
- [ ] Touched interactive cards are keyboard accessible and avoid nested interactive elements.
- [ ] Menus, sheets, and dialogs have correct focus and dismissal behavior.
- [ ] Both themes and reduced-motion behavior remain supported.
- [ ] Build/tests and actual visual checks are reported accurately.
- [ ] Existing user changes remain intact; no deployment or external data mutation was performed.

## 9. Deliverables

1. Implemented source changes in the existing repository.
2. A short Markdown implementation report with:
   - What changed by page and why.
   - A compact action audit: removed/merged/relabeled controls and where their capabilities now live.
   - Before/after screenshots or links to local artifacts where browser tooling permits.
   - Measured content-start improvements for the representative screens.
   - Tests/build results and the exact visual/interaction states checked.
   - Any remaining limitations, preference-related exceptions, or deviations from this brief.
3. A concise final response linking the report and the most relevant screenshots/files.

Do not stop after producing another proposal. Implement the brief, verify the result, and report concrete outcomes.
