import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

process.env.CLUBHUB_DB_PATH = ':memory:';

import {
  parseDirectory,
  parseBaskinDirectory,
  parseDserecSportClubs,
  parseGoslugsSubpage,
  parseCollegeGovernments,
  isGenuineUcscClubCandidate,
  formatDiscoveredClubEntry,
  discoverMentionsFromSnapshot,
  canonicalClubNameKey,
  updateClubsCatalog,
} from '../collector/src/update-clubs.js';
import {
  parseInstagramProfileHandle,
  extractInstagramHandleFromHtml,
} from '../collector/src/enrichWeb.js';
import { collect, isGraphTokenOrPermissionBlock } from '../collector/src/index.js';
import { categorizeClub as backendCategorize } from '../collector/src/categorize.js';
import { categorizeClub as frontendCategorize } from '../src/utils/clubCategories.js';
import {
  closeDb,
  getDb,
  upsertCollectorData,
  getAllCollectorData,
} from '../server/database.js';

function padDummySomecaClubs(count = 20) {
  let html = '';
  for (let i = 1; i <= count; i++) {
    html += `
      <h2>Dummy Test Club ${i}</h2>
      <p>Active registered student organization #${i} at UC Santa Cruz.</p>
      <p><a href="https://www.instagram.com/ucsc_dummy_${i}/">Instagram</a></p>
      <p><a href="mailto:dummy${i}@ucsc.edu">dummy${i}@ucsc.edu</a></p>
    `;
  }
  return html;
}

