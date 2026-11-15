import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {
  normalizeCalendarSyncSettings,
  filterEventsForCalendarSync,
  buildIcsCalendar,
} from './src/utils/calendarSync.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATIC_SNAPSHOT_PATH = path.resolve(__dirname, 'public/clubhub-data.json')

function clubhubCalendarFeedPlugin() {
  const memoryProfiles = new Map()

  function loadSnapshotEvents() {
    try {
      if (!fs.existsSync(STATIC_SNAPSHOT_PATH)) return []
      const parsed = JSON.parse(fs.readFileSync(STATIC_SNAPSHOT_PATH, 'utf8'))
      return Array.isArray(parsed?.events) ? parsed.events : []
    } catch {
      return []
    }
  }

  function attachMiddleware(middlewares) {
    middlewares.use((req, res, next) => {
      if (!req.url || !req.url.startsWith('/__clubhub_cal/')) {
        return next()
      }

      const urlObj = new URL(req.url, 'http://localhost')
      const pathname = urlObj.pathname

      if (req.method === 'PUT' && pathname.startsWith('/__clubhub_cal/profile/')) {
        const rawToken = decodeURIComponent(pathname.slice('/__clubhub_cal/profile/'.length))
        const cleanToken = rawToken.replace(/\.ics$/i, '').trim()
        let rawBody = ''
        req.on('data', chunk => {
          rawBody += chunk
        })
        req.on('end', () => {
          try {
            const body = rawBody ? JSON.parse(rawBody) : {}
            const payload = {
              joinedClubIds: Array.isArray(body.joinedClubIds) ? body.joinedClubIds.map(String) : [],
              rsvpIds: Array.isArray(body.rsvpIds) ? body.rsvpIds.map(String) : [],
              customEvents: Array.isArray(body.customEvents) ? body.customEvents : [],
              fallbackEvents: Array.isArray(body.fallbackEvents) ? body.fallbackEvents : [],
              removedEventIds: Array.isArray(body.removedEventIds) ? body.removedEventIds.map(String) : [],
              settings: normalizeCalendarSyncSettings(body.settings),
              updatedAt: new Date().toISOString(),
            }
            memoryProfiles.set(cleanToken, payload)

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                ok: true,
                token: cleanToken,
                feedPath: `/__clubhub_cal/feed/${encodeURIComponent(cleanToken)}.ics`,
                updatedAt: payload.updatedAt,
              })
            )
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: err.message || 'Invalid JSON' }))
          }
        })
        return
      }

      if (req.method === 'GET' && pathname.startsWith('/__clubhub_cal/feed/')) {
        const rawToken = decodeURIComponent(pathname.slice('/__clubhub_cal/feed/'.length))
        const cleanToken = rawToken.replace(/\.ics$/i, '').trim()
        const stored = memoryProfiles.get(cleanToken) || {}

        const queryClubs = urlObj.searchParams.get('clubs')
        const queryRsvps = urlObj.searchParams.get('rsvps')
        const joinedClubIds = queryClubs
          ? queryClubs.split(',').map(s => s.trim()).filter(Boolean)
          : stored.joinedClubIds || []
        const rsvpIds = queryRsvps
          ? queryRsvps.split(',').map(s => s.trim()).filter(Boolean)
          : stored.rsvpIds || []

        const settings = normalizeCalendarSyncSettings({
          ...(stored.settings || {}),
          ...(urlObj.searchParams.get('scope') ? { clubScope: urlObj.searchParams.get('scope') } : {}),
          ...(urlObj.searchParams.has('rsvpOnly')
            ? {
                rsvpOnly:
                  urlObj.searchParams.get('rsvpOnly') === '1' ||
                  urlObj.searchParams.get('rsvpOnly') === 'true',
              }
            : {}),
        })

        const removedSet = new Set((stored.removedEventIds || []).map(String))
        const pool = [
          ...(stored.customEvents || []),
          ...(stored.fallbackEvents || []),
          ...loadSnapshotEvents(),
        ].filter(ev => ev && ev.id && !removedSet.has(String(ev.id)))

        const filtered = filterEventsForCalendarSync(pool, {
          joinedClubIds,
          rsvpIds,
          settings,
        })
        const ics = buildIcsCalendar(filtered, {
          settings,
          rsvpIds,
          joinedCount: joinedClubIds.length,
        })

        res.statusCode = 200
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
        res.setHeader('Content-Disposition', 'inline; filename="clubhub-calendar.ics"')
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.end(ics)
        return
      }

      next()
    })
  }

  return {
    name: 'clubhub-calendar-feed',
    configureServer(server) {
      attachMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares)
    },
  }
}

export default defineConfig({
  base: './',
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    react(),
    tailwindcss(),
    clubhubCalendarFeedPlugin(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
