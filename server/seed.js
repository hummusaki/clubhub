// ── Seed the database with sample data matching the ClubHub frontend ──
// Populates clubs, events, announcements, members, links, data sources,
// ingested items (Instagram, Discord, Email, Google Calendar, Website),
// and the dictionary store.

import { getDb, setDictEntry } from './database.js';
import { ingestAndIndexItem } from './services/extractor.js';

export function seedDatabase() {
  const db = getDb();

  // Only seed if clubs table is empty
  const count = db.prepare('SELECT COUNT(*) AS n FROM clubs').get().n;
  if (count > 0) return;

  console.log('🌱 Seeding ClubHub database & dictionary...');

  const insertClub = db.prepare(`
    INSERT INTO clubs (
      slug, name, abbreviation, description, category,
      meeting_schedule, meeting_location, avatar_bg,
      website_url, instagram_handle, discord_invite, mailing_list, gcal_id,
      member_count, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO tags (label, color) VALUES (?, ?)
  `);

  const insertClubTag = db.prepare(`
    INSERT OR IGNORE INTO club_tags (club_id, tag_id) VALUES (?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO events (club_id, title, description, location, start_time, end_time, duration, color, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAnnouncement = db.prepare(`
    INSERT INTO announcements (club_id, title, body, type, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMember = db.prepare(`
    INSERT INTO members (name, email, attendance, joined_at, status) VALUES (?, ?, ?, ?, ?)
  `);

  const insertClubMember = db.prepare(`
    INSERT INTO club_members (club_id, member_id, role) VALUES (?, ?, ?)
  `);

  const insertLink = db.prepare(`
    INSERT INTO links (club_id, title, url, description, icon, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertDataSource = db.prepare(`
    INSERT INTO data_sources (club_id, platform, identifier, is_active, last_synced)
    VALUES (?, ?, ?, 1, datetime('now'))
  `);

  // ── Clubs ──
  const clubsData = [
    [
      'cs', 'Computer Science Club', 'CS',
      'Weekly coding sessions, hackathons, and tech talks', 'academic',
      'Tuesdays 2 PM', 'Engineering Hall 204',
      'linear-gradient(135deg, var(--blue), #5B8DEF)',
      'https://csclub.uni.edu', '@csclub_uni', 'discord.gg/csclub', 'csclub@uni.edu', 'csclub@uni.edu',
      128,
    ],
    [
      'ds', 'Debate Society', 'DS',
      'Practice debates, tournaments, and public speaking', 'social',
      'Thursdays 4:30 PM', 'Humanities Building 110',
      'linear-gradient(135deg, var(--red), #D46B6B)',
      'https://debate.uni.edu', '@debatesociety_uni', 'discord.gg/debate', 'debate@uni.edu', 'debate@uni.edu',
      64,
    ],
    [
      'ac', 'Art Collective', 'AC',
      'Studio sessions, gallery shows, and art workshops', 'arts',
      'Sundays 1 PM', 'Arts Center 3B',
      'linear-gradient(135deg, var(--purple), #9575CD)',
      'https://artcollective.uni.edu', '@uni_artcollective', 'discord.gg/artcollective', 'art@uni.edu', 'art@uni.edu',
      45,
    ],
    [
      'ec', 'Econ Society', 'EC',
      'Finance discussions, guest speakers, and case competitions', 'academic',
      'Wednesdays 5 PM', 'Business Hall 301',
      'linear-gradient(135deg, var(--green), #66BB6A)',
      'https://econsociety.uni.edu', '@econsociety_uni', 'discord.gg/econsoc', 'econsociety@uni.edu', 'econsociety@uni.edu',
      89,
    ],
    [
      'acappella', 'A Cappella Group', '🎵',
      'Vocal performances, rehearsals, and campus concerts', 'social',
      'M/W/F 6 PM', 'Music Hall 102',
      'linear-gradient(135deg, var(--yellow), #F0B93B)',
      'https://acappella.uni.edu', '@uni_acappella', 'discord.gg/acappella', 'acappella@uni.edu', 'acappella@uni.edu',
      22,
    ],
  ];

  const clubIds = {};
  const seedAll = db.transaction(() => {
    for (const row of clubsData) {
      const info = insertClub.run(...row);
      const [slug, name, abbr, desc, cat, schedule, location, , website, ig, discord, email, gcal, members] = row;
      clubIds[abbr] = info.lastInsertRowid;

      // Mirror each club's core meeting & source info into the dictionary_store
      setDictEntry(`club:${slug}`, {
        id: info.lastInsertRowid,
        slug,
        name,
        abbreviation: abbr,
        category: cat,
        meeting_schedule: schedule,
        meeting_location: location,
        members,
        sources: { website, instagram: ig, discord, email, google_calendar: gcal },
      }, { namespace: 'clubs', clubId: info.lastInsertRowid, source: 'manual' });
    }

    // ── Tags ──
    const tagsData = [
      ['Tech', 'blue'], ['Coding', 'purple'], ['Speech', 'red'],
      ['Social', 'yellow'], ['Visual Arts', 'purple'], ['Studio', 'teal'],
      ['Finance', 'green'], ['Academic', 'blue'], ['Music', 'yellow'],
      ['Performance', 'red'],
    ];
    const tagIds = {};
    for (const [label, color] of tagsData) {
      insertTag.run(label, color);
      tagIds[label] = db.prepare('SELECT id FROM tags WHERE label = ?').get(label).id;
    }

    const clubTagMap = {
      CS: ['Tech', 'Coding'],
      DS: ['Speech', 'Social'],
      AC: ['Visual Arts', 'Studio'],
      EC: ['Finance', 'Academic'],
      '🎵': ['Music', 'Performance'],
    };
    for (const [abbr, tags] of Object.entries(clubTagMap)) {
      for (const tag of tags) {
        insertClubTag.run(clubIds[abbr], tagIds[tag]);
      }
    }

    // ── Events (today/tomorrow) ──
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const makeTime = (date, h, m) => {
      const d = new Date(date);
      d.setHours(h, m, 0, 0);
      return d.toISOString();
    };

    insertEvent.run(
      clubIds.CS, 'Weekly Standup', 'Regular weekly meeting & project sync',
      'Engineering Hall 204', makeTime(today, 14, 0), makeTime(today, 14, 45),
      '45 min', 'blue', 'google_calendar'
    );

    insertEvent.run(
      clubIds.DS, 'Practice', 'Parliamentary debate practice session',
      'Humanities Building 110', makeTime(today, 16, 30), makeTime(today, 17, 30),
      '1 hr', 'green', 'instagram'
    );

    insertEvent.run(
      clubIds.AC, 'Studio Session', 'Open figure drawing and studio time',
      'Arts Center 3B', makeTime(tomorrow, 13, 0), makeTime(tomorrow, 15, 0),
      '2 hrs', 'muted', 'website'
    );

    insertEvent.run(
      clubIds.EC, 'Guest Speaker', 'Finance industry panel & Q&A',
      'Business Hall 301', makeTime(tomorrow, 17, 0), makeTime(tomorrow, 18, 0),
      '1 hr', 'purple', 'email'
    );

    // ── Announcements ──
    insertAnnouncement.run(
      clubIds.CS, 'Room change for CS Club meeting',
      'Moved from EH 302 → EH 204. Same time!', 'urgent', 'discord'
    );

    insertAnnouncement.run(
      clubIds.CS, 'Hackathon sign-ups are live!',
      'Teams of 4 · Nov 22-23 · Register by Nov 18', 'event', 'instagram'
    );

    insertAnnouncement.run(
      null, 'New club approved: Robotics League',
      'Interest meeting next Monday at 5 PM in Engineering Hall 105', 'update', 'email'
    );

    // ── Members & Board ──
    const membersData = [
      ['Alex Lee',       'alee@uni.edu',   96, 'Sep 2024', 'active'],
      ['Maya Rodriguez', 'mrod@uni.edu',   94, 'Sep 2024', 'active'],
      ['Sam Kim',        'skim@uni.edu',   90, 'Oct 2024', 'active'],
      ['Tara Patel',     'tpatel@uni.edu', 88, 'Sep 2024', 'active'],
      ['Jamie Chen',     'jchen@uni.edu',  91, 'Nov 2024', 'active'],
      ['Emily Richards', 'erich@uni.edu',  92, 'Sep 2025', 'active'],
      ['David Wang',     'dwang@uni.edu',  78, 'Aug 2024', 'active'],
      ['Sofia Johnson',  'sjohn@uni.edu',  65, 'Jan 2026', 'moderate'],
      ['Raj Nair',       'rnair@uni.edu',  100, 'Sep 2023', 'active'],
    ];
    const memberIds = {};
    for (const [name, email, attendance, joined, status] of membersData) {
      const info = insertMember.run(name, email, attendance, joined, status);
      memberIds[name] = info.lastInsertRowid;
    }

    const boardRoles = [
      ['Alex Lee', 'president'], ['Maya Rodriguez', 'vice_president'],
      ['Sam Kim', 'treasurer'],  ['Tara Patel', 'secretary'],
      ['Jamie Chen', 'social_chair'],
    ];
    for (const [name, role] of boardRoles) {
      insertClubMember.run(clubIds.CS, memberIds[name], role);
    }

    insertClubMember.run(clubIds.CS,  memberIds['Emily Richards'], 'member');
    insertClubMember.run(clubIds.AC,  memberIds['Emily Richards'], 'member');
    insertClubMember.run(clubIds.CS,  memberIds['David Wang'],     'member');
    insertClubMember.run(clubIds.DS,  memberIds['David Wang'],     'member');
    insertClubMember.run(clubIds.EC,  memberIds['David Wang'],     'member');
    insertClubMember.run(clubIds['🎵'], memberIds['Sofia Johnson'], 'member');
    insertClubMember.run(clubIds.AC,  memberIds['Sofia Johnson'],  'member');
    insertClubMember.run(clubIds.CS,  memberIds['Raj Nair'],       'member');

    // ── Links ──
    insertLink.run(clubIds.CS, 'CS Club Constitution',
      'https://docs.google.com/example', 'Google Docs · Updated Oct 28', 'FileText', 'blue');
    insertLink.run(clubIds.CS, 'Budget Spreadsheet',
      'https://sheets.google.com/example', 'Google Sheets · Updated Nov 10', 'Table', 'green');
    insertLink.run(clubIds.CS, 'Discord Server',
      'https://discord.gg/csclub', 'discord.gg/csclub · 312 online', 'MessageCircle', 'purple');
    insertLink.run(clubIds.CS, 'Workshop Recordings',
      'https://youtube.com/example', 'YouTube · 18 videos', 'PlayCircle', 'yellow');
    insertLink.run(clubIds.CS, 'Hackathon Registration',
      'https://forms.google.com/example', 'Google Forms · Closes Nov 18', 'CheckCircle', 'red');

    // ── Data Sources ──
    insertDataSource.run(clubIds.CS, 'instagram',       '@csclub_uni');
    insertDataSource.run(clubIds.CS, 'discord',         'discord.gg/csclub');
    insertDataSource.run(clubIds.CS, 'email',           'csclub@uni.edu');
    insertDataSource.run(clubIds.CS, 'google_calendar', 'csclub@uni.edu');
    insertDataSource.run(clubIds.CS, 'website',         'https://csclub.uni.edu');

    insertDataSource.run(clubIds.DS, 'instagram',       '@debatesociety_uni');
    insertDataSource.run(clubIds.DS, 'discord',         'discord.gg/debate');
    insertDataSource.run(clubIds.DS, 'email',           'debate@uni.edu');

    insertDataSource.run(clubIds.AC, 'instagram',       '@uni_artcollective');
    insertDataSource.run(clubIds.AC, 'website',         'https://artcollective.uni.edu');

    insertDataSource.run(clubIds.EC, 'email',           'econsociety@uni.edu');
    insertDataSource.run(clubIds.EC, 'google_calendar', 'econsociety@uni.edu');

    insertDataSource.run(clubIds['🎵'], 'instagram',    '@uni_acappella');
    insertDataSource.run(clubIds['🎵'], 'discord',      'discord.gg/acappella');

    // ── Seed realistic Ingested Items from Instagram, Discord, Emails, Google Calendar, and Websites ──
    const sampleIngested = [
      {
        clubId: clubIds.CS,
        platform: 'instagram',
        identifier: '@csclub_uni',
        externalId: 'ig_cs_101',
        itemType: 'post',
        title: '🚀 Annual Campus Hackathon Sign-Ups Live!',
        body: 'Hackathon sign-ups are live! Join us Nov 22 at 9:00 AM in Engineering Hall 204. Teams of 4, free food & prizes! Link in bio.',
        author: '@csclub_uni',
        url: 'https://instagram.com/p/cs_hackathon_2026',
        metadata: { likes: 184, comments: 27 },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.CS,
        platform: 'discord',
        identifier: 'discord.gg/csclub',
        externalId: 'dc_cs_201',
        itemType: 'announcement',
        title: '⚠️ Room Change for Today\'s Weekly Standup',
        body: '@everyone Urgent room change! Today\'s Weekly Standup at 2:00 PM is moved from EH 302 → Engineering Hall 204. See you there!',
        author: 'Alex Lee (President)',
        url: 'https://discord.com/channels/csclub/announcements/201',
        metadata: { reactions: 42, pinned: true, channel: '#announcements' },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.CS,
        platform: 'email',
        identifier: 'csclub@uni.edu',
        externalId: 'em_cs_301',
        itemType: 'email',
        title: '[CS Club Newsletter] This Week\'s Meetings & Workshop Schedule',
        body: 'Hi CS Club members! Reminder: Weekly Standup is Tuesdays at 2:00 PM in Engineering Hall 204. We are also hosting an Intro to React & SQLite Workshop on Thursday at 6:00 PM in Engineering Hall 105.',
        author: 'csclub@uni.edu',
        metadata: { subject: '[CS Club Newsletter] This Week\'s Meetings & Workshop Schedule', list: 'csclub-members@uni.edu' },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.CS,
        platform: 'google_calendar',
        identifier: 'csclub@uni.edu',
        externalId: 'gcal_cs_401',
        itemType: 'calendar_event',
        title: 'CS Club Weekly Standup',
        body: 'Weekly general body meeting and project check-ins. Tuesdays at 2:00 PM in Engineering Hall 204.',
        author: 'csclub@uni.edu',
        url: 'https://calendar.google.com/calendar/event?eid=gcal_cs_401',
        explicitTime: 'Tuesdays 2:00 PM',
        explicitLocation: 'Engineering Hall 204',
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.CS,
        platform: 'website',
        identifier: 'https://csclub.uni.edu',
        externalId: 'web_cs_501',
        itemType: 'page_content',
        title: 'CS Club — Meeting Times & Officer Hours',
        body: 'General Meetings: Tuesdays at 2:00 PM in Engineering Hall 204. Open Lab Hours: Fridays at 3:00 PM in Engineering Hall 210.',
        author: 'csclub.uni.edu',
        url: 'https://csclub.uni.edu/schedule',
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.DS,
        platform: 'instagram',
        identifier: '@debatesociety_uni',
        externalId: 'ig_ds_102',
        itemType: 'post',
        title: '🎙️ Debate Practice & Mock Trial This Thursday!',
        body: 'Come debate with us on Thursdays at 4:30 PM in Humanities Building 110! No prior experience needed.',
        author: '@debatesociety_uni',
        url: 'https://instagram.com/p/debate_practice',
        metadata: { likes: 93, comments: 11 },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.DS,
        platform: 'discord',
        identifier: 'discord.gg/debate',
        externalId: 'dc_ds_202',
        itemType: 'message',
        title: 'Regional Tournament Travel Roster & Prep Session',
        body: 'Prep session for the regional tournament is Thursday at 4:30 PM in Humanities Building 110. Motion drops at 4:45 PM!',
        author: 'DebateVP',
        url: 'https://discord.com/channels/debate/general/202',
        metadata: { reactions: 19, pinned: true, channel: '#tournament-prep' },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.AC,
        platform: 'instagram',
        identifier: '@uni_artcollective',
        externalId: 'ig_ac_103',
        itemType: 'post',
        title: '🎨 Sunday Open Studio Session + Watercolors',
        body: 'Join our open studio session Sundays at 1:00 PM in Arts Center 3B! All canvases and paints provided.',
        author: '@uni_artcollective',
        url: 'https://instagram.com/p/art_studio_sunday',
        metadata: { likes: 142, comments: 18 },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds.EC,
        platform: 'email',
        identifier: 'econsociety@uni.edu',
        externalId: 'em_ec_302',
        itemType: 'email',
        title: '[Econ Society] Guest Speaker Panel — Tomorrow 5:00 PM',
        body: 'Don\'t miss our Quantitative Finance & Macro Panel on Wednesdays at 5:00 PM in Business Hall 301. Refreshments served!',
        author: 'econsociety@uni.edu',
        metadata: { subject: '[Econ Society] Guest Speaker Panel — Tomorrow 5:00 PM' },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
      {
        clubId: clubIds['🎵'],
        platform: 'discord',
        identifier: 'discord.gg/acappella',
        externalId: 'dc_ac_205',
        itemType: 'message',
        title: '🎵 Winter Showcase Rehearsal Schedule',
        body: 'Full group rehearsal M/W/F at 6:00 PM in Music Hall 102! Bring your sheet music and water.',
        author: 'VocalDirector',
        url: 'https://discord.com/channels/acappella/rehearsals/205',
        metadata: { reactions: 22, pinned: true, channel: '#rehearsals' },
        createEventIfFound: false,
        createAnnouncementIfFound: false,
      },
    ];

    for (const item of sampleIngested) {
      ingestAndIndexItem(item);
    }
  });

  seedAll();
  console.log('✅ ClubHub database & dictionary seeded successfully');
}