describe('Multi-Source UCSC Club Discovery, Grassroots Classifier & Non-IG Fetching Pipeline', () => {
  beforeEach(() => {
    closeDb();
    process.env.CLUBHUB_DB_PATH = ':memory:';
    getDb();
  });

  after(() => {
    closeDb();
  });

  it('parses SOMeCA HTML cleanly with nested <strong> suspended headings, probation retention, and no-IG clubs', () => {
    const html = `
      <h1>Join a Student Organization</h1>
      <h2>Browse by Category</h2>
      <h2>Delta Sigma Pi</h2>
      <p>Pre-Professional co-ed business fraternity at UC Santa Cruz.</p>
      <p><a href="https://www.instagram.com/ucscdsp/">@ucscdsp</a></p>
      <p><a href="mailto:pichipres@gmail.com">pichipres@gmail.com</a></p>

      <h2>Sigma Pi Alpha Sorority, Inc.</h2>
      <p>Chicana/Latina-based sorority empowering women through service and sisterhood.</p>
      <p><a href="https://www.instagram.com/ucsantacruzellas/">@ucsantacruzellas</a></p>

      <h2>Alpha Epsilon Pi</h2>
      <p>Jewish fraternity at UC Santa Cruz.</p>
      <p>Organization is currently on probation and permitted to continue chapter programming.</p>
      <p><a href="https://www.instagram.com/ucscaepi/">@ucscaepi</a></p>

      <h2>Yu-Gi-Oh @ UCSC</h2>
      <p>Weekly Yu-Gi-Oh casual play and tournaments on campus.</p>
      <p><a href="https://discord.gg/ucscygo">Discord</a></p>
      <p><a href="mailto:yugioh@ucsc.edu">yugioh@ucsc.edu</a></p>

      <h2>Sigma Phi Zeta</h2>
      <p>Please note this organization is in Interim Suspension until further notice.</p>
      <p><a href="https://www.instagram.com/sigmaphizeta_fraternity/">@sigmaphizeta_fraternity</a></p>

      <h2><strong><strong><strong>Suspended Organizations</strong></strong></strong></h2>
      <table>
        <tr><th>Organization</th><th>Status</th></tr>
        <tr><td>Alpha Epsilon Pi</td><td>On probation through Spring; permitted to continue chapter programming.</td></tr>
        <tr><td>Sigma Phi Zeta</td><td>Interim Suspension — cease all organizational activities.</td></tr>
        <tr><td>Sigma Pi</td><td>Dismissed organization.</td></tr>
      </table>
    `;

    const parsed = parseDirectory(html);
    const byName = new Map(parsed.map(c => [c.name, c]));

    assert.equal(byName.get('Delta Sigma Pi')?.suspended, false);
    assert.equal(byName.get('Sigma Pi Alpha Sorority, Inc.')?.suspended, false);

    const aepi = byName.get('Alpha Epsilon Pi');
    assert.ok(aepi);
    assert.equal(aepi.suspended, false, 'Probation orgs permitted to continue programming must remain active');
    assert.equal(aepi.orgStatus, 'probation');

    const ygo = byName.get('Yu-Gi-Oh @ UCSC');
    assert.ok(ygo);
    assert.equal(ygo.instagram, null);
    assert.equal(ygo.discord, 'https://discord.gg/ucscygo');
    assert.equal(ygo.email, 'yugioh@ucsc.edu');

    assert.equal(byName.get('Sigma Phi Zeta')?.suspended, true);
  });

  it('parses Baskin Engineering, OPERS/GoSlugs Sport Clubs, and Residential College Governments accurately', () => {
    const baskinHtml = `
      <h2>Join a BE club</h2>
      <div class="wp-block-column">
        <div class="wp-block-cover"><img src="https://undergrad.engineering.ucsc.edu/fs-logo.png" /></div>
        <p><a href="https://formulaslug.com/">Formula Slug</a></p>
      </div>
      <div class="wp-block-column">
        <div class="wp-block-cover"><img src="https://undergrad.engineering.ucsc.edu/sb-logo.png" /></div>
        <p><a href="https://www.instagram.com/slugbotics/">Slugbotics</a></p>
      </div>
      <div class="wp-block-column">
        <div class="wp-block-cover"></div>
        <p><a href="https://events.ucsc.edu/baskin-day">Baskin Day</a></p>
      </div>
      <footer>
        <div class="wp-block-column">
          <p><a href="https://www.instagram.com/baskinengineering/">Instagram</a></p>
        </div>
      </footer>
    `;
    const baskin = parseBaskinDirectory(baskinHtml);
    assert.equal(baskin.length, 2, 'Should skip Baskin Day and footer columns without wp-block-cover');
    assert.equal(baskin[0].name, 'Formula Slug');
    assert.equal(baskin[0].website, 'https://formulaslug.com/');
    assert.equal(baskin[0].iconUrl, 'https://undergrad.engineering.ucsc.edu/fs-logo.png');
    assert.equal(baskin[1].name, 'Slugbotics');
    assert.equal(baskin[1].instagram, 'slugbotics');

    const subHtml = `
      <html>
        <head><title>SC - Cross Country - University of California, Santa Cruz</title></head>
        <body>
          <article>
            <p>Follow us on <a href="https://www.instagram.com/slugxc/">Instagram</a></p>
            <p>Contact <a href="mailto:slugxc@ucsc.edu">slugxc@ucsc.edu</a></p>
          </article>
        </body>
      </html>
    `;
    const sub = parseGoslugsSubpage(subHtml, 'https://goslugs.com/sports/2025/1/27/cross-country.aspx');
    assert.equal(sub.name, 'UCSC Cross Country Club');
    assert.equal(sub.instagram, 'slugxc');
    assert.equal(sub.email, 'slugxc@ucsc.edu');

    const sportClubs = parseDserecSportClubs(
      [
        {
          name: 'Cross Country',
          is_active: true,
          show_online: true,
          team_website: 'https://goslugs.com/sports/2025/1/27/cross-country.aspx',
          description: 'Competitive distance running club for UCSC Banana Slugs.',
        },
        {
          name: 'Inactive Club',
          is_active: false,
          show_online: true,
        },
      ],
      [sub]
    );
    assert.equal(sportClubs.length, 1);
    assert.equal(sportClubs[0].instagram, 'slugxc');
    assert.equal(sportClubs[0].email, 'slugxc@ucsc.edu');

    const collegesHtml = `
      <h3>Kresge College</h3>
      <p>Official Kresge student parliament.</p>
      <p><a href="https://www.instagram.com/kresge_parliament/">@kresge_parliament</a></p>
      <p><a href="mailto:kresgeparl@ucsc.edu">kresgeparl@ucsc.edu</a></p>
    `;
    const govs = parseCollegeGovernments(collegesHtml);
    assert.equal(govs.length, 1);
    assert.equal(govs[0].name, 'Kresge Parliament');
    assert.equal(govs[0].instagram, 'kresge_parliament');
  });

  it('classifies grassroots UCSC clubs (Slugs on Wheels, Slugs on Two Wheels, Ski & Snow) while blocking non-UCSC collisions', () => {
    const validCandidates = [
      { username: 'slugsonwheelsclub', full_name: 'Slugs On Wheels UCSC', is_private: false },
      { username: 'slugsontwowheels', full_name: 'SlugWerks', is_private: false },
      { username: 'santacruzskiandsnow', full_name: 'Santa Cruz Ski & Board Club', is_private: false },
      { username: 'slugxc', full_name: 'UCSC Cross Country Club', is_private: false },
      { username: 'ucsc_mwp', full_name: "UCSC Men's Water Polo Club", is_private: false },
      { username: 'formulaslug', full_name: 'Formula Slug', is_private: false },
      { username: 'cruzhacks', full_name: 'CruzHacks', is_private: false },
      { username: 'ucsccostcoclub', full_name: 'UCSC Costco Club', is_private: false },
    ];
    for (const c of validCandidates) {
      assert.equal(
        isGenuineUcscClubCandidate(c),
        true,
        `Expected @${c.username} (${c.full_name}) to be accepted as a genuine UCSC club`
      );
    }

    const formattedTwoWheels = formatDiscoveredClubEntry({
      username: 'slugsontwowheels',
      full_name: 'SlugWerks',
    });
    assert.equal(formattedTwoWheels.name, 'Slugs on Two Wheels (SlugWerks)');
    assert.deepEqual(formattedTwoWheels.alsoKnownAs, ['Slugs on Two Wheels', 'SlugWerks']);

    const rejectedCandidates = [
      { username: 'feucsc', full_name: 'Federación de Estudiantes Facultad Ingeniería UCSC Chile', is_private: false },
      { username: 'jecatt_ucsc', full_name: 'Junior Enterprise Cattolica LM-93', is_private: false },
      { username: 'washucsc', full_name: 'WashU Computer Science Club', is_private: false },
      { username: 'ucsclimbing', full_name: 'UCS Climbing Team', is_private: false },
      { username: 'ucsc_taps', full_name: 'UCSC TAPS Transportation', is_private: false },
      { username: 'pasatiempocc', full_name: 'UCSC Area Country Club', is_private: false },
      { username: 'sigmaphizeta_fraternity', full_name: 'UCSC Sigma Phi Zeta Fraternity', is_private: false },
      { username: 'private_ucsc_club', full_name: 'UCSC Secret Club', is_private: true },
    ];
    for (const bad of rejectedCandidates) {
      assert.equal(
        isGenuineUcscClubCandidate(bad),
        false,
        `Expected @${bad.username} (${bad.full_name}) to be rejected`
      );
    }

    const mentions = discoverMentionsFromSnapshot(
      {
        posts: [
          {
            caption:
              'Shredding Tahoe this weekend with @santacruzskiandsnow and @kresge_parliament!',
          },
        ],
        clubs: [],
      },
      new Set()
    );
    const mentionHandles = new Set(mentions.map(m => m.instagram));
    assert.equal(mentionHandles.has('santacruzskiandsnow'), true);
    assert.equal(mentionHandles.has('kresge_parliament'), true);
    const kresge = mentions.find(m => m.instagram === 'kresge_parliament');
    assert.equal(kresge.name, 'Kresge Parliament');
  });

  it('merges multi-source catalogs non-destructively and links no-IG directory orgs to discovered IG handles', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubhub-catalog-test-'));
    const clubsFile = path.join(tmpDir, 'clubs.json');

    try {
      // Seed an existing manual club + previously discovered IG club
      fs.writeFileSync(
        clubsFile,
        JSON.stringify(
          [
            {
              name: 'Custom Manual Slug Club',
              instagram: 'manual_slug_club',
              category: 'community',
              manual: true,
              sources: ['manual'],
            },
          ],
          null,
          2
        )
      );

      const somecaHtml = `
        ${padDummySomecaClubs(20)}
        <h2>Yu-Gi-Oh @ UCSC</h2>
        <p>Card game club at UC Santa Cruz.</p>
        <p><a href="https://discord.gg/ucscygo">Discord</a></p>
        <p><a href="mailto:yugioh@ucsc.edu">yugioh@ucsc.edu</a></p>
      `;

      const baskinHtml = `
        <h2>Join a BE club</h2>
        <div class="wp-block-column">
          <div class="wp-block-cover"><img src="https://example.com/fs.png" /></div>
          <p><a href="https://formulaslug.com/">Formula Slug</a></p>
        </div>
      `;

      const res = await updateClubsCatalog({
        htmlOverride: somecaHtml,
        baskinHtmlOverride: baskinHtml,
        dserecJsonOverride: [],
        goslugsSubpagesOverride: [],
        collegesGovHtmlOverride: '<div></div>',
        igCandidatesOverride: [
          { username: 'formulaslug', full_name: 'UCSC Formula Slug', is_private: false },
          { username: 'slugsonwheelsclub', full_name: 'Slugs On Wheels UCSC', is_private: false },
          { username: 'slugsontwowheels', full_name: 'SlugWerks', is_private: false },
          { username: 'santacruzskiandsnow', full_name: 'Santa Cruz Ski & Board Club', is_private: false },
        ],
        crawlDirectoryWebsites: false,
        clubsFilePath: clubsFile,
      });

      const byHandle = new Map(res.clubs.filter(c => c.instagram).map(c => [c.instagram, c]));
      assert.ok(byHandle.has('slugsonwheelsclub'));
      assert.ok(byHandle.has('slugsontwowheels'));
      assert.ok(byHandle.has('santacruzskiandsnow'));
      assert.ok(byHandle.has('manual_slug_club'));

      // Formula Slug from Baskin (no IG in HTML) should merge cleanly with @formulaslug from IG discovery!
      const fsClub = byHandle.get('formulaslug');
      assert.ok(fsClub, 'Expected Baskin Formula Slug to link with @formulaslug');
      assert.equal(fsClub.website, 'https://formulaslug.com/');
      assert.ok(fsClub.sources.includes('baskin_engineering'));
      assert.ok(fsClub.sources.includes('instagram_discovery'));
      assert.equal(
        res.clubs.filter(c => canonicalClubNameKey(c.name) === canonicalClubNameKey('Formula Slug')).length,
        1,
        'Formula Slug must not appear twice'
      );

      // Yu-Gi-Oh @ UCSC has no Instagram and should be preserved with a clean `noig_*` id
      const ygo = res.clubs.find(c => c.name === 'Yu-Gi-Oh @ UCSC');
      assert.ok(ygo);
      assert.equal(ygo.id, 'noig_yu_gi_oh_ucsc');
      assert.equal(ygo.instagram, '');
      assert.equal(ygo.noInstagram, true);

      // Subsequent run WITHOUT Instagram discovery (e.g. unauthenticated CI) must preserve `instagram_discovery` clubs!
      const prevSkip = process.env.SKIP_IG_CLUB_DISCOVERY;
      process.env.SKIP_IG_CLUB_DISCOVERY = 'true';
      try {
        const ciRes = await updateClubsCatalog({
          htmlOverride: somecaHtml,
          baskinHtmlOverride: baskinHtml,
          dserecJsonOverride: [],
          goslugsSubpagesOverride: [],
          collegesGovHtmlOverride: '<div></div>',
          crawlDirectoryWebsites: false,
          clubsFilePath: clubsFile,
        });
        const ciHandles = new Set(ciRes.clubs.map(c => c.instagram).filter(Boolean));
        assert.equal(ciHandles.has('slugsonwheelsclub'), true);
        assert.equal(ciHandles.has('slugsontwowheels'), true);
        assert.equal(ciHandles.has('santacruzskiandsnow'), true);
      } finally {
        if (prevSkip === undefined) delete process.env.SKIP_IG_CLUB_DISCOVERY;
        else process.env.SKIP_IG_CLUB_DISCOVERY = prevSkip;
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('extracts Instagram handles from club website HTML while ignoring reserved paths and umbrella accounts', () => {
    assert.equal(parseInstagramProfileHandle('https://www.instagram.com/_u/formulaslug/'), 'formulaslug');
    assert.equal(parseInstagramProfileHandle('https://www.instagram.com/p/ABC12345/'), null);
    assert.equal(parseInstagramProfileHandle('https://www.instagram.com/baskinengineering/'), null);

    const html = `
      <footer>
        <a href="https://www.instagram.com/ucsc/">UCSC</a>
        <a href="https://www.instagram.com/p/DF12345/">Latest Post</a>
        <a href="https://www.instagram.com/slugbotics/">Follow Slugbotics</a>
      </footer>
    `;
    assert.equal(extractInstagramHandleFromHtml(html), 'slugbotics');
  });

  it('trips Graph API circuit breaker on codes 200/190/10, handles non-IG clubs end-to-end, and categorizes accurately', async () => {
    assert.equal(isGraphTokenOrPermissionBlock({ code: 200, message: '(#200) API access blocked.' }), true);
    assert.equal(isGraphTokenOrPermissionBlock({ code: 190, message: 'Error validating access token' }), true);
    assert.equal(isGraphTokenOrPermissionBlock({ code: 10, message: 'Application does not have permission' }), true);
    assert.equal(isGraphTokenOrPermissionBlock({ code: 100, message: 'Invalid user id' }), false);

    // Collect a non-Instagram club offline without hitting Graph API or Python scraper
    const collected = await collect({
      demo: false,
      clubsOverride: [
        {
          id: 'noig_yu_gi_oh_ucsc',
          noInstagram: true,
          name: 'Yu-Gi-Oh @ UCSC',
          instagram: '',
          email: 'yugioh@ucsc.edu',
          discord: 'https://discord.gg/ucscygo',
          description: 'Card game club at UCSC.',
        },
      ],
    });
    assert.equal(collected.clubs.length, 1);
    const noIgClub = collected.clubs[0];
    assert.equal(noIgClub.id, 'noig_yu_gi_oh_ucsc');
    assert.equal(noIgClub.instagram, '');
    assert.equal(noIgClub.instagramUrl, null);
    assert.equal(noIgClub.syncStatus, 'synced');
    assert.equal(
      collected.links.some(l => l.url.includes('instagram.com')),
      false,
      'Non-Instagram clubs must not get fake instagram.com/noig_* links'
    );

    // Upsert into SQLite and read back via getAllCollectorData()
    upsertCollectorData(collected);
    const exported = getAllCollectorData();
    const dbNoIg = exported.clubs.find(c => c.id === 'noig_yu_gi_oh_ucsc');
    assert.ok(dbNoIg);
    assert.equal(dbNoIg.instagram, '');
    assert.equal(dbNoIg.instagramUrl, null);
    assert.equal(dbNoIg.category, 'gaming');

    // Verify backend & frontend category parity across newly discovered club types
    const categoryCases = [
      [{ name: 'Slugs On Wheels UCSC', instagram: 'slugsonwheelsclub' }, 'gaming'],
      [{ name: 'Slugs on Two Wheels (SlugWerks)', instagram: 'slugsontwowheels' }, 'gaming'],
      [{ name: 'Santa Cruz Ski & Board Club', instagram: 'santacruzskiandsnow' }, 'gaming'],
      [{ name: 'Formula Slug', instagram: 'formulaslug' }, 'tech & science'],
      [{ name: 'CruzHacks', instagram: 'cruzhacks' }, 'tech & science'],
      [{ name: 'KZSC Santa Cruz 88.1 FM', instagram: 'kzsc881' }, 'media & arts'],
      [{ name: 'Kresge Parliament', instagram: 'kresge_parliament' }, 'service & advocacy'],
    ];
    for (const [sample, expected] of categoryCases) {
      assert.equal(backendCategorize(sample), expected, `Backend category mismatch for ${sample.name}`);
      assert.equal(frontendCategorize(sample), expected, `Frontend category mismatch for ${sample.name}`);
    }
  });

  it('compiles Python Instagram scraper & discovery scripts cleanly and prevents /embed/ <script> false-positive 404s', () => {
    const venvPy = path.join(REPO_ROOT, '.venv', 'bin', 'python3');
    const pyBin = fs.existsSync(venvPy) ? venvPy : 'python3';
    const scraperPath = path.join(REPO_ROOT, 'collector', 'scripts', 'scrape_personal_ig.py');
    const discoverPath = path.join(REPO_ROOT, 'collector', 'scripts', 'discover_ig_clubs.py');

    const compileRes = spawnSync(pyBin, ['-m', 'py_compile', scraperPath, discoverPath], {
      encoding: 'utf8',
    });
    assert.equal(compileRes.status, 0, `Python syntax check failed: ${compileRes.stderr}`);

    // Verify scrape_personal_ig.py strips <script> bundles before checking "Profile isn't available"
    const scraperCode = fs.readFileSync(scraperPath, 'utf8');
    assert.match(scraperCode, /usernameinfo/);
    assert.match(scraperCode, /visible_html\s*=\s*re\.sub\(r"<script/);
  });
});
