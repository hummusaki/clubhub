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
  for (const [system, cached, color] of [['light', 'dark', '#F1F6FE'], ['dark', 'light', '#151A24']]) {
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
  assert.deepEqual(result, { classes: new Set(['dark']), scheme: 'dark', color: '#151A24' })
})

test('destination controls and category chips keep their contrast in both themes', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const tokenBlock = selector => Object.fromEntries(
    [...css.match(new RegExp(selector + ' \\{([\\s\\S]*?)\\}'))[1].matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)]
      .map(([, token, color]) => [token, color])
  )
  function luminance(color) {
    const channels = color.slice(1).match(/../g).map(byte => parseInt(byte, 16) / 255)
    const [red, green, blue] = channels.map(value => value <= 0.04045
      ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const light = tokenBlock(':root')
  const dark = { ...light, ...tokenBlock('\\.dark') }
  for (const tokens of [light, dark]) {
    function check(foreground, background, minimum) {
      const [darkest, lightest] = [luminance(tokens[foreground]), luminance(tokens[background])].sort((a, b) => a - b)
      assert.ok((lightest + 0.05) / (darkest + 0.05) >= minimum, foreground + ' on ' + background)
    }
    for (const color of ['blue', 'green', 'purple', 'teal', 'red', 'yellow']) {
      check(color + '-ink', color + '-light', 4.5)
      check(color + '-ink', 'md-surface', 4.5)
    }
    for (const color of ['blue', 'green', 'purple', 'teal']) {
      check('on-' + color, color, 4.5)
      check(color, color + '-light', 3)
      check(color, 'md-surface', 3)
    }
    check('yellow-ink', 'purple-light', 4.5)
    check('md-outline', 'md-surface', 3)
    check('md-on-surface-variant', 'md-surface-shell', 4.5)
  }
})
