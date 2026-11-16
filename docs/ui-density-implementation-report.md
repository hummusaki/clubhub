# ClubHub UI density implementation

| Area | Change and action audit |
| --- | --- |
| App shell | Reduced page gutters and spacing while retaining the fixed header and six mobile destinations. Settings and theme switching are in the account menu, and Settings is also in the desktop sidebar. One standard search field serves desktop and mobile. Bottom navigation, content clearance, and toast placement use the same height and safe-area values. |
| Overview | Replaced four large tiles with a compact summary. Events and announcements lead, with clubs and resources below. **Find a meeting time** opens availability. **Find clubs with AI** opens a separate panel that retains the draft and conversation on collapse. **Example prompts** opens the prompt list. Users with no memberships get one primary **Browse clubs** action. |
| Task board | Added one joined-club selector and a counted **Filters** disclosure. **Task settings** contains reminder configuration and roles or roster access. **Create club task** and **Add personal task** open separate scopes. Existing task rows appear above per-list quick entry, with completion and due dates still available in the list. |
| Calendar | Combined Google, Apple, and sync settings under **Calendar sync**, with provider configuration, subscriptions, and export in the existing dialog. Kept RSVP and add-event actions visible. **Automatic** uses agenda on phones and month elsewhere. A navigation intent, a view selected in the session, or a saved default takes precedence. Existing stored month values are treated as preferences because older settings did not distinguish defaulted from explicit month values. |
| Availability | One selector groups active and archived polls. **Share poll** contains **Copy invite link**, **Share to Discord**, and **Share by email**. Creator-only **Poll actions** contains archive, restore, and delete with confirmation. Week controls sit next to the grid, phones use a day selector, and **Responders** expands below **Best Meeting Windows**. |
| Clubs and resources | Clubs use their name as the roster action and keep membership alongside it. Long descriptions and contact actions are in **Club details**. All six Community sections are available in one mobile selector. **Grid view** replaces **All Grid** in Filters. Resource titles are links, copy and pin are separate controls, and pinned resources appear once in the full list. **Add resource** stays in the toolbar. |
| Shared controls and forms | Added touch sizing and focus treatment for reused controls. Disclosures support Escape and click-away. Task, calendar sync, and targeted announcement dialogs share a scroll body and viewport sizing. The time picker expands within the form and returns focus to its trigger. |

## Browser comparison

CSS pixels from the top of the viewport at scroll position zero. Measurements used the light theme, standard density, and the same four demo memberships. Event and task measurements use the matching title. The calendar comparison uses Agenda on both sides. Availability measures the first slot in the guest grid, which displays availability but requires a signed-in participant for edits.

| First useful content | 1440×900 before → after | Earlier | 390×844 before → after | Earlier |
| --- | ---: | ---: | ---: | ---: |
| Overview event | 503 → 282 px | 44% | 691 → 410 px | 41% |
| Task board personal task | 603 → 345 px | 43% | 842 → 453 px | 46% |
| Calendar agenda event | 399 → 208 px | 48% | 524 → 336 px | 36% |
| Availability grid slot | 438 → 347 px | 21% | 647 → 371 px | 43% |

The desktop overview went from three complete event rows in the initial viewport to four. The phone overview went from one partial event row to two complete rows, with the start of a third. The smaller desktop poll gain retains both the week controls and the day-by-day grid headers.

| Overview screenshots | Before | After |
| --- | --- | --- |
| 1440×900 | [Desktop baseline](/Users/gabrielmortimer/.codex/visualizations/2026/11/15/01a1e145-0c90-7f91-ac7b-37cdc6a40f99/clubhub-overview-before-desktop.jpg) | [Desktop revision](/Users/gabrielmortimer/.codex/visualizations/2026/11/15/01a1e145-0c90-7f91-ac7b-37cdc6a40f99/clubhub-overview-after-desktop.jpg) |
| 390×844 | [Mobile baseline](/Users/gabrielmortimer/.codex/visualizations/2026/11/15/01a1e145-0c90-7f91-ac7b-37cdc6a40f99/clubhub-overview-before-mobile.jpg) | [Mobile revision](/Users/gabrielmortimer/.codex/visualizations/2026/11/15/01a1e145-0c90-7f91-ac7b-37cdc6a40f99/clubhub-overview-after-mobile.jpg) |

## Verification and limits

- Navigated Overview, Tasks, Calendar, Polls, Clubs, and Resources in the guest preview at 320×568, 390×844, 768×1024, 1024×768, 1280×720, and 1440×900. Checked document width and element bounds. The checked pages had one visible page heading and fit without page-level horizontal overflow. Also inspected sign-in, switched the calendar to Agenda, and used guest Join and Leave to match the baseline and verify overview updates.
- Browser measurements and screenshots were captured before the final small header spacing and dialog accessibility refinements. Browser access ended before a second interaction pass. Signed-in and officer UI, provider setup and sharing, physical touch and virtual keyboard behavior, focus return, theme and density combinations, and the full task and resource editing flows remain unverified in the browser. The local automated suite covers task scoping, permission tiers, poll responses, and creator-only poll lifecycle operations.
- Resource editing has no existing UI or update endpoint in this checkout. The resource changes cover the existing add, open, copy, and pin workflows.
- `npm test` passed all 46 tests using in-memory fixtures. `npm run build` passed with Vite's bundle-size advisory. `git diff --check` passed.
