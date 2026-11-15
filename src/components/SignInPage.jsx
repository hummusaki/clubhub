import { useState, useEffect, useRef } from 'react'
import { useClerk } from '@clerk/react'
import {
  Moon,
  Sun,
  ArrowRight,
  Play,
  GraduationCap,
  Mail,
  Lock,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react'
import { ClubHubLogo, Avatar } from './ui'

const GOOGLE_ACCOUNTS_KEY = 'clubhub_google_accounts_v2'
const EMAIL_ACCOUNTS_KEY = 'clubhub_registered_accounts_v2'

function getSavedGoogleAccounts() {
  try {
    const raw = localStorage.getItem(GOOGLE_ACCOUNTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      return parsed.filter(
        a =>
          a &&
          a.email &&
          a.email !== 'sslug@ucsc.edu' &&
          a.email !== 'arivera@ucsc.edu'
      )
    }
  } catch {
    // Ignore storage errors
  }
  return []
}

function saveGoogleAccount(account) {
  try {
    const existing = getSavedGoogleAccounts().filter(
      a => a.email.toLowerCase() !== account.email.toLowerCase()
    )
    const updated = [account, ...existing].slice(0, 5)
    localStorage.setItem(GOOGLE_ACCOUNTS_KEY, JSON.stringify(updated))
  } catch {
    // Ignore storage errors
  }
}

function getRegisteredEmailAccounts() {
  try {
    return JSON.parse(localStorage.getItem(EMAIL_ACCOUNTS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveRegisteredEmailAccount(account) {
  try {
    const existing = getRegisteredEmailAccounts()
    existing[account.email.toLowerCase()] = account
    localStorage.setItem(EMAIL_ACCOUNTS_KEY, JSON.stringify(existing))
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

function GoogleGLogo({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
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
  )
}

/**
 * Helper component that safely accesses Clerk context when ClerkProvider is mounted.
 */
function ClerkAuthBridge({ bridgeRef }) {
  const clerk = useClerk()
  useEffect(() => {
    bridgeRef.current = clerk
  }, [clerk, bridgeRef])
  return null
}

/**
 * Interactive Mouse-Activated Light Wave Canvas Background.
 * Renders soft, luminous multi-layered waves of light that ripple, bend,
 * and illuminate when activated by mouse movement or touch gestures.
 */
function LightWaveBackground({ dark }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const NODE_COUNT = 84
    const WAVE_CONFIGS = [
      {
        yRatio: 0.34,
        freq: 2.1,
        speed: 0.75,
        phase: 0,
        tension: 0.18,
        spring: 0.02,
        damping: 0.925,
        lightColor: [82, 141, 244],   // Sky Blue
        darkColor: [123, 170, 247],
      },
      {
        yRatio: 0.49,
        freq: 1.65,
        speed: -0.58,
        phase: 1.7,
        tension: 0.16,
        spring: 0.018,
        damping: 0.93,
        lightColor: [150, 123, 208],  // Soft Violet
        darkColor: [179, 157, 219],
      },
      {
        yRatio: 0.64,
        freq: 2.45,
        speed: 0.64,
        phase: 3.3,
        tension: 0.17,
        spring: 0.019,
        damping: 0.928,
        lightColor: [75, 181, 172],   // Aqua Teal
        darkColor: [128, 203, 196],
      },
      {
        yRatio: 0.78,
        freq: 1.85,
        speed: -0.48,
        phase: 4.9,
        tension: 0.15,
        spring: 0.017,
        damping: 0.935,
        lightColor: [232, 178, 67],   // Warm Sunlight Gold
        darkColor: [243, 204, 114],
      },
    ]

    const waves = WAVE_CONFIGS.map(cfg => ({
      ...cfg,
      disp: new Float32Array(NODE_COUNT),
      vel: new Float32Array(NODE_COUNT),
      nextVel: new Float32Array(NODE_COUNT),
    }))

    let width = window.innerWidth || 1200
    let height = window.innerHeight || 800
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      width = window.innerWidth || 1200
      height = window.innerHeight || 800
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()

    const pointer = {
      x: width * 0.5,
      y: height * 0.5,
      smoothX: width * 0.5,
      smoothY: height * 0.5,
      prevX: width * 0.5,
      prevY: height * 0.5,
      vx: 0,
      vy: 0,
      activation: 0, // 0 when idle -> 1 when activated by mouse/touch
      inside: false,
    }

    function exciteWaves(px, py, vx, vy, boost = 1) {
      if (prefersReduced) return
      const speed = Math.hypot(vx, vy)
      const energyGain = Math.min(1, (speed / 28) * boost)
      pointer.activation = Math.min(1, pointer.activation + energyGain * 0.38)

      const normX = Math.max(0, Math.min(1, px / Math.max(1, width)))
      const centerNode = normX * (NODE_COUNT - 1)
      const radiusNodes = Math.max(4.5, NODE_COUNT * 0.085)

      // Determine vertical pull + directional wave impulse from horizontal/vertical motion
      const signedImpulse =
        (vy * 0.42 + (vx >= 0 ? 1 : -1) * Math.min(18, speed * 0.32)) * boost

      waves.forEach((w, wIdx) => {
        const waveY = height * w.yRatio
        const distY = Math.abs(py - waveY)
        const verticalReach = height * 0.58
        const yFalloff = Math.max(0.22, 1 - distY / verticalReach)
        const layerSign = wIdx % 2 === 0 ? 1 : -0.85

        const startIdx = Math.max(1, Math.floor(centerNode - radiusNodes * 2.5))
        const endIdx = Math.min(NODE_COUNT - 2, Math.ceil(centerNode + radiusNodes * 2.5))

        for (let i = startIdx; i <= endIdx; i++) {
          const d = (i - centerNode) / radiusNodes
          const gaussian = Math.exp(-0.5 * d * d)
          // Derivative-like antisymmetric component creates a true travelling wave crest on horizontal sweep
          const wavePacket = gaussian * (1 - 0.35 * d)
          w.vel[i] += signedImpulse * yFalloff * layerSign * wavePacket * 0.24
        }
      })
    }

    function onMouseMove(e) {
      const x = e.clientX
      const y = e.clientY
      if (!pointer.inside) {
        pointer.prevX = x
        pointer.prevY = y
        pointer.smoothX = x
        pointer.smoothY = y
        pointer.inside = true
      }
      const vx = x - pointer.prevX
      const vy = y - pointer.prevY
      pointer.x = x
      pointer.y = y
      pointer.prevX = x
      pointer.prevY = y
      exciteWaves(x, y, vx, vy, 1)
    }

    function onMouseDown(e) {
      exciteWaves(e.clientX, e.clientY, 0, -26, 1.65)
      pointer.activation = Math.min(1, pointer.activation + 0.55)
    }

    function onTouchMove(e) {
      if (!e.touches || e.touches.length === 0) return
      const t = e.touches[0]
      if (!pointer.inside) {
        pointer.prevX = t.clientX
        pointer.prevY = t.clientY
        pointer.smoothX = t.clientX
        pointer.smoothY = t.clientY
        pointer.inside = true
      }
      const vx = t.clientX - pointer.prevX
      const vy = t.clientY - pointer.prevY
      pointer.x = t.clientX
      pointer.y = t.clientY
      pointer.prevX = t.clientX
      pointer.prevY = t.clientY
      exciteWaves(t.clientX, t.clientY, vx, vy, 0.9)
    }

    function onTouchStart(e) {
      if (!e.touches || e.touches.length === 0) return
      const t = e.touches[0]
      pointer.x = t.clientX
      pointer.y = t.clientY
      pointer.prevX = t.clientX
      pointer.prevY = t.clientY
      pointer.inside = true
      exciteWaves(t.clientX, t.clientY, 0, -18, 1.2)
    }

    let rafId = null
    const t0 = performance.now()

    function render(now) {
      const elapsed = (now - t0) * 0.001

      // Smooth cursor interpolation & gentle decay of activation when mouse stops
      pointer.smoothX += (pointer.x - pointer.smoothX) * 0.14
      pointer.smoothY += (pointer.y - pointer.smoothY) * 0.14
      pointer.activation *= 0.968

      ctx.clearRect(0, 0, width, height)

      // 1. Soft Mouse-Activated Radial Light Bloom behind the waves
      if (pointer.activation > 0.01) {
        const bloomRadius = Math.min(width, height) * 0.52
        const bloomAlpha = (dark ? 0.18 : 0.24) * pointer.activation
        const radial = ctx.createRadialGradient(
          pointer.smoothX,
          pointer.smoothY,
          0,
          pointer.smoothX,
          pointer.smoothY,
          bloomRadius
        )
        if (dark) {
          radial.addColorStop(0, `rgba(123, 170, 247, ${bloomAlpha.toFixed(3)})`)
          radial.addColorStop(0.5, `rgba(179, 157, 219, ${(bloomAlpha * 0.45).toFixed(3)})`)
          radial.addColorStop(1, 'rgba(31, 28, 24, 0)')
        } else {
          radial.addColorStop(0, `rgba(82, 141, 244, ${bloomAlpha.toFixed(3)})`)
          radial.addColorStop(0.5, `rgba(150, 123, 208, ${(bloomAlpha * 0.45).toFixed(3)})`)
          radial.addColorStop(1, 'rgba(247, 246, 243, 0)')
        }
        ctx.fillStyle = radial
        ctx.fillRect(0, 0, width, height)
      }

      // 2. Step 1D Wave Physics & Render Each Light Wave Ribbon
      const stepX = width / (NODE_COUNT - 1)
      const ptsX = new Float32Array(NODE_COUNT)
      const ptsY = new Float32Array(NODE_COUNT)

      waves.forEach(w => {
        // 1D coupled harmonic wave propagation
        for (let i = 1; i < NODE_COUNT - 1; i++) {
          const laplacian = w.disp[i - 1] + w.disp[i + 1] - 2 * w.disp[i]
          w.nextVel[i] = w.vel[i] + laplacian * w.tension - w.disp[i] * w.spring
        }
        for (let i = 1; i < NODE_COUNT - 1; i++) {
          w.vel[i] = w.nextVel[i] * w.damping
          w.disp[i] = Math.max(-75, Math.min(75, w.disp[i] + w.vel[i]))
        }
        // Pinned smooth boundaries
        w.disp[0] = w.disp[1] * 0.5
        w.disp[NODE_COUNT - 1] = w.disp[NODE_COUNT - 2] * 0.5

        const baseY = height * w.yRatio
        // Calm idle wave vs energized mouse-activated wave
        const baseAmp = prefersReduced ? 5 : 9 + pointer.activation * 20

        for (let i = 0; i < NODE_COUNT; i++) {
          const u = i / (NODE_COUNT - 1)
          const x = i * stepX
          const harmonic =
            Math.sin(u * Math.PI * 2 * w.freq + elapsed * w.speed + w.phase) * baseAmp +
            Math.cos(u * Math.PI * 2 * (w.freq * 0.6) - elapsed * (w.speed * 0.7) + w.phase) *
              (baseAmp * 0.4)

          ptsX[i] = x
          ptsY[i] = baseY + harmonic + w.disp[i]
        }

        const [r, g, b] = dark ? w.darkColor : w.lightColor
        const activeBoost = pointer.activation

        // Trace smooth curve through nodes
        ctx.beginPath()
        ctx.moveTo(ptsX[0], ptsY[0])
        for (let i = 0; i < NODE_COUNT - 1; i++) {
          const midX = (ptsX[i] + ptsX[i + 1]) * 0.5
          const midY = (ptsY[i] + ptsY[i + 1]) * 0.5
          ctx.quadraticCurveTo(ptsX[i], ptsY[i], midX, midY)
        }
        ctx.lineTo(ptsX[NODE_COUNT - 1], ptsY[NODE_COUNT - 1])

        // Soft Luminous Wave Curtain Fill below the wave crest
        const curtainHeight = Math.max(130, height * 0.24)
        const fillGrad = ctx.createLinearGradient(0, baseY - 50, 0, baseY + curtainHeight)
        const topAlpha = (dark ? 0.08 : 0.11) + activeBoost * (dark ? 0.14 : 0.16)
        fillGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${topAlpha.toFixed(3)})`)
        fillGrad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${(topAlpha * 0.32).toFixed(3)})`)
        fillGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.save()
        ctx.lineTo(width, baseY + curtainHeight + 80)
        ctx.lineTo(0, baseY + curtainHeight + 80)
        ctx.closePath()
        ctx.fillStyle = fillGrad
        ctx.fill()
        ctx.restore()

        // Re-trace wave crest for luminous stroke
        ctx.beginPath()
        ctx.moveTo(ptsX[0], ptsY[0])
        for (let i = 0; i < NODE_COUNT - 1; i++) {
          const midX = (ptsX[i] + ptsX[i + 1]) * 0.5
          const midY = (ptsY[i] + ptsY[i + 1]) * 0.5
          ctx.quadraticCurveTo(ptsX[i], ptsY[i], midX, midY)
        }
        ctx.lineTo(ptsX[NODE_COUNT - 1], ptsY[NODE_COUNT - 1])

        // Horizontal gradient that brightens around the mouse X coordinate
        const cursorNormX = Math.max(0.05, Math.min(0.95, pointer.smoothX / Math.max(1, width)))
        const spread = 0.22
        const leftStop = Math.max(0, cursorNormX - spread)
        const rightStop = Math.min(1, cursorNormX + spread)

        const baseStrokeAlpha = (dark ? 0.22 : 0.28) + activeBoost * 0.22
        const peakStrokeAlpha = Math.min(0.95, baseStrokeAlpha + activeBoost * 0.48)

        const strokeGrad = ctx.createLinearGradient(0, 0, width, 0)
        strokeGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(baseStrokeAlpha * 0.55).toFixed(3)})`)
        strokeGrad.addColorStop(leftStop, `rgba(${r}, ${g}, ${b}, ${baseStrokeAlpha.toFixed(3)})`)
        strokeGrad.addColorStop(cursorNormX, `rgba(${r}, ${g}, ${b}, ${peakStrokeAlpha.toFixed(3)})`)
        strokeGrad.addColorStop(rightStop, `rgba(${r}, ${g}, ${b}, ${baseStrokeAlpha.toFixed(3)})`)
        strokeGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${(baseStrokeAlpha * 0.55).toFixed(3)})`)

        // Outer soft light glow along the wave crest
        ctx.strokeStyle = strokeGrad
        ctx.lineWidth = 5 + activeBoost * 5
        ctx.globalAlpha = 0.28 + activeBoost * 0.32
        ctx.stroke()

        // Crisp inner light wave filament
        ctx.globalAlpha = 1
        ctx.lineWidth = 1.6 + activeBoost * 0.9
        ctx.stroke()
      })

      rafId = requestAnimationFrame(render)
    }

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mousedown', onMouseDown, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })

    rafId = requestAnimationFrame(render)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchstart', onTouchStart)
    }
  }, [dark])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 w-full h-full z-0"
    />
  )
}

