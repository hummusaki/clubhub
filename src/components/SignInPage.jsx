import { useState, useEffect, useRef, useCallback } from 'react'
import { SignIn } from '@clerk/react'
import {
  Moon,
  Sun,
  ShieldCheck,
  ArrowRight,
  Play,
  GraduationCap,
  Mail,
  Lock,
  User,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  Eye,
  EyeOff,
  Calendar,
  MapPin,
  Users,
  Check,
  MousePointerClick,
} from 'lucide-react'
import { getClerkAppearance } from '../clerkTheme'
import { ClubHubLogo, IconBadge, ClubAvatar } from './ui'
import { StatIcon, PlatformIcon } from './icons'

const ACCOUNTS_STORAGE_KEY = 'clubhub_registered_accounts'

const SHOWCASE_CLUBS = [
  {
    id: 'demo_ucsc_csclub',
    name: 'Computer Science Club',
    abbr: 'CS',
    category: 'academic',
    members: 1240,
    avatarBg: 'linear-gradient(135deg, var(--blue), #4B7BE5)',
  },
  {
    id: 'demo_ucsc_debate',
    name: 'Debate Society',
    abbr: 'DS',
    category: 'social',
    members: 410,
    avatarBg: 'linear-gradient(135deg, var(--red), #D46B6B)',
  },
  {
    id: 'demo_ucsc_artcollective',
    name: 'Art Collective',
    abbr: 'AC',
    category: 'arts',
    members: 650,
    avatarBg: 'linear-gradient(135deg, var(--purple), #8565C4)',
  },
  {
    id: 'demo_ucsc_robotics',
    name: 'Robotics League',
    abbr: 'RL',
    category: 'academic',
    members: 530,
    avatarBg: 'linear-gradient(135deg, var(--teal), #3E9B92)',
  },
]

const INITIAL_PREVIEW_EVENTS = [
  {
    id: 'evt_react',
    club: SHOWCASE_CLUBS[0],
    title: 'Intro to React & Modern UI Workshop',
    time: 'Tue · 6:00 PM',
    location: 'Baskin Eng 152',
    rsvps: 42,
    going: true,
    tagColor: 'blue',
  },
  {
    id: 'evt_art',
    club: SHOWCASE_CLUBS[2],
    title: 'Open Studio & Risograph Printmaking',
    time: 'Wed · 1:00 PM',
    location: 'Porter Studio 3B',
    rsvps: 29,
    going: false,
    tagColor: 'purple',
  },
  {
    id: 'evt_debate',
    club: SHOWCASE_CLUBS[1],
    title: 'Fall Parliamentary Showcase Round',
    time: 'Sat · 10:00 AM',
    location: 'Stevenson Event Ctr',
    rsvps: 64,
    going: false,
    tagColor: 'red',
  },
]

const LIVE_FEED_SIGNALS = [
  {
    id: 'sig_discord',
    platform: 'discord',
    color: 'purple',
    club: 'CS Club · #announcements',
    text: 'Hackathon team formation & pizza social starts at 5 PM in Baskin 152!',
    meta: '2m ago · Auto-extracted event',
  },
  {
    id: 'sig_insta',
    platform: 'instagram',
    color: 'red',
    club: '@ucsc_artcollective',
    text: 'Winter Zine submissions are officially open — drop by studio hours.',
    meta: '18m ago · Synced from Instagram',
  },
  {
    id: 'sig_gcal',
    platform: 'google_calendar',
    color: 'blue',
    club: 'Robotics League Calendar',
    text: 'Rover autonomy lab check-in & PCB soldering session added to schedule.',
    meta: '1h ago · Google Calendar sync',
  },
]

const FEATURE_HIGHLIGHTS = [
  {
    title: 'Active Clubs',
    subtitle: '40+ Tech, Arts & Social orgs',
    color: 'blue',
    icon: 'Users',
    badge: 'Live Roster',
  },
  {
    title: 'Verified Access',
    subtitle: 'Exclusive to @ucsc.edu emails',
    color: 'green',
    icon: 'Heart',
    badge: 'SSO Ready',
  },
  {
    title: 'Calendar Sync',
    subtitle: 'Auto-parsed times & rooms',
    color: 'yellow',
    icon: 'Calendar',
    badge: '1-Click RSVP',
  },
  {
    title: 'Multi-Channel',
    subtitle: 'Discord, IG & Newsletter',
    color: 'purple',
    icon: 'Link',
    badge: 'AI Indexed',
  },
]

function getSavedAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveAccount(account) {
  try {
    const existing = getSavedAccounts()
    existing[account.email.toLowerCase()] = account
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(existing))
  } catch {
    // Ignore storage errors
  }
}

function formatNameFromEmail(email) {
  const local = (email || 'student').split('@')[0]
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Attaches local cursor-tracking spotlight & subtle magnetic pull to a card element.
 */
function handleMagneticMove(e, strength = 6) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const nx = (x / rect.width - 0.5) * 2
  const ny = (y / rect.height - 0.5) * 2
  el.style.setProperty('--local-x', `${x.toFixed(1)}px`)
  el.style.setProperty('--local-y', `${y.toFixed(1)}px`)
  el.style.setProperty('--local-opacity', '1')
  el.style.setProperty('--mag-x', `${(nx * strength).toFixed(2)}px`)
  el.style.setProperty('--mag-y', `${(ny * strength).toFixed(2)}px`)
}

