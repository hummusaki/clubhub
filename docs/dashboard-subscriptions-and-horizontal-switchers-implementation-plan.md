# ClubHub implementation plan — dashboard, subscriptions and horizontal switchers

Students should be able to open a starred club’s task board in one tap, read their next event’s time and place without opening it, and decide which clubs reach their personal feeds. The two supplied screenshots identify the controls to replace. Implement the changes against the current checkout, including the existing favorites and poll-save work.

## 1. Put starred task boards within one tap

Replace the large purple **Switch club** trigger and dropdown in `src/components/TaskClubSwitcher.jsx`. Put a horizontal, single-line strip of starred clubs directly above the board. Each item is one button with the club avatar and a readable name. Use an established short name when available, e.g. **ACM-W**. Show the full selected club name in the board header and expose each button’s full accessible name. Give the active item a visible outline or underline and a programmatic selected state.

- Selecting a favorite immediately opens its board through the existing `onSelect`. Keep the selected chip in view. A selected, unstarred club stays identified in the header. It can be starred there without changing boards.
- Add a small **All clubs** action beside the strip. It opens a searchable joined-club list for occasional switching and managing stars. A star toggle keeps the list open and the current board selected. With zero favorites, show the current club, its star and All clubs. With zero memberships, keep the existing browse action.
- Reuse the existing normalized `favoriteClubIds`, account-specific task preferences, demo state and membership checks. Support touch scrolling, trackpads and keyboard access. Show previous/next controls on desktop only when the strip overflows. Scrolling the strip must never scroll the whole page sideways or switch the active board.

**Acceptance:** Start with ACM-W unstarred, star it and two other clubs, then switch among all three without opening a menu. Unstar the active club and keep its board open. Check rapid switching, long names, reload, account changes and a phone-width viewport.

## 2. Make Overview configurable

The Overview branch in `src/App.jsx` currently hardcodes stats, a compact calendar beside announcements, joined clubs and resources. Replace that block with an ordered list of stable widget IDs mapped to the existing components. Keep the page heading and **Customize dashboard** action outside the list so customization remains available even with all sections hidden.

| Section in the picker | First visit | Behavior |
| --- | --- | --- |
| Summary counts | Shown first | Retain navigation from each count. Count the same eligible records the destination shows. |
| Upcoming schedule | Shown second | Show the next eligible events in chronological order, grouped by local date. |
| Announcements | Shown third | Show the newest eligible notices and open the selected notice. |
| My clubs | Shown fourth | Open each club’s existing profile. |
| Resources | Shown fifth | Reuse the compact resources list and its full-page link. |
| Mini calendar | Available to add | Show a compact month grid with Today, previous/next month and a mark on dates with eligible events. Selecting a day shows that day’s agenda and an **Open in calendar** action for that date. |

**Editing.** Customize opens an editor with visible sections in display order and available sections underneath. Provide Add, Remove, Move up and Move down. Dragging may supplement the buttons. Save commits the order and visibility together. Cancel discards the draft. Restore default restores the table above. On mobile, DOM order and visual order match. On desktop, use a row-major responsive grid without dense packing that could reorder widgets. Keep the invitation to join a first club inside the relevant empty widget.

**Persistence.** Extend account-keyed dashboard settings with a versioned ordered array of visible IDs. Missing settings get the default layout. An explicitly empty array means the user hid everything. Ignore unknown or duplicate IDs while preserving valid entries and their order. Demo edits stay within the demo session. Hiding a widget changes only layout, so its subscriptions, memberships and saved data survive.

**Make the schedule legible.** In the compact branch of `CalendarView.jsx`, render a date heading and a consistent time column, with the event title, club and labeled location alongside it. On a phone, let location wrap below the title. For example, a row under **Wed, Nov 18** could read **6:00–7:00 PM · Design critique**, followed by **Design Club · Location: Porter 250**. Distinguish “All day,” “Online” and “Location pending.” Use the same timezone, 12/24-hour setting, week start and all-day date handling as the full calendar. Use actual event start times for ordering, including booked poll events. Both calendar widgets can coexist and share one data result.

**Acceptance:** Add the mini calendar, remove Resources, move Announcements first and reload. Verify the layout for a second account, an older saved settings object and an empty dashboard. Select a day outside the current month and open the full calendar on that date. Test an all-day event, an overnight event, a missing room and two clubs meeting at the same time.

## 3. Apply club subscriptions during event and announcement retrieval

### User controls and defaults

On each joined club’s profile, put two independent controls under **Subscriptions**. Both **Events** and **Announcements** offer **All**, **Important only** and **Off**. A student might want every meeting but only important announcements. Show save progress, retain the last confirmed values on failure and offer retry. Keep Join/Leave and task favorites independent.

Default both channels to All for existing and newly joined clubs, preserving current feed behavior. This plan keeps personal feeds membership-scoped. Leaving a club stops delivery immediately. Preserve explicit settings for rejoining. Visiting a club profile remains a deliberate way to browse its authorized content even with delivery off.

### Retrieval contract

