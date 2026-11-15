// Fallback runner for public personal (non-business) Instagram club accounts.
// Spawns `collector/scripts/scrape_personal_ig.py` (Instaloader) ONLY for clubs that
// error out on Meta's Business Discovery API (error codes 100 / 110).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = path.resolve(__dirname, '../scripts/scrape_personal_ig.py')
const VENV_PYTHON = path.resolve(__dirname, '../../.venv/bin/python3')

export function scrapePersonalClubs(
  clubs = [],
  {
    limit = Number(process.env.PERSONAL_POSTS_PER_CLUB) || 10,
    delay = Number(process.env.IG_SCRAPER_DELAY_SEC) || 10,
    stories = process.env.IG_SCRAPER_STORIES === 'true',
    sessionUser = process.env.IG_SCRAPER_SESSION_USER || '',
    pythonBin = process.env.PYTHON_BIN || (fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python3'),
  } = {}
) {
  const validClubs = clubs.filter(c => Boolean(c?.instagram && String(c.instagram).trim()))
  if (!validClubs.length) return Promise.resolve({ items: [], errors: [] })

  const handles = validClubs.map(c => String(c.instagram).trim().replace(/^@+/, ''))
  const maxClubs = Number(process.env.IG_SCRAPER_MAX_CLUBS) || 0
  const args = [SCRIPT_PATH, '--limit', String(limit), '--delay', String(delay)]
  if (maxClubs > 0) args.push('--max-clubs', String(maxClubs))
  if (sessionUser) args.push('--session-user', sessionUser)
  if (stories) args.push('--stories')
  args.push(...handles)

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    })

    let stdout = ''
    proc.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8')
    })

    proc.on('error', err => {
      reject(new Error(`Could not launch ${pythonBin} for personal Instagram fallback: ${err.message}`))
    })

    proc.on('close', () => {
      let parsed
      try {
        parsed = JSON.parse(stdout.trim() || '{}')
      } catch {
        return resolve({
          items: [],
          errors: validClubs.map(c => ({
            club: c.instagram,
            message: `@${c.instagram}: fallback scraper returned invalid output`,
          })),
        })
      }

      if (parsed.fatalError) {
        console.warn(`\n! ${parsed.fatalError}`)
        return resolve({
          items: [],
          errors: validClubs.map(c => ({
            club: c.instagram,
            message: parsed.fatalError,
          })),
        })
      }

      const clubByHandle = new Map(
        validClubs.map(c => [String(c.instagram).trim().toLowerCase().replace(/^@+/, ''), c])
      )
      const items = (parsed.results || []).map(r => ({
        club: clubByHandle.get((r.handle || '').toLowerCase()) || {
          name: r.profile?.name || r.handle,
          instagram: r.handle,
          category: null,
        },
        profile: r.profile,
        posts: r.posts || [],
      }))

      resolve({
        items,
        errors: parsed.errors || [],
      })
    })
  })
}
