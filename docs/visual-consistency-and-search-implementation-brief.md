# ClubHub — visual consistency and useful search

## Assignment

Implement the changes in this document against the current ClubHub checkout. This is an implementation brief for an agent, not a request to write another plan. Inspect the relevant source, implement, verify, and report concrete results.

Read applicable repository instructions and preserve all existing uncommitted work. The previous density and responsiveness briefs have already influenced the code; retain their improvements. This brief corrects visual and search problems that remain. It takes precedence where an earlier prescription caused visible empty spinner space, an inconsistent search surface, or redundant AI interfaces.

Do not deploy, push, send external messages, change production membership/claims, run collectors, or expose secrets. Use safe local fixtures and mock responses for mutation verification. Keep role-based access and existing domain behavior intact. Do not redesign the entire application.

## 1. User-reported problems and reference screenshots

The user supplied two screenshots:

1. A dark-mode roster-claim panel with a long technical heading, `Join as Member`, a seat selector and separate custom-title input separated by excessive space, a note field and `Claim Seat` button, and six green checkmarked officer-role chips. The claim button's label appears shifted right by unexplained blank space.
2. A large AI club-search modal with a heading, green `Grounded AI` badge, subtitle, search input, eight emoji prompt chips, a large empty-state panel repeating instructions, and a footer repeating catalog/AI language and a close action.

The user also reports a missing desktop divider between the dashboard's `Upcoming Events` and `Group Polls` stats, search disappearing on several pages, an inconsistent AI discovery entry point between dashboard and other pages, and failure to find Slugs On Wheels for the query `car`.

The screenshots are evidence of visual problems, not a design to reproduce. This document describes them so implementation does not depend on temporary attachment paths.

## 2. Verified source observations

| Area | Observation | Implication |
| --- | --- | --- |
| `ui.jsx`, `Button` | `hasLeading` is true whenever `pending !== undefined`, even if no icon exists and pending is false; a hidden spinner occupies the leading slot | Stability was implemented with a visibly empty left-hand slot; correct the primitive, not just one claim button |
| `ClubRbacPanel.jsx` | Unclaimed roster positions receive green filled chips and a checkmark | Color/icon imply success or selection despite representing available roles |
| `ClubRbacPanel.jsx` / `Select.jsx` | Claim fields use a grid; custom Select applies caller classes to a wrapper | Inspect wrapper sizing/stretch and trigger widths, not just grid gap values |
| `StatCards.jsx` | A 2-column grid becomes 4 columns at `sm`; mobile even-child border removal is combined with desktop overrides | Verify computed border rules and remove breakpoint/specificity ambiguity |
| `Header.jsx` | `showSearch` excludes tasks, availability, and settings | Search is structurally absent on three primary destinations |
| `Header.jsx` | Every non-overview page with search mounts `AiClubAgentModal` | A club-only advisor is presented as if it were relevant to calendar/resources search |
| `App.jsx` | Overview has a separate `Find clubs with AI` action and `AiOverviewSearchBar` | Two discovery UIs have separate presentation/state paths and inconsistent entry points |
| `aiClubAgent.js` | Token matching and curated topic clusters drive local retrieval | Uncovered synonyms can produce no candidates even with a relevant club bio |
| `aiClient.js`, `buildCandidateCatalog` | Local matches are supplemented by walking catalog order until 16 candidates | If retrieval misses the relevant club, arbitrary fallback candidates may keep the generator from seeing it |
| Public catalog | `slugsonwheelsclub` is named `Slugs On Wheels UCSC`; bio identifies it as an automotive club; category is `gaming` | Descriptive evidence must outweigh noisy category labels; do not rely only on category or club name |

### Local reproduction already performed

The pure `recommendClubsForInterests` function was run against the local `public/clubhub-data.json` catalog without remote AI calls:

- On raw catalog records, `car`, `cars`, and `automotive` returned no matches.
- With `description` populated from `bio`, `car` and `cars` still returned no matches, while `automotive` returned `slugsonwheelsclub`.
- An exact-ish name query found the intended club and also similarly named clubs.

