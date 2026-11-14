# ClubHub Collector

Pulls recent posts from UCSC club Instagram accounts and turns them into structured data:
**events, meetings, deadlines, announcements, locations and links**. Results are saved to
`output/clubhub-data.json` and can be POSTed straight to your database.

```
clubs.json ──> Instagram (Business Discovery API) ──> extract dates / times / rooms / links ──> JSON ──> database
                                                       (rules, or Claude for flyers)
```

## Quick start

Needs Node 20.12 or newer.

```bash
cd collector
npm install
npm run demo                 # runs on made-up sample posts, no Instagram setup needed
npm run search -- "cs club"  # search the results by club name
```

Once Instagram is set up (below):

```bash
cp .env.example .env         # fill in IG_USER_ID and IG_ACCESS_TOKEN
npm run collect              # every club in clubs.json
npm run collect -- --club ucsc_somehandle   # one club
npm run collect -- --watch 360              # keep running, refresh every 6 hours
```

## The club list

`clubs.json` already holds **134 official UCSC clubs** from the
[UCSC student organization directory](https://getinvolved.ucsc.edu/student-organizations/join/),
each with its Instagram handle and a guessed category (cultural, greek, pre-professional, tech & science,
performing arts, media & arts, gaming, faith, service & advocacy, other).

To refresh it when clubs change:

```bash
npm run update-clubs
```

This downloads the directory, skips suspended/dismissed clubs and clubs with no Instagram, and merges
clubs that share one account. Your edits survive a refresh: a changed `category` is kept, and clubs you add
yourself stay if you mark them `"manual": true`:

```json
{ "name": "Some New Club", "instagram": "their_handle", "category": "gaming", "manual": true }
```

Only clubs with an Instagram **Business or Creator** account can be read (see below). The rest are listed
under `errors` after a run, so you can see which clubs to ask to switch (it's free and takes a minute).

## Instagram setup (one time, about 20 minutes)

Instagram's official API can read the public posts of other accounts through **Business Discovery**.
The catch: it only works for clubs whose Instagram is a **Business or Creator** account (free to
switch in the Instagram app under Settings → Account type). Personal and private accounts are skipped
and listed under `errors` in the output.

1. **Make a ClubHub Instagram account** and switch it to a Business or Creator account.
2. **Create a Facebook Page** (it can be bare) and link the Instagram account to it
   (Page settings → Linked accounts → Instagram).
3. Go to [developers.facebook.com](https://developers.facebook.com), **create an app** (type: Business),
   and add the **Instagram** product, choosing "API setup with Facebook login".
4. Open the **Graph API Explorer**, select your app, and generate a User token with these permissions:
   `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management`.
5. **Find your IG_USER_ID**: in the Explorer, run
   `me/accounts?fields=instagram_business_account` and copy the `instagram_business_account.id`.
6. The Explorer token expires in about an hour. For a longer one (60 days), exchange it with
   the Access Token Debugger ("Extend Access Token").
7. Put both values in `.env`.

While your Meta app is in development mode, it works for the app's admins and testers, which is enough
for a hackathon. Opening it up to the public needs Meta's App Review.

## Better extraction with Claude (optional)

By default, a rule-based extractor reads captions. Many club posts put the date and room **only on the
flyer image**, which captions can't capture. Set `ANTHROPIC_API_KEY` in `.env` and each post's caption and image
are read by Claude instead. If a call fails, it falls back to the rules automatically.

Cost tip: with 134 clubs × `POSTS_PER_CLUB` posts, the first run reads a lot of posts. Posts are cached in
`output/claude-cache.json`, so later runs only pay for new posts. For a first test, try
`POSTS_PER_CLUB=5` or `npm run collect -- --club ucscbsu`.

## Output format (for the database)

`output/clubhub-data.json`, also POSTed as JSON to `DB_WEBHOOK_URL` if set.
See `fixtures/sample-output.json` for a full example. Every record has a stable `id`, so the
database should **upsert by id**: re-running the collector updates records instead of duplicating them.

| Collection | Fields |
|---|---|
| `clubs` | `id` (= Instagram handle), `name`, `alsoKnownAs`, `instagram`, `instagramUrl`, `category`, `bio`, `website`, `profilePictureUrl`, `followers`, `lastPostAt` |
| `events` | `id`, `clubId`, `clubName`, `postId`, `permalink`, `title`, `kind` (`meeting` / `event` / `deadline`), `start`, `end`, `allDay`, `recurring` (weekday or null), `location` |
| `announcements` | `id`, `clubId`, `clubName`, `title`, `summary`, `important`, `postedAt`, `permalink` |
| `links` | `id`, `clubId`, `clubName`, `url`, `label`, `kind` (`discord` / `form` / `linktree` / `document` / `event` / `social` / `website`), `postId` |
| `posts` | `id`, `clubId`, `postedAt`, `permalink`, `imageUrl`, `caption`, `type`, `important`, `title`, `summary`, `extractedBy` |
| `errors` | `club`, `message` (clubs that couldn't be read) |

All times are ISO 8601 in UTC (`2026-11-18T02:00:00.000Z`). Display them in `America/Los_Angeles`.
`allDay: true` means no time was given (deadlines, "club fair tomorrow").

## Search for the website

`src/search.js` exports `searchClubs(data, query)`. It's plain JavaScript, so the React app can import
it and run it on the same JSON (or the database can do the same matching). It matches full names, partial
names, abbreviations ("cs", "csc") and handles, and returns each club with its upcoming events,
recent announcements and links.

```js
import { searchClubs } from '../collector/src/search.js'
const results = searchClubs(data, 'debate')
// [{ club, upcomingEvents, announcements, links }]
```

## Files

```
collector/
  clubs.json               the 134 UCSC clubs to collect
  src/update-clubs.js      refreshes clubs.json from the UCSC directory
  .env.example             settings template
  src/index.js             main pipeline + CLI
  src/instagram.js         Instagram Business Discovery API
  src/extract.js           rule-based date / time / location / link extraction
  src/llm.js               optional Claude extraction (reads flyers)
  src/search.js            club search
  fixtures/demo-posts.json sample posts for `npm run demo`
  fixtures/sample-output.json example output
```