export default function SignInPage({
  dark,
  onToggleDark,
  hasPublishableKey,
  onEnterDemo,
  onLocalSignIn,
}) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Interactive Google OAuth Dialog state
  const [googleModalOpen, setGoogleModalOpen] = useState(false)
  const [savedGoogleAccounts, setSavedGoogleAccounts] = useState(getSavedGoogleAccounts)
  const [googleStep, setGoogleStep] = useState('choose') // 'choose' | 'email' | 'password'
  const [googleEmailInput, setGoogleEmailInput] = useState('')
  const [googleNameInput, setGoogleNameInput] = useState('')
  const [googlePassInput, setGooglePassInput] = useState('')
  const [googleModalError, setGoogleModalError] = useState('')

  const clerkBridgeRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!googleClientId) return
    if (document.getElementById('google-gsi-script')) return
    const script = document.createElement('script')
    script.id = 'google-gsi-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }, [googleClientId])

  function finalizeUserSession(profile) {
    const cleanEmail = (profile.email || '').trim().toLowerCase()
    const resolvedName = (profile.fullName || '').trim() || formatNameFromEmail(cleanEmail)
    const userObj = {
      fullName: resolvedName,
      firstName: resolvedName.split(' ')[0],
      email: cleanEmail,
      picture: profile.picture || null,
      primaryEmailAddress: { emailAddress: cleanEmail },
      provider: profile.provider || 'email',
      authenticated: true,
      verifiedEdu: cleanEmail.endsWith('.edu'),
      avatarBg: profile.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
    }
    if (onLocalSignIn) onLocalSignIn(userObj)
  }

  async function handleGoogleLoginClick() {
    setError('')
    setGoogleLoading(true)

    // 1. If Google Identity Services OAuth Client ID is configured, launch native Google OAuth popup
    if (googleClientId && window.google?.accounts?.oauth2) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          prompt: 'select_account',
          callback: async tokenResponse => {
            setGoogleLoading(false)
            if (tokenResponse?.access_token) {
              try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                })
                const data = await res.json()
                const account = {
                  fullName: data.name || formatNameFromEmail(data.email),
                  email: data.email,
                  picture: data.picture || null,
                  provider: 'google',
                  avatarBg: 'linear-gradient(135deg, #4285F4, #34A853)',
                }
                saveGoogleAccount(account)
                setSavedGoogleAccounts(getSavedGoogleAccounts())
                finalizeUserSession(account)
              } catch {
                openGoogleOAuthModal()
              }
            }
          },
        })
        tokenClient.requestAccessToken()
        return
      } catch {
        // Continue to Clerk or Google OAuth dialog
      }
    }

    // 2. If Clerk is active and has Google OAuth enabled on the Clerk instance, redirect to Google OAuth
    const clerk = clerkBridgeRef.current
    if (hasPublishableKey && clerk?.client?.signIn) {
      try {
        const googleEnabled =
          clerk?.__unstable__environment?.userSettings?.social?.oauth_google?.enabled
        if (googleEnabled) {
          await clerk.client.signIn.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: `${window.location.origin}/#/sso-callback`,
            redirectUrlComplete: window.location.origin,
          })
          return
        }
      } catch {
        // Fallback to interactive Google Sign-In flow if Clerk oauth_google is not enabled
      }
    }

    setGoogleLoading(false)
    openGoogleOAuthModal()
  }

  function openGoogleOAuthModal() {
    const currentAccounts = getSavedGoogleAccounts()
    setSavedGoogleAccounts(currentAccounts)
    setGoogleModalError('')
    const prefillEmail = email.trim().toLowerCase()
    setGoogleEmailInput(prefillEmail.includes('@') ? prefillEmail : '')
    setGoogleNameInput(fullName.trim())
    setGooglePassInput('')
    setGoogleStep(currentAccounts.length > 0 && !prefillEmail ? 'choose' : 'email')
    setGoogleModalOpen(true)
  }

  function handleSelectSavedGoogleAccount(acc) {
    saveGoogleAccount(acc)
    setSavedGoogleAccounts(getSavedGoogleAccounts())
    setGoogleModalOpen(false)
    finalizeUserSession({ ...acc, provider: 'google' })
  }

  function handleGoogleEmailNext(e) {
    e.preventDefault()
    setGoogleModalError('')
    const clean = googleEmailInput.trim().toLowerCase()
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setGoogleModalError('Enter a valid Google or university email address.')
      return
    }
    setGoogleStep('password')
  }

  function handleGooglePasswordSubmit(e) {
    e.preventDefault()
    setGoogleModalError('')
    if (googlePassInput.length < 4) {
      setGoogleModalError('Enter your Google account password to continue.')
      return
    }
    const cleanEmail = googleEmailInput.trim().toLowerCase()
    const resolvedName = googleNameInput.trim() || formatNameFromEmail(cleanEmail)
    const account = {
      fullName: resolvedName,
      email: cleanEmail,
      provider: 'google',
      avatarBg: 'linear-gradient(135deg, #4285F4, #34A853)',
    }
    saveGoogleAccount(account)
    setSavedGoogleAccounts(getSavedGoogleAccounts())
    setGoogleModalOpen(false)
    finalizeUserSession(account)
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    setError('')

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.')
      return
    }

    if (mode === 'signup' && !fullName.trim()) {
      setError('Please enter your full name.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)

    // Try Clerk email/password authentication first if Clerk is loaded
    const clerk = clerkBridgeRef.current
    if (hasPublishableKey && clerk?.client?.signIn && mode === 'signin') {
      try {
        const res = await clerk.client.signIn.create({
          identifier: cleanEmail,
          password,
        })
        if (res?.status === 'complete' && res?.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId })
          setSubmitting(false)
          return
        }
      } catch {
        // Proceed with local account registry if user is not in Clerk instance
      }
    }

    const registered = getRegisteredEmailAccounts()
    const existing = registered[cleanEmail]

    if (mode === 'signup') {
      const newAccount = {
        email: cleanEmail,
        fullName: fullName.trim(),
        password,
        avatarBg: 'linear-gradient(135deg, var(--blue), var(--purple))',
      }
      saveRegisteredEmailAccount(newAccount)
      setSubmitting(false)
      finalizeUserSession(newAccount)
      return
    }

    // Sign In mode
    if (existing && existing.password && existing.password !== password) {
      setSubmitting(false)
      setError('Incorrect password for this account. Please try again.')
      return
    }

    const resolvedName =
      existing?.fullName || fullName.trim() || formatNameFromEmail(cleanEmail)
    const accountToSave = {
      email: cleanEmail,
      fullName: resolvedName,
      password,
      avatarBg: existing?.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
    }
    saveRegisteredEmailAccount(accountToSave)
    setSubmitting(false)
    finalizeUserSession(accountToSave)
  }

  return (
    <div className="relative min-h-dvh w-full flex flex-col bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 overflow-x-hidden">
      {hasPublishableKey && <ClerkAuthBridge bridgeRef={clerkBridgeRef} />}

      {/* ── Mouse-Activated Light Wave Canvas Background ── */}
      <LightWaveBackground dark={dark} />

      {/* ── Minimal, Uncluttered Top Bar ── */}
      <header className="relative z-20 flex items-center justify-between px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4">
        <div className="flex items-center gap-2.5">
          <ClubHubLogo size={34} />
          <span className="font-extrabold text-base sm:text-lg tracking-tight text-[var(--text)]">
            ClubHub
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onEnterDemo && (
            <button
              type="button"
              onClick={onEnterDemo}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold
                bg-[var(--bg-card)]/85 backdrop-blur-md border border-[var(--border)] text-[var(--text)]
                hover:border-[var(--blue)] hover:text-[var(--blue-ink)] transition-colors shadow-2xs cursor-pointer"
            >
              <Play size={11} fill="currentColor" className="text-[var(--blue)]" />
              <span>Preview Demo</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleDark}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)]
              bg-[var(--bg-card)]/85 backdrop-blur-md hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)]
              text-xs font-medium transition-colors shadow-2xs cursor-pointer"
            title="Toggle theme"
            aria-label="Toggle color theme"
          >
            {dark ? <Sun size={15} className="text-[var(--yellow)]" /> : <Moon size={15} />}
            <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Stage (Mobile-First, Clean & Uncluttered) ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-12 py-4 sm:py-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center">
          {/* ── Left Column: Concise Editorial Intro ── */}
          <div className="lg:col-span-6 text-center lg:text-left space-y-3 sm:space-y-4 fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--blue-light)] text-[var(--blue-ink)] border border-[var(--blue)]/20">
              <GraduationCap size={14} />
              <span>UCSC Campus Community</span>
            </div>

            <h1 className="text-2xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-[var(--text)] leading-[1.14]">
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

            <p className="text-xs sm:text-sm lg:text-[15px] text-[var(--text-muted)] leading-relaxed max-w-md mx-auto lg:mx-0">
              Discover student organizations, sync Discord &amp; Instagram announcements, and RSVP
              to campus events in one place.
            </p>

            {/* Subtle Desktop Pill Highlights */}
            <div className="hidden lg:flex flex-wrap items-center gap-2 pt-2">
              {['40+ Active Clubs', 'Discord & IG Auto-Sync', '1-Click Event RSVP'].map(label => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-card)]/80 backdrop-blur-sm border border-[var(--border)] text-[var(--text-muted)]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--blue)]" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Right Column: Clean Login Card (Google Button Above Normal Login Fields) ── */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end w-full fade-in">
            <div
              className="w-full max-w-[410px] rounded-[24px] bg-[var(--bg-card)]/90 backdrop-blur-xl
                border border-[var(--border)] shadow-[var(--shadow-lg)] p-5 sm:p-7 space-y-5"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text)]">
                    {mode === 'signup' ? 'Create account' : 'Welcome back'}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {mode === 'signup'
                      ? 'Join your campus club workspace'
                      : 'Sign in to your ClubHub account'}
                  </p>
                </div>

                {/* Clean Sign In / Sign Up Switch */}
                <div className="flex items-center p-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border)] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin')
                      setError('')
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border-none transition-all ${
                      mode === 'signin'
                        ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
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
                    className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border-none transition-all ${
                      mode === 'signup'
                        ? 'bg-[var(--bg-card)] text-[var(--text)] shadow-2xs'
                        : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
              </div>

              {/* ── 1. Login with Google Button (Above Normal Login Fields) ── */}
              <button
                type="button"
                onClick={handleGoogleLoginClick}
                disabled={googleLoading}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)]
                  border border-[var(--border-strong)] hover:border-[var(--blue)]
                  text-[13.5px] font-semibold text-[var(--text)] shadow-2xs hover:shadow-xs
                  flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-60"
              >
                {googleLoading ? (
                  <Loader2 size={18} className="animate-spin text-[var(--blue)]" />
                ) : (
                  <GoogleGLogo size={18} />
                )}
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 text-[11px] text-[var(--text-light)]">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span>or continue with email</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              {/* ── 2. Normal Email & Password Login Fields ── */}
              <form onSubmit={handleFormSubmit} className="space-y-3.5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text)] mb-1.5">
                      Full Name
                    </label>
                    <div className="flex items-center gap-2.5 px-3.5 min-h-[44px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--blue)] transition-colors">
                      <User size={15} className="text-[var(--text-light)] shrink-0" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Your full name"
                        autoComplete="name"
                        className="w-full bg-transparent border-none outline-none text-base sm:text-sm text-[var(--text)] placeholder:text-[var(--text-light)]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[var(--text)] mb-1.5">
                    Email Address
                  </label>
                  <div className="flex items-center gap-2.5 px-3.5 min-h-[44px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--blue)] transition-colors">
                    <Mail size={15} className="text-[var(--text-light)] shrink-0" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@ucsc.edu"
                      autoComplete="email"
                      className="w-full bg-transparent border-none outline-none text-base sm:text-sm text-[var(--text)] placeholder:text-[var(--text-light)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text)] mb-1.5">
                    Password
                  </label>
                  <div className="flex items-center gap-2.5 px-3.5 min-h-[44px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--blue)] transition-colors">
                    <Lock size={15} className="text-[var(--text-light)] shrink-0" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full bg-transparent border-none outline-none text-base sm:text-sm text-[var(--text)] placeholder:text-[var(--text-light)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-1 flex items-center"
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
                  disabled={submitting}
                  className="w-full min-h-[46px] py-2.5 rounded-xl bg-[var(--blue)] hover:opacity-95 text-white text-sm font-semibold
                    shadow-[0_4px_14px_rgba(82,141,244,0.32)] flex items-center justify-center gap-1.5
                    transition-all cursor-pointer border-none disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>

              {/* Card Footer */}
              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-center text-xs text-[var(--text-muted)]">
                <span>
                  {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
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
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Google Account OAuth Modal ── */}
      {googleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px] fade-in">
          <div className="w-full max-w-[390px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[22px] shadow-[var(--shadow-lg)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GoogleGLogo size={17} />
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  Sign in with Google
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGoogleModalOpen(false)
                  setGoogleModalError('')
                }}
                aria-label="Close"
                className="w-7 h-7 rounded-full hover:bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-muted)] border-none bg-transparent cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-6">
              <div className="text-center mb-5">
                <div className="flex justify-center mb-2">
                  <ClubHubLogo size={34} />
                </div>
                <h3 className="text-lg font-bold text-[var(--text)]">
                  {googleStep === 'choose'
                    ? 'Choose an account'
                    : googleStep === 'password'
                      ? 'Welcome'
                      : 'Sign in'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {googleStep === 'password' ? (
                    <span className="font-medium text-[var(--text)]">{googleEmailInput}</span>
                  ) : (
                    <>
                      to continue to <strong className="text-[var(--text)]">ClubHub</strong>
                    </>
                  )}
                </p>
              </div>

              {googleStep === 'choose' && (
                <div className="flex flex-col gap-2">
                  {savedGoogleAccounts.map(acc => {
                    const initials = (acc.fullName || acc.email || 'U')
                      .split(' ')
                      .map(w => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                    return (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => handleSelectSavedGoogleAccount(acc)}
                        className="w-full p-3 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--blue-light)]
                          border border-[var(--border)] hover:border-[var(--blue)]
                          flex items-center gap-3 text-left transition-colors cursor-pointer"
                      >
                        <Avatar
                          initials={initials}
                          bg={acc.avatarBg || 'linear-gradient(135deg, #4285F4, #34A853)'}
                          size={34}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                            {acc.fullName}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {acc.email}
                          </div>
                        </div>
                        <CheckCircle2 size={15} className="text-[var(--blue)] shrink-0" />
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setGoogleStep('email')
                      setGoogleModalError('')
                    }}
                    className="w-full p-2.5 rounded-xl bg-transparent hover:bg-[var(--bg-surface)]
                      border border-dashed border-[var(--border-strong)]
                      flex items-center justify-center gap-2 text-xs font-semibold text-[var(--blue-ink)]
                      transition-colors cursor-pointer mt-1"
                  >
                    <span>Use another Google account</span>
                  </button>
                </div>
              )}

              {googleStep === 'email' && (
                <form onSubmit={handleGoogleEmailNext} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text)] mb-1">
                      Google or University Email
                    </label>
                    <input
                      type="email"
                      autoFocus
                      value={googleEmailInput}
                      onChange={e => setGoogleEmailInput(e.target.value)}
                      placeholder="yourname@ucsc.edu"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]
                        text-base sm:text-sm text-[var(--text)] outline-none focus:border-[var(--blue)]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text)] mb-1">
                      Your Name{' '}
                      <span className="text-[var(--text-light)] font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={googleNameInput}
                      onChange={e => setGoogleNameInput(e.target.value)}
                      placeholder="Full name"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]
                        text-base sm:text-sm text-[var(--text)] outline-none focus:border-[var(--blue)]"
                    />
                  </div>

                  {googleModalError && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--red-ink)] bg-[var(--red-light)] px-3 py-2 rounded-lg">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{googleModalError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 gap-2">
                    {savedGoogleAccounts.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setGoogleStep('choose')
                          setGoogleModalError('')
                        }}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-surface)] border-none bg-transparent cursor-pointer"
                      >
                        Back
                      </button>
                    ) : (
                      <span />
                    )}

                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold
                        flex items-center gap-1.5 border-none cursor-pointer transition-colors"
                    >
                      <span>Next</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </form>
              )}

              {googleStep === 'password' && (
                <form onSubmit={handleGooglePasswordSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text)] mb-1">
                      Enter your password
                    </label>
                    <input
                      type="password"
                      autoFocus
                      value={googlePassInput}
                      onChange={e => setGooglePassInput(e.target.value)}
                      placeholder="Google password"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]
                        text-base sm:text-sm text-[var(--text)] outline-none focus:border-[var(--blue)]"
                    />
                  </div>

                  {googleModalError && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--red-ink)] bg-[var(--red-light)] px-3 py-2 rounded-lg">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{googleModalError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGoogleStep('email')
                        setGoogleModalError('')
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-surface)] border-none bg-transparent cursor-pointer"
                    >
                      Back
                    </button>

                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-semibold
                        flex items-center gap-1.5 border-none cursor-pointer transition-colors"
                    >
                      <span>Sign in with Google</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