These are isolated function checks, not a full browser reproduction of the current transformed `effectiveClubs` pipeline. Reproduce the real UI path too. The evidence identifies both field-normalization and concept-retrieval concerns; do not claim that an unavailable AI provider or one CSS issue explains all problems.

## 3. Design decisions

### 3.1 One consistent global search

Provide one global `Search ClubHub…` field in a consistent location on every main workspace page: overview, tasks, calendar, availability/polls, clubs, resources, and settings.

Choose a genuinely global search contract rather than silently changing the field's meaning on each page. Results appear in a shared result surface, so searches on tasks/settings still work. Page-specific filters remain in their own toolbar with explicit labels such as `Filter tasks` or `Filter this calendar`; do not silently connect a single query to both global results and local filtering.

### 3.2 Club discovery belongs in club contexts

Remove the generic club-AI button from the shared header. Keep a consistent club-discovery action on the overview and club discovery page only. It opens one shared experience with the same label, behavior, styling, results, and state contract from either entry point.

Use `Find clubs` as the stable action/panel name. The interface can support natural-language interests without branding every control as AI. If an optional generative explanation is available, present it as assistance inside that experience. Do not rename a deterministic fallback as live AI or use a green capability badge to imply quality or correctness.

Do not build separate AI assistants for tasks, calendar, resources, or settings in this task. Their standard global search and clearly scoped local filters satisfy the immediate need.

### 3.3 Meaningful color and simple geometry

Use the existing blue accent for primary actions and active selection; neutral surfaces for available choices and metadata; green only for genuinely confirmed success/connected/approved states where the meaning is explicit. Do not remove meaningful success colors throughout the app indiscriminately.

Keep existing responsive spacing, 44px mobile targets, keyboard accessibility, custom dropdowns, and stable pending states. Do not fix blank space by reintroducing button movement.

## 4. Roster panel redesign

Primary files: `src/components/ClubRbacPanel.jsx`, `src/components/Select.jsx`, shared field/layout styles in `src/index.css`.

### 4.1 Information hierarchy

- Rename the long heading to `Membership & roles` or an equally concise equivalent.
- Separate membership status from claiming an officer role. Show `Join club` only where the existing workflow permits/needs it; show a concise member status after joining.
- The officer claim form has one clear submission action: `Request role` for approval requests, or `Claim role` if that remains the appropriate generic contract. Never promise immediate verification when the backend may queue approval.
- Preserve the existing automatic-verification vs. pending-review behavior, officer view, release/step-down action, and board review queue.
- Keep a single short sentence explaining claim review when helpful. Remove repeated technical references to accounts/permissions from ordinary UI copy.

### 4.2 Form structure

Replace simultaneous unlabeled seat/custom-title alternatives with a labeled `Officer role` custom selector whose options include available roster seats and `Other role…`. Selecting `Other role…` reveals a labeled custom-title input. Verify the API payload remains equivalent to the existing contract and never sends both conflicting choices accidentally.

- Use visible labels; placeholders are examples/hints, not the only labels.
- Keep unavailable roles visible and clearly labeled/disabled where useful. Show `Your role` distinctly without confusing it with an available seat.
- Use neutral option text such as `Available` or `Claimed`, with occupant information only where authorized.
- Put `Verification note (optional)` below the role choice; use a short textarea only if multiline notes are supported by the current contract, otherwise preserve a single-line field.
- Desktop: fields fill their intended grid tracks, with consistent 8–12px gaps. Do not spread controls across an oversized row using `justify-between` or content-sized wrappers that leave unexplained holes.
- Mobile: stack fields in logical order, then a reachable submit action. Keep the membership action clearly separate from form submission.
- Ensure the custom Select wrapper and its trigger fill the assigned track (`min-width: 0`, appropriate width/stretch). Do not indiscriminately force every Select in the app full-width; make width behavior explicit at field vs. toolbar call sites.
- Check disabled, validating, submitting, pending review, approved, failed, existing-officer, and signed-out states.

### 4.3 Remove the misleading role-chip row

