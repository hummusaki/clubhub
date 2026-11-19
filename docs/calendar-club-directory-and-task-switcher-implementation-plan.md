# ClubHub implementation plan — Calendar, club directory, color and task switching

## 1. Give scheduling one home

Use **Calendar** as the single desktop and mobile destination. Its header has two visible views, **Schedule** and **Availability**. Schedule answers “What’s happening?” and Availability answers “When can we meet?” Month, Week and Agenda stay inside Schedule. New poll, responses, invitations and booking stay inside Availability. Let each view supply its own actions under one page heading.

| Entry point | Expected result |
| --- | --- |
| Calendar in primary navigation | Open Schedule using the user’s existing calendar view preference. Five primary destinations fit in the mobile bar. |
| Overview’s Upcoming Events, a club event or a global event search result | Open Schedule. Preserve the requested date, view or selected event. |
| Overview’s Group Polls, a shared `?poll=<id>` link or an old Availability history entry | Open Calendar with Availability selected. A shared link opens its specific poll after login. An inaccessible or expired poll gets an explicit unavailable state. |
| Book a time in a poll, then choose **View in calendar** | Show the booked event on its actual date. Back returns to the originating poll. |

**Implementation.** In `src/App.jsx`, treat the calendar section and schedule view as separate navigation fields. Normalize the old `availability` destination at entry and history restoration. Record section changes even when the parent destination stays `calendar`. Update `src/data/sampleData.js`, the live Overview stats, `Sidebar.jsx` (currently a six-column mobile grid), `workspaceEntry.js` and `pageTitle.js`. Reuse `CalendarView.jsx` and `AvailabilityView.jsx` beneath the shared header. Keep the compact Overview calendar.

Preserve the schedule date, filters, selected poll and in-progress response when moving between views. Availability currently debounces a response for 350 ms and clears the timer in pointer-listener cleanup. Give pending saves a lifecycle independent of the visible grid, keyed by account and poll. Show “Saved” only after confirmation, and offer retry on failure. Only the visible view should update the document title, own keyboard focus or handle pointer gestures.

## 2. Make the club directory readable and unmistakably clickable

In the supplied screenshot, **A Counter Space** has a one-line name while **Association for Computing Machinery – Women at UCSC (ACM-W)** wraps. The category drops to a different level, the description jumps left of the title, and two bios end in an ellipsis. In `ClubsHub.jsx`, only the title is a link, and `line-clamp-2` cuts off the description. Fix the card structure before changing colors.

| Part | Design and implementation |
| --- | --- |
| Directory toolbar | Align the Clubs heading, All clubs/Joined navigation, search and result grid to the same left gutter. Keep Feed and People reachable. Put the category and layout controls together. At phone width, move secondary filters into the existing disclosure. |
| Card anatomy | Use one `ClubPageLink` around the card. Start with a consistently sized 40–44 px logo and a labeled category chip. Below that row, put the full club name and summary on the same left edge. Anchor **View club →** at the bottom as text inside the link. Give the anchor an accessible name such as “View A Counter Space.” |
| Names and descriptions | Let names wrap at every size. Display a complete short source sentence when available, with the full bio on the profile. If the source is one long sentence, let it wrap. Omit empty or link-only descriptions. Avoid line clamps, mid-word cuts and invented summaries. A missing logo uses initials in the same frame. |
| Grid and density | Use one column on phones. Add columns only when the available content area can fit roughly 18–20 rem per card after the sidebar and gutters. Align header, title, summary and footer tracks across each desktop row using CSS Grid/subgrid or equivalent. Let the tallest card set the row height. Compact mode reduces padding and gaps. |
| Interaction | Keep the directional link cue visible on touchscreens. On hover, emphasize the border and link text. On keyboard focus, outline the whole card. Preserve native open-in-new-tab behavior and return focus, filters and scroll on Back. The card has one tab stop and one navigation action. |

Apply the same link treatment in All clubs, Joined, grouped results and the compact Overview preview. The preview can show just the logo, name and arrow. Reuse the card’s category treatment on the existing club profile so opening the page feels continuous.

## 3. Give color a consistent job across the site