function handleMagneticLeave(e) {
  const el = e.currentTarget
  el.style.setProperty('--local-opacity', '0')
  el.style.setProperty('--mag-x', '0px')
  el.style.setProperty('--mag-y', '0px')
}

export default function SignInPage({
  dark,
  onToggleDark,
  hasPublishableKey,
  onEnterDemo,
  onLocalSignIn,
}) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'verify'
  const [useClerkWidget, setUseClerkWidget] = useState(Boolean(hasPublishableKey))
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState('')

  // Interactive preview state inside the hero stage
  const [previewTab, setPreviewTab] = useState('events') // 'events' | 'signals'
  const [previewEvents, setPreviewEvents] = useState(INITIAL_PREVIEW_EVENTS)
  const [motionEnabled, setMotionEnabled] = useState(true)

  // Refs for 60fps spring-interpolated cursor tracking without React re-renders
  const rootRef = useRef(null)
  const cursorOrbRef = useRef(null)
  const pointerRef = useRef({
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    rawX: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 600,
    rawY: typeof window !== 'undefined' ? window.innerHeight * 0.35 : 400,
    smoothRawX: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 600,
    smoothRawY: typeof window !== 'undefined' ? window.innerHeight * 0.35 : 400,
    active: false,
    lastInputTime: 0,
  })

  const normalizedEmail = email.trim().toLowerCase()
  const isUcscEmail = normalizedEmail.endsWith('@ucsc.edu')
  const isEduEmail = normalizedEmail.endsWith('.edu')

  // ── 60fps Cursor & Touch Parallax + Autonomous Mobile Drift Engine ──
  useEffect(() => {
    const rootEl = rootRef.current
    if (!rootEl) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced || !motionEnabled) {
      rootEl.style.setProperty('--mx', '0')
      rootEl.style.setProperty('--my', '0')
      return
    }

    let rafId = null
    const startTime = performance.now()

    const onMouseMove = e => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      const nx = Math.max(-1, Math.min(1, (e.clientX / w - 0.5) * 2))
      const ny = Math.max(-1, Math.min(1, (e.clientY / h - 0.5) * 2))
      pointerRef.current.targetX = nx
      pointerRef.current.targetY = ny
      pointerRef.current.rawX = e.clientX
      pointerRef.current.rawY = e.clientY
      pointerRef.current.active = true
      pointerRef.current.lastInputTime = performance.now()
    }

    const onMouseLeave = () => {
      pointerRef.current.active = false
    }

    const onTouchMove = e => {
      if (!e.touches || e.touches.length === 0) return
      const touch = e.touches[0]
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      // Gentle touch parallax multiplier so mobile scrolling stays natural
      const nx = Math.max(-1, Math.min(1, (touch.clientX / w - 0.5) * 1.4))
      const ny = Math.max(-1, Math.min(1, (touch.clientY / h - 0.5) * 1.1))
      pointerRef.current.targetX = nx
      pointerRef.current.targetY = ny
      pointerRef.current.rawX = touch.clientX
      pointerRef.current.rawY = touch.clientY
      pointerRef.current.active = true
      pointerRef.current.lastInputTime = performance.now()
    }

    const onTouchEnd = () => {
      pointerRef.current.active = false
    }

    const onDeviceOrientation = e => {
      if (pointerRef.current.active) return
      if (e.gamma !== null && e.beta !== null) {
        const gx = Math.max(-1, Math.min(1, e.gamma / 28))
        const by = Math.max(-1, Math.min(1, (e.beta - 40) / 28))
        pointerRef.current.targetX = gx * 0.75
        pointerRef.current.targetY = by * 0.75
        pointerRef.current.lastInputTime = performance.now()
      }
    }

    const tick = now => {
      const p = pointerRef.current
      const elapsed = (now - startTime) * 0.001
      const idleSec = (now - p.lastInputTime) * 0.001

      // Smooth figure-8 autonomous drift when idle or on mobile screens
      const driftX = Math.sin(elapsed * 0.75) * 0.38 + Math.cos(elapsed * 0.32) * 0.14
      const driftY = Math.cos(elapsed * 0.58) * 0.34 + Math.sin(elapsed * 0.41) * 0.12

      const blendDrift = !p.active || idleSec > 2.6 ? 1 : 0.08
      const desiredX = p.active && idleSec <= 2.6 ? p.targetX + driftX * blendDrift : driftX
      const desiredY = p.active && idleSec <= 2.6 ? p.targetY + driftY * blendDrift : driftY

      // Spring-like linear interpolation
      p.currentX += (desiredX - p.currentX) * 0.075
      p.currentY += (desiredY - p.currentY) * 0.075

      const w = window.innerWidth || 1000
      const h = window.innerHeight || 800
      const desiredRawX = p.active ? p.rawX : w * (0.5 + driftX * 0.28)
      const desiredRawY = p.active ? p.rawY : h * (0.4 + driftY * 0.25)

      p.smoothRawX += (desiredRawX - p.smoothRawX) * 0.11
      p.smoothRawY += (desiredRawY - p.smoothRawY) * 0.11

      rootEl.style.setProperty('--mx', p.currentX.toFixed(4))
      rootEl.style.setProperty('--my', p.currentY.toFixed(4))
      rootEl.style.setProperty('--spot-x', `${p.smoothRawX.toFixed(1)}px`)
      rootEl.style.setProperty('--spot-y', `${p.smoothRawY.toFixed(1)}px`)

      if (cursorOrbRef.current) {
        cursorOrbRef.current.style.transform = `translate3d(${(p.smoothRawX - 18).toFixed(1)}px, ${(p.smoothRawY - 18).toFixed(1)}px, 0)`
        cursorOrbRef.current.style.opacity = p.active ? '1' : '0'
      }

      rafId = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mouseleave', onMouseLeave, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true })

    rafId = requestAnimationFrame(tick)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('deviceorientation', onDeviceOrientation)
    }
  }, [motionEnabled])

  const togglePreviewRsvp = useCallback(eventId => {
    setPreviewEvents(prev =>
      prev.map(ev =>
        ev.id === eventId
          ? {
              ...ev,
              going: !ev.going,
              rsvps: ev.going ? ev.rsvps - 1 : ev.rsvps + 1,
            }
          : ev
      )
    )
  }, [])

  function handleFormSubmit(e) {
    e.preventDefault()
    setError('')

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Please enter a valid university email address (e.g. yourname@ucsc.edu).')
      return
    }

    if (mode === 'signup') {
      if (!fullName.trim()) {
        setError('Please enter your full name.')
        return
      }
      if (!isEduEmail) {
        setError('Please sign up with your @ucsc.edu (or university .edu) email address.')
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }
      setMode('verify')
      return
    }

    // Sign In mode
    if (password.length < 4) {
      setError('Please enter your password.')
      return
    }

    const accounts = getSavedAccounts()
    const saved = accounts[normalizedEmail]
    const resolvedName = saved?.fullName || fullName.trim() || formatNameFromEmail(normalizedEmail)
    const firstName = resolvedName.split(' ')[0]

    const userProfile = {
      fullName: resolvedName,
      firstName,
      email: normalizedEmail,
      primaryEmailAddress: { emailAddress: normalizedEmail },
      verifiedEdu: isEduEmail,
    }
    saveAccount(userProfile)
    if (onLocalSignIn) onLocalSignIn(userProfile)
  }

  function handleVerifySubmit(e) {
    e.preventDefault()
    setError('')
    const cleanOtp = otpCode.replace(/\D/g, '')
    if (cleanOtp.length < 6) {
      setError('Please enter the 6-digit verification code.')
      return
    }

    const resolvedName = fullName.trim() || formatNameFromEmail(normalizedEmail)
    const firstName = resolvedName.split(' ')[0]
    const userProfile = {
      fullName: resolvedName,
      firstName,
      email: normalizedEmail,
      primaryEmailAddress: { emailAddress: normalizedEmail },
      verifiedEdu: true,
    }
    saveAccount(userProfile)
    if (onLocalSignIn) onLocalSignIn(userProfile)
  }

  function handleGoogleUcscSignIn(presetEmail, presetName) {
    const resolvedEmail =
      presetEmail ||
      (normalizedEmail && normalizedEmail.includes('@') ? normalizedEmail : 'sslug@ucsc.edu')
    const resolvedName =
      presetName ||
      fullName.trim() ||
      (resolvedEmail === 'sslug@ucsc.edu' ? 'Sammy Slug' : formatNameFromEmail(resolvedEmail))
    const userProfile = {
      fullName: resolvedName,
      firstName: resolvedName.split(' ')[0],
      email: resolvedEmail,
      primaryEmailAddress: { emailAddress: resolvedEmail },
      verifiedEdu: true,
    }
    saveAccount(userProfile)
    if (onLocalSignIn) onLocalSignIn(userProfile)
  }

  function applyQuickPersona(personaEmail, personaName) {
    setError('')
    setEmail(personaEmail)
    setFullName(personaName)
    setPassword('sluglife2026')
  }

  const passwordStrength =
    password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3

  return (
    <div
      ref={rootRef}
      className="relative min-h-screen w-full flex flex-col bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 overflow-x-hidden select-none sm:select-auto"
      style={{
        '--mx': 0,
        '--my': 0,
        '--spot-x': '50%',
        '--spot-y': '35%',
      }}
    >
      {/* ── Ambient Cursor-Reactive Backdrop Layers ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
        {/* Architectural Dot Grid + Cursor Spotlight Illuminated Grid */}
        <div className="absolute inset-0 login-dot-grid" />
        <div className="absolute inset-0 login-dot-grid-glow" />

        {/* Parallax Aurora Cloud 1 — Top Left Blue */}
        <div
          className="parallax-float absolute -top-28 -left-24 w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] rounded-full blur-3xl opacity-55 dark:opacity-30"
          style={{
            '--depth-x': '-42px',
            '--depth-y': '-36px',
            background: 'radial-gradient(circle, var(--blue-light) 0%, transparent 72%)',
          }}
        />

        {/* Parallax Aurora Cloud 2 — Center Right Purple */}
        <div
          className="parallax-float absolute top-1/4 -right-28 w-[320px] sm:w-[480px] h-[320px] sm:h-[480px] rounded-full blur-3xl opacity-50 dark:opacity-25"
          style={{
            '--depth-x': '48px',
            '--depth-y': '-28px',
            background: 'radial-gradient(circle, var(--purple-light) 0%, transparent 72%)',
          }}
        />

        {/* Parallax Aurora Cloud 3 — Bottom Left Teal/Green */}
        <div
          className="parallax-float absolute -bottom-28 left-1/4 w-[300px] sm:w-[460px] h-[300px] sm:h-[460px] rounded-full blur-3xl opacity-50 dark:opacity-25"
          style={{
            '--depth-x': '32px',
            '--depth-y': '40px',
            background: 'radial-gradient(circle, var(--teal-light) 0%, transparent 72%)',
          }}
        />

        {/* Parallax Aurora Cloud 4 — Warm Yellow Accent */}
        <div
          className="parallax-float absolute top-16 left-1/2 -translate-x-1/2 w-[240px] sm:w-[360px] h-[240px] sm:h-[360px] rounded-full blur-3xl opacity-40 dark:opacity-20"
          style={{
            '--depth-x': '-24px',
            '--depth-y': '26px',
            background: 'radial-gradient(circle, var(--yellow-light) 0%, transparent 72%)',
          }}
        />

        {/* Smooth Cursor Follower Halo Ring (Desktop Fine Pointer Only) */}
        <div
          ref={cursorOrbRef}
          className="hidden lg:flex fixed top-0 left-0 w-9 h-9 rounded-full border border-[var(--blue)]/35 bg-[var(--blue)]/5 backdrop-blur-[1px] items-center justify-center transition-opacity duration-300"
          style={{ opacity: 0, willChange: 'transform' }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--blue)] opacity-70" />
        </div>
      </div>

      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 border-b border-[var(--border)] bg-[var(--bg-glass)] backdrop-blur-md">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div
            onMouseMove={e => handleMagneticMove(e, 5)}
            onMouseLeave={handleMagneticLeave}
            className="magnetic-item flex items-center gap-2.5 sm:gap-3"
          >
            <ClubHubLogo size={36} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg leading-tight tracking-tight text-[var(--text)]">
                  ClubHub
                </span>
                <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--blue)]/20">
                  UCSC
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-[var(--text-muted)]">
                Campus Organization Platform
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Interactive Parallax Toggle Pill (Desktop/Tablet) */}
          <button
            type="button"
            onClick={() => setMotionEnabled(prev => !prev)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium
              bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-muted)]
              hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
            title={motionEnabled ? 'Pause interactive motion' : 'Enable interactive motion'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                motionEnabled ? 'bg-[var(--green)] pulse-dot' : 'bg-[var(--text-light)]'
              }`}
            />
            <span>{motionEnabled ? 'Interactive Depth' : 'Static View'}</span>
          </button>

          {onEnterDemo && (
            <button
              type="button"
              onClick={onEnterDemo}
              onMouseMove={e => handleMagneticMove(e, 4)}
              onMouseLeave={handleMagneticLeave}
              className="magnetic-item flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-xs font-semibold
                bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)]
                hover:border-[var(--blue)] hover:text-[var(--blue)] transition-colors shadow-xs cursor-pointer"
            >
              <Play size={11} fill="currentColor" className="text-[var(--blue)]" />
              <span>Preview Demo</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleDark}
            onMouseMove={e => handleMagneticMove(e, 4)}
            onMouseLeave={handleMagneticLeave}
            className="magnetic-item flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full border border-[var(--border)]
              bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)]
              text-xs font-medium transition-colors shadow-xs cursor-pointer"
            title="Toggle theme"
            aria-label="Toggle color theme"
          >
            {dark ? <Sun size={15} className="text-[var(--yellow)]" /> : <Moon size={15} />}
            <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Stage ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 lg:px-12 py-6 sm:py-10 lg:py-12">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-7 sm:gap-8 lg:gap-10 items-center">
          {/* ── SECTION A: Hero Headline & Mobile Floating Club Strip ──
              Order 1 on both Mobile and Desktop (Left Col Top) */}
          <div className="order-1 lg:col-start-1 lg:col-span-7 space-y-4 sm:space-y-5 fade-in">
            <div className="flex flex-wrap items-center gap-2">
              <div
                onMouseMove={e => handleMagneticMove(e, 4)}
                onMouseLeave={handleMagneticLeave}
                className="magnetic-item inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold
                  bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--blue)]/20 shadow-2xs"
              >
                <GraduationCap size={15} />
                <span>Verified UCSC Student Community</span>
              </div>

              <div
                className="parallax-float inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium
                  bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] shadow-2xs"
                style={{ '--depth-x': '10px', '--depth-y': '-6px' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] pulse-dot" />
                <span>40+ Active Campus Orgs</span>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl xl:text-[44px] font-extrabold tracking-tight text-[var(--text)] leading-[1.12]">
                Every campus club,{' '}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      'linear-gradient(135deg, var(--blue) 0%, var(--purple) 55%, var(--teal) 100%)',
                  }}
                >
                  moving in sync.
                </span>
              </h1>

              <p className="text-sm sm:text-[15px] text-[var(--text-muted)] leading-relaxed max-w-xl">
                Sign in with your university email to discover student organizations, auto-sync
                Discord &amp; Instagram announcements, and RSVP to campus meetings in one place.
              </p>
            </div>

            {/* Mobile-Only Floating Parallax Club Pill Strip (Keeps login card high on phones while showing interactive motion) */}
            <div className="flex lg:hidden items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {SHOWCASE_CLUBS.map((club, i) => (
                <div
                  key={club.id}
                  className="parallax-float shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-xs"
                  style={{
                    '--depth-x': `${(i % 2 === 0 ? 1 : -1) * (10 + i * 3)}px`,
                    '--depth-y': `${(i % 2 === 0 ? -1 : 1) * 7}px`,
                  }}
                >
                  <ClubAvatar club={club} size={26} />
                  <div className="pr-1">
                    <div className="text-[11px] font-bold text-[var(--text)] leading-tight whitespace-nowrap">
                      {club.name}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono-num">
                      {club.members} members
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── SECTION B: Interactive Glassmorphic Auth Card ──
              Order 2 on Mobile (immediately reachable!), Right Column spanning rows on Desktop */}
          <div className="order-2 lg:order-3 lg:col-start-8 lg:col-span-5 lg:row-start-1 lg:row-end-3 flex flex-col items-center justify-center w-full fade-in">
            {hasPublishableKey && useClerkWidget ? (
              <div className="w-full flex flex-col items-center gap-3">
                <SignIn routing="hash" appearance={getClerkAppearance(dark)} />
                <button
                  type="button"
                  onClick={() => setUseClerkWidget(false)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--blue-ink)] underline cursor-pointer bg-transparent border-none"
                >
                  Use direct UCSC campus login instead
                </button>
              </div>
            ) : (
              <div
                onMouseMove={e => handleMagneticMove(e, 3)}
                onMouseLeave={handleMagneticLeave}
                className="spotlight-card auth-glass-card w-full max-w-[440px] border border-[var(--border)] rounded-[26px]
                  p-5 sm:p-7 md:p-8 shadow-[var(--shadow-lg)] space-y-5 transition-shadow duration-300"
              >
                {/* Decorative Top Gradient Accent Bar */}
                <div
                  className="absolute top-0 inset-x-8 h-[3px] rounded-b-full opacity-85"
                  style={{
                    background:
                      'linear-gradient(90deg, var(--blue), var(--purple), var(--teal), var(--yellow))',
                  }}
                />

                <div className="relative z-10 space-y-5">
                  {mode === 'verify' ? (
                    /* ── 6-Digit Email Verification Step ── */
                    <form onSubmit={handleVerifySubmit} className="space-y-4">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signup')
                          setError('')
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--blue-ink)] hover:underline cursor-pointer bg-transparent border-none"
                      >
                        <ArrowLeft size={14} />
                        Back to account details
                      </button>

                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--green-light)] text-[var(--green-ink)] mb-2">
                          <ShieldCheck size={13} />
                          UCSC Inbox Verification
                        </div>
                        <h2 className="text-xl font-bold text-[var(--text)]">
                          Verify your university email
                        </h2>
                        <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">
                          Enter the 6-digit verification code sent to{' '}
                          <strong className="text-[var(--text)]">{normalizedEmail}</strong>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setOtpCode('842910')}
                        className="w-full p-3 rounded-2xl bg-[var(--green-light)] border border-[var(--green)]/25 text-[var(--green-ink)] text-xs flex items-center justify-between cursor-pointer hover:opacity-95 transition-opacity"
                      >
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <CheckCircle2 size={15} />
                          Demo Instant Code: <strong className="font-mono-num">842910</strong>
                        </span>
                        <span className="text-[11px] underline font-semibold">Tap to auto-fill</span>
                      </button>

                      <div>
                        <label className="block text-xs font-semibold text-[var(--text)] mb-2">
                          6-Digit Verification Code
                        </label>

                        {/* Visual 6-digit segmented preview synced with input */}
                        <div className="relative">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="842910"
                            className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]
                              text-center text-lg font-bold font-mono-num tracking-[0.45em] text-[var(--text)]
                              outline-none focus:border-[var(--blue)] transition-colors"
                          />
                        </div>
                      </div>

                      {error && (
                        <div className="flex items-center gap-2 text-xs text-[var(--red-ink)] bg-[var(--red-light)] px-3.5 py-2.5 rounded-xl border border-[var(--red)]/20">
                          <AlertCircle size={14} className="shrink-0" />
                          <span>{error}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        className="w-full py-3 rounded-full bg-[var(--blue)] text-white text-sm font-semibold
                          shadow-[0_6px_18px_rgba(82,141,244,0.34)] flex items-center justify-center gap-1.5
                          hover:opacity-95 transition-all cursor-pointer border-none"
                      >
                        <span>Verify &amp; Launch Dashboard</span>
                        <ArrowRight size={15} />
                      </button>
                    </form>
                  ) : (
                    /* ── Sign In / Sign Up Card ── */
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--blue-ink)] mb-1">
                            <Sparkles size={12} />
                            <span>UCSC Campus Portal</span>
                          </div>
                          <h2 className="text-xl sm:text-[22px] font-extrabold tracking-tight text-[var(--text)]">
                            {mode === 'signup' ? 'Create Student Account' : 'Welcome back'}
                          </h2>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">
                            {mode === 'signup'
                              ? 'Register with your @ucsc.edu email address'
                              : 'Sign in with your campus credentials'}
                          </p>
                        </div>

                        {/* Mode Segmented Pill */}
                        <div className="flex items-center p-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setMode('signin')
                              setError('')
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border-none transition-all ${
                              mode === 'signin'
                                ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-xs'
                                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            Sign In
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMode('signup')
                              setError('')
                            }}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border-none transition-all ${
                              mode === 'signup'
                                ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-xs'
                                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            Sign Up
                          </button>
                        </div>
                      </div>

                      {/* Google @ucsc.edu Quick SSO Button */}
                      <button
                        type="button"
                        onClick={() => handleGoogleUcscSignIn()}
                        onMouseMove={e => handleMagneticMove(e, 4)}
                        onMouseLeave={handleMagneticLeave}
                        className="magnetic-item w-full py-2.5 sm:py-3 px-4 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]
                          border border-[var(--border)] hover:border-[var(--blue)]/50 text-xs sm:text-[13px] font-semibold text-[var(--text)]
                          flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-2xs"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
                          <path
                            d="M21.8 12.23C21.8 11.52 21.74 10.84 21.62 10.18H12V14.05H17.5C17.26 15.32 16.53 16.4 15.44 17.13V19.68H18.74C20.68 17.9 21.8 15.3 21.8 12.23Z"
                            fill="#4285F4"
                          />
                          <path
                            d="M12 22.2C14.76 22.2 17.07 21.29 18.75 19.68L15.45 17.13C14.54 17.74 13.38 18.11 12 18.11C9.35 18.11 7.1 16.32 6.29 13.91H2.89V16.54C4.56 19.86 8.01 22.2 12 22.2Z"
                            fill="#34A853"
                          />
                          <path
                            d="M6.29 13.91C6.08 13.3 5.96 12.64 5.96 11.95C5.96 11.26 6.08 10.6 6.29 9.99V7.36H2.89C2.19 8.74 1.8 10.3 1.8 11.95C1.8 13.6 2.19 15.16 2.89 16.54L6.29 13.91Z"
                            fill="#FBBC05"
                          />
                          <path
                            d="M12 5.79C13.5 5.79 14.84 6.31 15.9 7.32L18.82 4.4C17.06 2.76 14.75 1.7 12 1.7C8.01 1.7 4.56 4.04 2.89 7.36L6.29 9.99C7.1 7.58 9.35 5.79 12 5.79Z"
                            fill="#EA4335"
                          />
                        </svg>
                        <span>Continue with UCSC Google (@ucsc.edu)</span>
                      </button>

                      {/* 1-Tap Quick Student Persona Chips */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <MousePointerClick size={12} className="text-[var(--blue)]" />
                            Quick fill campus profile:
                          </span>
                          <span className="text-[10px] text-[var(--text-light)]">1-tap preset</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => applyQuickPersona('sslug@ucsc.edu', 'Sammy Slug')}
                            className={`px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                              normalizedEmail === 'sslug@ucsc.edu'
                                ? 'bg-[var(--blue-light)] border-[var(--blue)]/40 text-[var(--blue-ink)]'
                                : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)]'
                            }`}
                          >
                            <div className="w-6 h-6 rounded-full bg-[var(--blue)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                              SS
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold truncate">Sammy Slug</div>
                              <div className="text-[10px] text-[var(--text-muted)] truncate">
                                sslug@ucsc.edu
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => applyQuickPersona('arivera@ucsc.edu', 'Alex Rivera')}
                            className={`px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                              normalizedEmail === 'arivera@ucsc.edu'
                                ? 'bg-[var(--purple-light)] border-[var(--purple)]/40 text-[var(--purple-ink)]'
                                : 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)]'
                            }`}
                          >
                            <div className="w-6 h-6 rounded-full bg-[var(--purple)] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                              AR
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold truncate">Alex Rivera</div>
                              <div className="text-[10px] text-[var(--text-muted)] truncate">
                                CS Club Officer
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-light)]">
                        <div className="flex-1 h-px bg-[var(--border)]" />
                        <span>or with university email</span>
                        <div className="flex-1 h-px bg-[var(--border)]" />
                      </div>

                      {/* Note: text-base (16px) on mobile inputs prevents iOS auto-zoom on focus */}
                      <form onSubmit={handleFormSubmit} className="space-y-3.5">
                        {mode === 'signup' && (
                          <div>
                            <label className="block text-xs font-semibold text-[var(--text)] mb-1">
                              Full Name
                            </label>
                            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--blue)] transition-colors">
                              <User size={15} className="text-[var(--text-light)] shrink-0" />
                              <input
                                type="text"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                placeholder="Sammy Slug"
                                className="w-full bg-transparent border-none outline-none text-base sm:text-[13px] text-[var(--text)] placeholder:text-[var(--text-light)]"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-[var(--text)]">
                              University Email
                            </label>
                            {isUcscEmail ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--green-ink)] bg-[var(--green-light)] px-2 py-0.5 rounded-full">
                                <CheckCircle2 size={11} /> UCSC Verified
                              </span>
                            ) : isEduEmail ? (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--blue-ink)] bg-[var(--blue-light)] px-2 py-0.5 rounded-full">
                                <CheckCircle2 size={11} /> .edu Verified
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--blue)] transition-colors">
                            <Mail size={15} className="text-[var(--text-light)] shrink-0" />
                            <input
                              type="email"
                              value={email}
                              onChange={e => setEmail(e.target.value)}
                              placeholder="yourname@ucsc.edu"
                              className="w-full bg-transparent border-none outline-none text-base sm:text-[13px] text-[var(--text)] placeholder:text-[var(--text-light)]"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-[var(--text)]">
                              Password
                            </label>
                            {mode === 'signup' && password.length > 0 && (
                              <div className="flex items-center gap-1">
                                {[1, 2, 3].map(level => (
                                  <span
                                    key={level}
                                    className="w-4 h-1 rounded-full transition-colors"
                                    style={{
                                      background:
                                        passwordStrength >= level
                                          ? passwordStrength === 1
                                            ? 'var(--red)'
                                            : passwordStrength === 2
                                              ? 'var(--yellow)'
                                              : 'var(--green)'
                                          : 'var(--border)',
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--blue)] transition-colors">
                            <Lock size={15} className="text-[var(--text-light)] shrink-0" />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={password}
                              onChange={e => setPassword(e.target.value)}
                              placeholder="••••••••"
                              className="w-full bg-transparent border-none outline-none text-base sm:text-[13px] text-[var(--text)] placeholder:text-[var(--text-light)]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(prev => !prev)}
                              className="text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0.5 flex items-center"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>

                        {error && (
                          <div className="flex items-center gap-2 text-xs text-[var(--red-ink)] bg-[var(--red-light)] px-3.5 py-2.5 rounded-xl border border-[var(--red)]/20">
                            <AlertCircle size={14} className="shrink-0" />
                            <span>{error}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          onMouseMove={e => handleMagneticMove(e, 4)}
                          onMouseLeave={handleMagneticLeave}
                          className="magnetic-item w-full py-3 rounded-full bg-[var(--blue)] text-white text-sm font-semibold
                            shadow-[0_6px_18px_rgba(82,141,244,0.32)] flex items-center justify-center gap-1.5
                            hover:opacity-95 transition-all cursor-pointer border-none mt-1"
                        >
                          <span>
                            {mode === 'signup' ? 'Verify @ucsc.edu Email' : 'Sign In to ClubHub'}
                          </span>
                          <ArrowRight size={15} />
                        </button>
                      </form>

                      <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                        <span>
                          {mode === 'signup'
                            ? 'Already have an account?'
                            : "Don't have an account?"}{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setMode(mode === 'signup' ? 'signin' : 'signup')
                              setError('')
                            }}
                            className="font-semibold text-[var(--blue-ink)] hover:underline cursor-pointer bg-transparent border-none p-0"
                          >
                            {mode === 'signup' ? 'Sign in' : 'Sign up'}
                          </button>
                        </span>

                        {onEnterDemo && (
                          <button
                            type="button"
                            onClick={onEnterDemo}
                            className="font-medium text-[var(--text-muted)] hover:text-[var(--text)] underline cursor-pointer bg-transparent border-none p-0"
                          >
                            Explore Demo &rarr;
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION C: Interactive 3D Cursor-Reactive Campus Stage + Magnetic Feature Grid ──
              Order 3 on Mobile (below login card), Order 2 on Desktop (Left Column Bottom) */}
          <div className="order-3 lg:order-2 lg:col-start-1 lg:col-span-7 space-y-5 fade-in">
            {/* 3D Spatial Campus Ecosystem Stage */}
            <div className="parallax-stage relative pt-3 pb-2 sm:py-4">
              {/* Floating Orbital Badge 1 — Top Left (Desktop/Tablet) */}
              <div
                onMouseMove={e => handleMagneticMove(e, 7)}
                onMouseLeave={handleMagneticLeave}
                className="parallax-float magnetic-item hidden sm:flex absolute -top-2 left-3 z-20 items-center gap-2.5 px-3 py-2 rounded-2xl
                  bg-[var(--bg-glass)] backdrop-blur-md border border-[var(--border)] shadow-[var(--shadow-md)]"
                style={{ '--depth-x': '-24px', '--depth-y': '-18px' }}
              >
                <ClubAvatar club={SHOWCASE_CLUBS[0]} size={30} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[var(--text)]">CS Club</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] pulse-dot" />
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    React Workshop · 42 going
                  </div>
                </div>
              </div>

              {/* Floating Orbital Badge 2 — Top Right (Desktop/Tablet) */}
              <div
                onMouseMove={e => handleMagneticMove(e, 7)}
                onMouseLeave={handleMagneticLeave}
                className="parallax-float magnetic-item hidden sm:flex absolute -top-3 right-3 z-20 items-center gap-2 px-3 py-2 rounded-2xl
                  bg-[var(--bg-glass)] backdrop-blur-md border border-[var(--border)] shadow-[var(--shadow-md)]"
                style={{ '--depth-x': '28px', '--depth-y': '-20px' }}
              >
                <div className="flex -space-x-1.5">
                  <span className="w-6 h-6 rounded-full bg-[var(--purple-light)] text-[var(--purple-ink)] border border-[var(--bg-card)] flex items-center justify-center">
                    <PlatformIcon type="discord" size={13} />
                  </span>
                  <span className="w-6 h-6 rounded-full bg-[var(--red-light)] text-[var(--red-ink)] border border-[var(--bg-card)] flex items-center justify-center">
                    <PlatformIcon type="instagram" size={13} />
                  </span>
                  <span className="w-6 h-6 rounded-full bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--bg-card)] flex items-center justify-center">
                    <PlatformIcon type="google_calendar" size={13} />
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-[var(--text)]">
                  Multi-Source Live Sync
                </div>
              </div>

              {/* Floating Orbital Badge 3 — Bottom Right (Desktop/Tablet) */}
              <div
                onMouseMove={e => handleMagneticMove(e, 7)}
                onMouseLeave={handleMagneticLeave}
                className="parallax-float magnetic-item hidden sm:flex absolute -bottom-3 right-5 z-20 items-center gap-2 px-3 py-1.5 rounded-full
                  bg-[var(--green-light)] border border-[var(--green)]/30 text-[var(--green-ink)] shadow-[var(--shadow)]"
                style={{ '--depth-x': '22px', '--depth-y': '18px' }}
              >
                <ShieldCheck size={14} />
                <span className="text-[11px] font-bold">2,800+ Verified Slugs</span>
              </div>

              {/* Centerpiece 3D Tilt Interactive Live Campus Card */}
              <div
                onMouseMove={e => handleMagneticMove(e, 3)}
                onMouseLeave={handleMagneticLeave}
                className="parallax-tilt spotlight-card relative z-10 rounded-[22px] bg-[var(--bg-card)] border border-[var(--border)]
                  shadow-[var(--shadow-md)] p-4 sm:p-5 sm:mx-4"
              >
                <div className="relative z-10 space-y-3.5">
                  {/* Card Header & Interactive Switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--green)] pulse-dot" />
                      <span className="text-xs font-bold text-[var(--text)]">
                        Live Campus Pulse
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] hidden xs:inline">
                        · Interactive Preview
                      </span>
                    </div>

                    <div className="flex items-center gap-1 p-0.5 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setPreviewTab('events')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer border-none transition-all ${
                          previewTab === 'events'
                            ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                            : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        Upcoming Events
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewTab('signals')}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer border-none transition-all ${
                          previewTab === 'signals'
                            ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                            : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        Synced Channels
                      </button>
                    </div>
                  </div>

                  {/* Tab 1: Interactive Events List with Live RSVP Toggles */}
                  {previewTab === 'events' ? (
                    <div className="space-y-2">
                      {previewEvents.map(ev => (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ClubAvatar club={ev.club} size={36} />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[var(--text)] truncate">
                                {ev.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-[var(--text-muted)] mt-0.5">
                                <span className="inline-flex items-center gap-1">
                                  <Calendar size={11} className="text-[var(--blue)]" />
                                  {ev.time}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MapPin size={11} className="text-[var(--purple)]" />
                                  {ev.location}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => togglePreviewRsvp(ev.id)}
                            className={`shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1 cursor-pointer border transition-all ${
                              ev.going
                                ? 'bg-[var(--green-light)] text-[var(--green-ink)] border-[var(--green)]/30'
                                : 'bg-[var(--bg-card)] text-[var(--text)] border-[var(--border)] hover:border-[var(--blue)]'
                            }`}
                          >
                            {ev.going ? <Check size={12} /> : <Users size={11} />}
                            <span className="font-mono-num">{ev.rsvps}</span>
                            <span className="hidden xs:inline">{ev.going ? 'Going' : 'RSVP'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Tab 2: Multi-Channel Live Feed Signals */
                    <div className="space-y-2">
                      {LIVE_FEED_SIGNALS.map(sig => (
                        <div
                          key={sig.id}
                          className="flex items-start gap-2.5 p-2.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                        >
                          <IconBadge color={sig.color} size={34} radius={10}>
                            <PlatformIcon type={sig.platform} size={17} />
                          </IconBadge>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[var(--text)] truncate">
                                {sig.club}
                              </span>
                              <span className="text-[10px] text-[var(--text-light)] shrink-0">
                                {sig.meta}
                              </span>
                            </div>
                            <p className="text-[11.5px] text-[var(--text-muted)] leading-snug mt-0.5 line-clamp-1">
                              {sig.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2x2 Magnetic Cursor-Spotlight Feature Cards */}
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3 pt-1">
              {FEATURE_HIGHLIGHTS.map(feat => (
                <div
                  key={feat.title}
                  onMouseMove={e => handleMagneticMove(e, 5)}
                  onMouseLeave={handleMagneticLeave}
                  className="spotlight-card magnetic-item p-3.5 sm:p-4 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)]
                    hover:border-[var(--border-strong)] shadow-[var(--shadow)] flex items-center gap-3"
                >
                  <div className="relative z-10 flex items-center gap-3 w-full min-w-0">
                    <IconBadge color={feat.color} size={40} radius={12}>
                      <StatIcon name={feat.icon} size={20} />
                    </IconBadge>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="text-sm font-bold text-[var(--text)] truncate">
                          {feat.title}
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
                          style={{
                            background: `var(--${feat.color}-light)`,
                            color: `var(--${feat.color}-ink)`,
                          }}
                        >
                          {feat.badge}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {feat.subtitle}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)] pt-0.5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-[var(--green)] shrink-0" />
                <span>Direct verification via your @ucsc.edu university inbox</span>
              </div>
              <span className="text-[11px] text-[var(--text-light)] hidden sm:inline">
                Move cursor to explore depth layers
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