The six green checkmarked role chips duplicate information already available in the selector and falsely imply success. Remove this row from the normal claim form. If a roster summary is needed, use one neutral line such as `4 roles available · 2 claimed` with a `View roster` disclosure only when it reveals useful additional information.

Do not invent role availability, hard-code six roles, or infer approval from an unclaimed seat. Preserve actual roster data and restrictions. Keep review/approval success indicators where they represent a real status.

## 5. Correct stable button layout without empty icon gutters

Primary files: `src/components/ui.jsx`, `src/index.css`, all relevant `Button` consumers.

Passing `pending={false}` must not make a label-only button look like it has a missing icon. Redesign the primitive's internal content model:

1. An idle label-only button has symmetrical padding and a visually centered label.
2. An actual leading icon may share its existing slot with the pending spinner; icon size and spacing remain consistent.
3. For label-only pending buttons, keep the label/pending label centered in a stable-width content region. Overlay a small spinner within symmetric reserved interior padding, or use a centered pending-content overlay. Do not reserve a lone visible empty flex item to the left in idle state.
4. Size for known idle/pending labels without exposing invisible duplicate text to assistive technology. Avoid excessive width for short labels.
5. The border box, neighboring controls, and idle label alignment remain stable. Use consistent border widths and focus rings that do not affect layout.
6. Retain duplicate-submit guards, busy semantics, loading feedback, and immediate acknowledgement. Errors must not leave an invisible or disabled button behind.

Test icon-only, label-only, leading-icon, trailing-icon, disabled, pending, long-label, and full-width buttons. Verify both visual centering and geometry; a bounding-box test alone would miss the present blank-space problem. Do not special-case `Claim Seat` with a negative margin.

## 6. Restore dashboard stat separators

Primary file: `src/components/StatCards.jsx`.

The reported missing vertical divider refers to the summary stats, especially `Upcoming Events` beside `Group Polls`; do not add an unrelated divider between the events and announcements content panels.

- For a four-column desktop strip, show exactly three equal-weight internal vertical rules, one between each adjacent stat, including Events/Polls.
- For the mobile 2×2 grid, show the central vertical separation and one horizontal separation with no doubled outer border.
- Replace conflicting mobile/desktop nth-child utility combinations with one clearly scoped border strategy. Either explicit breakpoint-scoped CSS or stable grid separator geometry is acceptable.
- Do not hard-code label text into CSS. Handle variable item counts without producing odd dangling borders.
- Match the existing border token and outer border thickness in both themes. Dividers should span the intended item interior height consistently.
- Verify at widths immediately below/above the actual 2→4 column breakpoint as well as desktop 1280/1440 widths. Inspect computed styles and screenshots, not only class names.

## 7. Global search architecture and routing

Primary files: `src/components/Header.jsx`, `src/App.jsx`, `src/components/OverviewSearchResults.jsx`, `src/utils/search.js`, relevant page filters.

### 7.1 Header placement

- Render the global search field on every main page. Remove the `showSearch` exclusions rather than adding a visually present but nonfunctional field.
- Desktop/tablet: keep one predictable top-bar search slot that does not move or resize because an unrelated AI button appears or disappears.
- Narrow mobile: use one consistent full-width search row immediately below the top bar. Do not squeeze the field between all utility icons or stack duplicate global/local unlabeled searches.
- Use one shared placeholder and accessible name. Keyboard `/` and Cmd/Ctrl+K must focus the visible field on every page, while preserving existing editable-field protections.
- Preserve notification/account popover interactions and safe-area spacing. Avoid overlapping fixed search geometry with the logo or utility controls at intermediate widths.

### 7.2 Results contract

Implement one shared results panel/dialog responsive to the current query, accessible from every page. Adapt the overview result renderer rather than introducing seven different result implementations.