Extend the paired light/dark tokens in `src/index.css` and the shared controls in `src/components/ui.jsx`. Use a lightly tinted application shell, elevated reading surfaces and dark-mode tints with readable foregrounds. Color should help a user recognize a destination, category or state before reading the label.

| Surface | Color treatment |
| --- | --- |
| Overview and navigation | Use a restrained blue tint in the header or selected navigation item. Carry the destination accent into Overview icon wells. Keep the selected label, focus outline and active indicator visible. |
| Clubs, club pages and discovery | Use the existing category mapping in `src/utils/clubCategories.js` for category chips and avatar backgrounds. Pair theme-specific ink and surface tokens. Keep long bios on neutral surfaces. |
| Calendar and Availability | Use teal for scheduling accents and the selected date. Pair poll availability intensity with labels or a legend. Preserve event colors, RSVP state and clear selection outlines. |
| Tasks | Use violet for the switcher and board header accents. Use amber with a filled star for favorites. Preserve priority, overdue, completion and permission indicators as distinct states. |
| Resources, Settings and login | Carry shared link, selected-control and surface treatments through these pages. Keep login device-themed from first paint and the workspace account-themed after entry. |

Check light, dark, hover, selected, disabled, error and keyboard-focus states. Use a 4.5:1 text contrast target for ordinary labels and 3:1 for meaningful control boundaries and focus indicators. Test actual token pairs on their rendered backgrounds, including tinted chips. Pair meaningful colors with text, shape or icons.

## 4. Upgrade the Tasks club picker into a favorites-first switcher

Replace the existing searchable `Select` in `ClubTaskBoard.jsx` with one visible **Switch club** control showing the current club and avatar. Opening it focuses a search field. On desktop, anchor the panel to the trigger. On phones, use a width-safe dialog with the same search and actions.

1. Source choices from the existing `memberClubs` collection. Show **Favorites** first and **Other clubs** second, alphabetized within each group with a stable ID tie-breaker. Search both groups and omit empty headings. Show the current board with a checkmark independent of its favorite state.
2. Give each row sibling buttons for opening the board and toggling its star. Favoriting reorders the row immediately, keeps the switcher open and preserves focus on that club. Selecting the club switches boards, closes the panel and restores focus to the trigger. Support keyboard search, Enter to select, an accessible star toggle and Escape to dismiss. Keep the star target large enough to tap independently.
3. Add normalized, deduplicated `favoriteClubIds` to the defaults, read, write and hydration paths in `src/utils/taskReminders.js` and `ClubTaskBoard.jsx`. Older preferences default to an empty list. Store favorites **per account on the current device**, consistent with existing task-board preferences. Keep demo changes in memory. Derive visible favorites from current memberships and avoid clearing saved IDs during initial loading.
4. Keep the current selection rules. A valid club opened from its profile wins, then the last selected club, then an eligible default. Starring a club changes its position only. Retain the existing club-scoped request cancellation and write handling when switching rapidly. With one club, show its name and allow starring without a picker. With no clubs, keep the existing browse/join path.

## Delivery and acceptance

| Order | Check before finishing |
| --- | --- |
| 1. Calendar navigation | Open a poll link while signed out, enter the workspace, mark a slot and immediately switch to Schedule. Reopen the poll and verify the saved selection. Book a time, open the resulting event and use Back/Forward. Verify five mobile navigation items and one Calendar heading. |
| 2. Club layout and color | Compare the three screenshot clubs at 320, 390, 768 and 1440 px, in both themes and compact density. Check full titles, complete summary sentences, aligned footers, missing logos, keyboard focus and 200% zoom. Click the logo, summary and footer separately and confirm the same profile opens. |
| 3. Task switching | Star two clubs, search, unstar the active club and switch boards rapidly. Reload, switch accounts and leave a starred club. Verify ordering, persistence, membership filtering, one-club and no-club states, and that delayed results from one board never populate another. |
| 4. Regression checks | Extend existing poll, entry/navigation, theme and task-board preference tests for the new cases. Run `npm test` and `npm run build`. Capture before/after directory and switcher views at phone and desktop widths for review. |