1. **Store preferences privately.** Use the authenticated account and normalized club ID as the unique key, with separate event and announcement modes. Supply idempotent per-channel updates in the workspace API and equivalent direct Supabase handling with owner-only access. Missing rows imply defaults. Keep preferences out of public snapshots. In demo mode, use session memory.
2. **Give both record types a stable importance field.** The collector already classifies some posts and announcements as `important`. Preserve that flag through ingestion, database writes, exports and normalization. Extend events and authored workspace notices/events with explicit importance. Let an authorized author mark a record important. For imported records, use record-specific evidence such as a confirmed reschedule or venue change. One important item in a multi-event post should not promote unrelated events. A cancellation should correct the original event when identifiable and surface the notice without creating a new upcoming meeting. For legacy records, recover reliable source evidence where available and treat unknown importance as ordinary. Keep audience, RSVP, source channel and importance separate.
3. **Filter before limits.** Resolve membership and audience permissions first, then apply the club’s channel mode and the record’s importance. Merge eligible records from multiple sources, deduplicate by stable source identity, order by actual timestamps, and only then cap or paginate. Use an authenticated personalized read for the live service. Keep the public catalog available for explicit browsing. GitHub Pages can use the same rules in its retrieval adapter over its public snapshot and authorized workspace responses.
4. **Remove current early cuts.** `App.jsx` requests 40 announcements and slices the static snapshot to 40 before checking membership. The workspace API also starts from the newest 100 private announcements and the direct Supabase reader limits its query to 50. Push eligibility into those queries or page until enough eligible records are found or the source is exhausted. Preserve IDs, timestamps, source, audience and importance until after the merge. Format labels such as “Urgent” only at presentation.
5. **Use one personalized result across surfaces.** Drive Upcoming schedule, mini calendar, full personal calendar, Overview counts, personal announcements, bell and unread counts from the same eligible records. Existing RSVP-only and notification-channel settings may narrow that result. Deliberately created personal events and booked meetings keep their existing ownership/visibility rules. For subscribed ICS and Google sync, apply event preferences during feed generation too, including server-side paths that rebuild events from storage. Reconcile previously synced ClubHub-managed entries when their eligibility changes. Keep manually created external calendar entries intact.
6. **Update immediately and isolate accounts.** After a preference save, invalidate or recompute both the personalized records and derived counts. Guard against stale fetches restoring muted records after a quick toggle, club leave or account switch. Shared collection continues to ingest each club once for all users.

**Code paths to cover:** `collector/src/extract.js`, `collector/src/index.js`, `server/database.js`, `server/routes/events.js`, `server/routes/announcements.js`, `server/routes/workspace.js`, `src/api/client.js`, `src/api/supabaseDirectWorkspace.js`, `src/App.jsx`, calendar sync and feed generation in `src/utils/calendarSync.js`, `server/routes/calendar.js` and `vite.config.js`. Trace the writer as well as the reader for manual, collector and targeted records.

**Acceptance:** Use two accounts in the same club with different preferences. Exercise all three modes independently for each channel. Seed more than 100 newer muted notices ahead of an older eligible notice and verify it appears on live, direct and static-backed paths where applicable. Check an old record without an importance flag, a targeted board notice as a regular member, an RSVP-only calendar, a preference write failure and a feed refresh after muting. The bell count and both dashboard widgets must agree with the personalized result.

## 4. Replace the Availability poll dropdown and align Fill week

**Poll selection.** Replace the **Select poll** dropdown in `src/components/AvailabilityView.jsx` with a labeled horizontal strip. List active polls first and provide an **Archived** filter that uses the same strip. Show an active or archived label and enough title or date context to distinguish similarly named polls. A shared link to an archived poll opens the correct filter and scrolls its selected item into view. Keep creation, sharing and archive actions adjacent to the strip, outside the scroll area.

Reuse the current selection handler and clear any previous participant spotlight or delete confirmation on switch. Preserve pending response writes for the original account and poll using `src/utils/pollResponseQueue.js`. Handle empty, loading, deleted and inaccessible polls. Keep keyboard focus visible as the strip scrolls. Phone users can swipe, and desktop users can step through overflow without a horizontal-wheel gesture.

**Fill week placement.** The current flex row uses `justify-between` on the mode control, Fill week, save status and sometimes Retry. That distributes the button toward the center, as shown in the screenshot. Put **My Availability / Group Overlap** at the start of the grid-card toolbar and **Fill week** flush with the card’s right content edge. Give save status and Retry their own row below. At narrow widths, allow the action to wrap to a right-aligned second line. Anchor its menu to the trigger within the viewport. Retain the existing editable-poll conditions and presets.

**Acceptance:** Switch through 15 long-titled polls using a phone, keyboard and desktop pointer. Switch during a pending save, reopen the original poll and verify its slots. Archive or delete the selected poll, open an archived poll link, and check Fill week at 320, 390 and 1280 px with saved, saving and error states. Its position should stay stable as status text changes.

## Delivery order

1. Implement and verify the two horizontal strips and Fill week alignment. Compare the same desktop and phone states against the supplied screenshots.
2. Add the importance and preference migrations, retrieval contract and feed tests. Verify parity across live and static-hosted deployments with fixtures.
3. Build the dashboard editor, mini calendar and schedule rows against that shared retrieval result. Test keyboard-only editing, persistence, mobile wrapping and both themes.
4. Run `npm test` and `npm run build`. Finish with a single end-to-end check: star a club, open its board from the strip, set its events to Important only, add Mini calendar, and confirm a routine event disappears while an important event remains visible on its scheduled date.