- Default grouping: Clubs, Events, Resources, and supported people/directory results where currently authorized. Include private tasks/polls only if they are already available through a permission-aware client/cache; do not silently fetch every club's private workspace to support global search.
- Display each result's type and meaningful context. A result navigates to its actual destination and passes the selected entity/context through existing navigation handlers.
- A club result can discover clubs the user has not joined; event/resource visibility and private-data access remain governed by existing rules.
- Do not fabricate settings results. If settings-section search is added, use a small explicit local route/anchor index and verify navigation; otherwise global search still works from settings by finding global entities.
- Keep the prior page's local filter state independent. Global search must not silently filter the background task list or calendar just because the user typed in the header.
- Clear/close behavior is deliberate: Escape closes the results surface first as appropriate; clearing query returns the surface to its empty/search-help state. Selecting a result closes the surface and focuses the destination meaningfully.
- Prevent stale asynchronous results from replacing a newer query. Use existing immediate local results, then optional augmentation without blanking them.
- Empty results should name the query and suggest an actionable refinement. Do not send users to an irrelevant club advisor from every no-results state.
- Respect focus containment and return, result keyboard navigation, screen-reader labeling, scroll limits, and mobile keyboard geometry.

### 7.3 Local search migration

Inventory where `searchQuery` currently filters page content. Separate it into global query and explicitly scoped page filter states. Preserve previously saved local filter preferences and intentional navigation queries such as opening the calendar for an event title.

Avoid mounting two different controls bound to the same hidden query with different meanings. Keep a single shared search-result contract and ordinary component props/state; do not add a new router or state library merely for this task.

## 8. One uncluttered club-discovery experience

Primary files: `src/components/AiClubAgentModal.jsx`, `src/components/AiOverviewSearchBar.jsx`, `src/App.jsx`, `src/components/ClubsHub.jsx`, `src/components/Header.jsx`.

Consolidate duplicated view/state logic into one reusable club-discovery surface. The overview and Clubs page may use different trigger placement, but must open the same interaction and result model. Remove the club advisor from the global Header. Keep code removal scoped: do not remove capabilities still used elsewhere without migrating their callers.

### Default surface

- Header: `Find clubs`, one short helper line if necessary, one accessible close control.
- One input: `What are you interested in?` with a concrete example such as `Cars, hiking, or beginner coding`.
- A maximum of three concise example queries, with additional examples behind `Examples` if worth keeping. Remove the wall of eight multi-topic emoji pills.
- No large dashed empty-state card beneath an already explanatory heading/input.
- No green `Grounded AI`/model badge, catalog-size promotional footer, or duplicate bottom `Close` action in a short search dialog.
- Keep capability/provider configuration in a secondary settings disclosure when needed. Do not surface implementation/model names as proof of result quality.

### Results surface

- Prioritize actual matching clubs immediately below the input.
- Each result shows name, concise evidence-based reason, relevant metadata, and clear detail/join actions where permitted.
- Remove decorative percentage match scores unless they have a defensible calibrated interpretation. An arbitrary heuristic score is not a probability.
- Show a short optional assistant explanation after or alongside useful results; do not require generated prose before displaying clubs.
- Follow-up suggestions are relevant to the query and limited in number. Preserve multi-turn refinements only if they are clear and do not grow a large permanent header.
- Preserve the query, selections, and conversation when temporarily collapsed/reopened; preserve independence from the global header query.
- Loading/error/provider-unavailable states retain the locally retrieved result set. Do not claim an AI response was generated if only local ranking ran.

## 9. Fix search relevance before decorating AI output

Primary files: `src/utils/search.js`, `src/utils/aiClubAgent.js`, `src/utils/clubDirectory.js`, `src/api/aiClient.js`, `server/routes/ai.js` only where necessary, and relevant tests.

### 9.1 Normalize searchable club data once

Create or reuse a shared normalized search document containing stable ID, official/display name, aliases/handle, description, bio, directory description, tags, and category. Index all useful descriptive fields rather than choosing a single first-nonempty field and losing evidence. Remove boilerplate/duplicate text where helpful without erasing informative terms.

