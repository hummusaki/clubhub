import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1]

function boot(systemDark, readStorage) {
  const classes = new Set()
  const style = {}
  let color
  runInNewContext(bootstrap, {
    window: { matchMedia: () => ({ matches: systemDark }) },
    localStorage: { getItem: readStorage },
    document: {
      documentElement: { classList: classes, style },
      querySelector: () => ({ setAttribute: (_, value) => { color = value } }),
    },
  })
  return { classes, scheme: style.colorScheme, color }
}

test('the sign-in shell follows the system even with an opposite cached account preference', () => {
  for (const [system, cached, color] of [['light', 'dark', '#F8FAFD'], ['dark', 'light', '#131314']]) {
    const storage = {
      clubhub_user_settings_v1: JSON.stringify({ themeMode: cached, reduceMotion: true, compactCards: true }),
      clubhub_guest_theme_mode_v1: cached,
      clubhub_last_active_account_v1: 'email:fixture@example.test',
      clubhub_account_themes_v2: JSON.stringify({ 'email:fixture@example.test': cached }),
    }
    const result = boot(system === 'dark', key => storage[key])
    assert.deepEqual(result, { classes: new Set([system, 'reduce-motion', 'compact-cards']), scheme: system, color })
  }
})

test('the system theme is applied before reading browser storage', () => {
  const result = boot(true, () => { throw new Error('Storage disabled') })
  assert.deepEqual(result, { classes: new Set(['dark']), scheme: 'dark', color: '#131314' })
})