- Support raw API snapshot records and transformed UI club objects with equivalent retrieval behavior.
- Normalize tag strings and `{ label }` tags if both occur in real data.
- Do not treat category as authoritative when explicit bio/description disagrees; the target automotive club currently has a gaming category.
- Avoid overwriting collector data merely to make search work. If taxonomy correction is justified, make it a separate documented data-quality change with provenance and regression coverage.
- Do not use follower counts as a primary relevance signal. Popularity can break ties after query relevance.

### 9.2 Shared retrieval baseline

Share the club retrieval/indexing layer across standard global search, club-directory search, and natural-language discovery. These surfaces can present results differently, but a basic automotive query must not work in one and fail in another.

- Preserve exact names/aliases and sensible prefix/typo handling.
- Add bounded token-aware concept/synonym expansion: `car`, `cars`, `automotive`, `automobile(s)`, and related evidence-backed terms should connect to automotive descriptions.
- Use whole tokens/phrases and conservative stemming. `car` must not match `career`, `card`, `cartoon`, or `Caribbean` merely as a substring. Distinguish automotive interests from card games and unrelated names.
- Preserve short meaningful query tokens such as `car`. Do not remove an informative token as a stop word just because it is short.
- Query concepts provide alternatives within a concept, not an AND requirement that every synonym appear. Preserve appropriate multi-concept and explicit-negative intent behavior.
- Exact name/alias matches rank above broad concept expansions. Specific descriptive evidence outranks generic category matches or arbitrary catalog order.
- Do not collapse `Slugs On Wheels UCSC` and `Slugs on Two Wheels (SlugWerks)` into one entity. Keep stable IDs and separate identities; rank according to the actual automotive/motorsport evidence and query intent.
- Do not special-case `car` to inject one club ID. Add a general automotive concept grounded in searchable fields and regression fixtures for unrelated clubs.
- Keep deterministic tie-breaking and finite result limits. Index/cache normalized documents by data revision rather than repeatedly rebuilding the whole corpus per keystroke if profiling shows a need.

### 9.3 Candidate generation and optional AI

Fix `buildCandidateCatalog` so model candidates are chosen by query relevance and evidence, not the first catalog entries when local retrieval yields too few matches.

- Build the candidate pool from the shared retrieval layer and relevant intent expansions before truncating for model context.
- Preserve hard exclusions, deduplication by stable ID, and permission constraints in retrieval, candidate construction, and final result validation.
- Include useful bio/description evidence in the compact candidate summary. Do not send empty summaries when the source bio is populated.
- Add a candidate inclusion test proving the automotive club reaches the model input for `car` before any generative call is attempted.
- Keep useful deterministic results visible if the model times out, is unavailable, or returns invalid/unknown IDs. Model augmentation must not erase a strong exact/concept match without a legitimate query constraint.
- Validate generated IDs and claims against supplied records. Do not invent club activities, schedules, availability, or verification status.
- Basic retrieval must pass without API keys or paid model calls. Generative tests can use deterministic mocked responses.
- Do not change model/provider/API versions based on assumptions. If a provider integration change is actually required, consult current official documentation and keep it separate from the retrieval fix.

## 10. Implementation order

1. **Baseline:** capture the reported roster view, dashboard stat strip, header on all seven pages, and current club-discovery surface. Reproduce `car` against the actual app data path and pure retrieval tests.
2. **Shared visual defects:** correct Button pending geometry and Select field width behavior; simplify the roster form; repair stat separator rules. Verify these before broader search wiring.
3. **Retrieval foundation:** normalize club search documents, implement bounded semantic expansion, and establish deterministic regression tests. Fix candidate selection and fallback behavior.
4. **Global search:** create one shared results surface, render search on every page, separate global query from local filters, and preserve navigation intents.
5. **Club discovery consolidation:** remove header AI triggers, route overview/Clubs triggers to the shared simplified experience, and reuse the retrieval foundation.
6. **Regression pass:** verify appearance, responsiveness, permissions, search quality, saved state, keyboard/mobile behavior, and build/tests. Remove abandoned duplicate search UI only after all callers are migrated.

Keep each pass reviewable. Do not rewrite large files wholesale, regress optimistic task updates, replace custom selects with native ones, or introduce broad unrelated styling changes.

## 11. Acceptance and test matrix

### Visual checks

- Roster form: available roles are neutral, no false success checkmarks, fields occupy their intended columns, and the claim action's idle label is centered with balanced padding.
- The same label-only button remains centered and the same size while pending; actual leading-icon buttons still align correctly.
- Dashboard: Events/Polls divider is visible and matches the other desktop dividers. Mobile 2×2 borders are clean with no doubled edges.
- Header: search exists in the same layout slot on overview, tasks, calendar, polls, clubs, resources, and settings. No unrelated AI button appears beside it.
- Club discovery: one title/input, minimal examples, immediate useful result cards; no repeated empty-state/promo sections.
- Verify 1440×900, 1280×720, 768×1024, 390×844, and 320×568; include exact breakpoint boundaries, long role/club labels, light/dark modes, both density settings, and mobile keyboard display where tooling permits.

### Search regression fixtures

Use small stable fixtures derived from real public club fields, not the mutable live snapshot as the only assertion source. Also run a smoke test against the available catalog.

| Query/case | Expected behavior |
| --- | --- |
| `car`, `cars`, `automotive`, `automobile` | `slugsonwheelsclub` appears within the first three club results when the supplied automotive bio is present |
| `Slugs On Wheels`, `slugsonwheelsclub` | Intended exact club is first; similarly named entities stay distinct |
| `card games`, `career`, `Caribbean` | No false automotive result caused solely by the `car` substring |
| `cars but not motorcycles` | Automotive result retained; explicitly motorcycle-only matches excluded according to evidence |
| A known coding/music/outdoors club name and interest query | Existing supported searches still produce relevant results |
| Raw record with only `bio` vs. normalized UI record | Equivalent automotive retrieval, no missing-field regression |
| Randomly shuffled catalog | Strong matches and candidate inclusion do not depend on source order |
| No generative provider, provider error, invalid generated ID | Useful local results remain; no invented clubs appear |
| Search from tasks/polls/settings | Shared global result surface opens and selection navigates correctly without mutating local filters |
| Restricted tasks/people data | No unauthorized entity is indexed, displayed, or leaked by a result count |

Make relevance assertions deterministic with tied fixtures and documented ranking rules. Do not claim broad search quality from one hard-coded automotive example.

### Interaction and domain checks

- Open/close global results and club discovery with keyboard, pointer, and touch; Escape and focus return work correctly.
- `/` and Cmd/Ctrl+K focus the visible global field on every main page and do not hijack ordinary text editing.
- Selecting a global club/event/resource result uses the intended existing destination and context.
- Local task/calendar filters retain their state before and after global search.
- Claim a seat/custom role only in isolated test data; verify correct payload, pending approval, rejection, auto-verification where supported, and existing-officer states.
- Pending button click/Enter guards prevent duplicate submissions without hidden icon gaps.
- Shared Select width changes do not stretch compact toolbar selectors or break popup anchoring.
- AI result augmentation cannot race and overwrite a newer query or discard local matches on failure.

Run `npm test` and `npm run build`. Add meaningful tests for query normalization/ranking/candidate selection and changed search routing/state boundaries. Use browser geometry and screenshots for borders, alignment, and visible hierarchy; class-string tests alone do not establish visual correctness.

## 12. Deliverables

Deliver implemented source plus a concise Markdown report containing:

1. Before/after evidence for the roster form, claim-button centering, dashboard separators, global header, and discovery UI.
2. A list of search entry points and their final behavior, including how global queries and local filters are separated.
3. Retrieval tests demonstrating the `car` fix across normal search and discovery, candidate inclusion, and absence of substring false positives.
4. Build/test results and actual viewport/keyboard/role states verified.
5. Any remaining limitations, unverified provider behavior, or justified deviations.

Never report a visual/browser check or successful live AI call that was not performed. Do not stop after changing labels: completion requires correcting the visual primitives, consistent functional search on all pages, removing irrelevant AI entry points, and making basic concept retrieval work without a model.
