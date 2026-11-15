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
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ExternalLink,
  X,
} from 'lucide-react'
import { ClubHubLogo } from './ui'

const EMAIL_ACCOUNTS_KEY = 'clubhub_registered_accounts_v2'
const STORED_GOOGLE_CLIENT_ID_KEY = 'clubhub_google_client_id'
const STORED_CLERK_KEY = 'clubhub_clerk_publishable_key'

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

function getEffectiveGoogleClientId() {
  const envId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
  if (envId) return envId
  try {
    return (localStorage.getItem(STORED_GOOGLE_CLIENT_ID_KEY) || '').trim()
  } catch {
    return ''
  }
}

function loadGoogleGsiScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Browser environment required'))
      return
    }
    if (window.google?.accounts?.oauth2) {
      resolve(window.google)
      return
    }

    const existing = document.getElementById('google-gsi-script')
    if (existing) {
      let checks = 0
      const poll = setInterval(() => {
        checks += 1
        if (window.google?.accounts?.oauth2) {
          clearInterval(poll)
          resolve(window.google)
        } else if (checks > 50) {
          clearInterval(poll)
          reject(new Error('Timed out loading Google Identity Services'))
        }
      }, 100)
      return
    }

    const script = document.createElement('script')
    script.id = 'google-gsi-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google)
      } else {
        reject(new Error('Google Identity Services unavailable'))
      }
    }
    script.onerror = () => reject(new Error('Failed to load accounts.google.com SDK'))
    document.head.appendChild(script)
  })
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
 * Safely bridges Clerk instance from ClerkProvider without throwing if Clerk is absent.
 */
function ClerkAuthBridge({ bridgeRef, onReady }) {
  const clerk = useClerk()
  bridgeRef.current = clerk

  useEffect(() => {
    bridgeRef.current = clerk
    if (clerk?.loaded && onReady) {
      onReady(clerk)
    }
  }, [clerk, clerk?.loaded, bridgeRef, onReady])

  return null
}

/**
 * Balanced, Mouse-Activated Light Wave Canvas Background.
 * Flows smoothly in idle state and visibly ripples, bends, and illuminates
 * with fluid travelling crests when activated by cursor or touch movement.
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

    const NODE_COUNT = 78
    const WAVE_CONFIGS = [
      {
        yRatio: 0.35,
        freq: 1.65,
        speed: 0.42,
        phase: 0.2,
        tension: 0.125,
        spring: 0.018,
        damping: 0.912,
        lightColor: [82, 141, 244],   // Sky Blue
        darkColor: [123, 170, 247],
      },
      {
        yRatio: 0.5,
        freq: 1.32,
        speed: -0.33,
        phase: 1.8,
        tension: 0.115,
        spring: 0.017,
        damping: 0.915,
        lightColor: [150, 123, 208],  // Soft Violet
        darkColor: [179, 157, 219],
      },
      {
        yRatio: 0.65,
        freq: 1.88,
        speed: 0.37,
        phase: 3.4,
        tension: 0.12,
        spring: 0.018,
        damping: 0.912,
        lightColor: [75, 181, 172],   // Aqua Teal
        darkColor: [128, 203, 196],
      },
      {
        yRatio: 0.79,
        freq: 1.48,
        speed: -0.28,
        phase: 5.0,
        tension: 0.11,
        spring: 0.017,
        damping: 0.916,
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
      activation: 0,
      inside: false,
    }

    function exciteWaves(px, py, vx, vy, boost = 1) {
      if (prefersReduced) return
      const speed = Math.hypot(vx, vy)
      if (speed < 0.2) return

      const energyGain = Math.min(1, (speed / 34) * boost)
      pointer.activation = Math.min(1, pointer.activation + energyGain * 0.26)

      const normX = Math.max(0, Math.min(1, px / Math.max(1, width)))
      const centerNode = normX * (NODE_COUNT - 1)
      const radiusNodes = Math.max(5, NODE_COUNT * 0.105)

      const clampedVy = Math.max(-18, Math.min(18, vy))
      const sweep = (vx >= 0 ? 1 : -1) * Math.min(10, speed * 0.22)
      const signedImpulse = (clampedVy * 0.3 + sweep * 0.55) * boost

      waves.forEach((w, wIdx) => {
        const waveY = height * w.yRatio
        const distY = Math.abs(py - waveY)
        const verticalReach = height * 0.58
        const yFalloff = Math.max(0.2, 1 - distY / verticalReach)
        const layerSign = wIdx % 2 === 0 ? 1 : -0.82

        const startIdx = Math.max(1, Math.floor(centerNode - radiusNodes * 2.5))
        const endIdx = Math.min(NODE_COUNT - 2, Math.ceil(centerNode + radiusNodes * 2.5))

        for (let i = startIdx; i <= endIdx; i++) {
          const d = (i - centerNode) / radiusNodes
          const gaussian = Math.exp(-0.5 * d * d)
          const wavePacket = gaussian * (1 - 0.26 * d)
          w.vel[i] += signedImpulse * yFalloff * layerSign * wavePacket * 0.115
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
      exciteWaves(e.clientX, e.clientY, 0, -16, 1.15)
      pointer.activation = Math.min(1, pointer.activation + 0.38)
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
      exciteWaves(t.clientX, t.clientY, 0, -12, 0.95)
    }

    let rafId = null
    const t0 = performance.now()

    function render(now) {
      const elapsed = (now - t0) * 0.001

      pointer.smoothX += (pointer.x - pointer.smoothX) * 0.115
      pointer.smoothY += (pointer.y - pointer.smoothY) * 0.115
      pointer.activation *= 0.966

      ctx.clearRect(0, 0, width, height)

      // 1. Mouse-Activated Radial Light Bloom
      if (pointer.activation > 0.01) {
        const bloomRadius = Math.min(width, height) * 0.52
        const bloomAlpha = (dark ? 0.13 : 0.165) * pointer.activation
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
          radial.addColorStop(0.55, `rgba(179, 157, 219, ${(bloomAlpha * 0.44).toFixed(3)})`)
          radial.addColorStop(1, 'rgba(31, 28, 24, 0)')
        } else {
          radial.addColorStop(0, `rgba(82, 141, 244, ${bloomAlpha.toFixed(3)})`)
          radial.addColorStop(0.55, `rgba(150, 123, 208, ${(bloomAlpha * 0.44).toFixed(3)})`)
          radial.addColorStop(1, 'rgba(247, 246, 243, 0)')
        }
        ctx.fillStyle = radial
        ctx.fillRect(0, 0, width, height)
      }

      // 2. Step Coupled Wave Physics & Render Luminous Light Ribbons
      const stepX = width / (NODE_COUNT - 1)
      const ptsX = new Float32Array(NODE_COUNT)
      const ptsY = new Float32Array(NODE_COUNT)

      waves.forEach(w => {
        for (let i = 1; i < NODE_COUNT - 1; i++) {
          const laplacian = w.disp[i - 1] + w.disp[i + 1] - 2 * w.disp[i]
          w.nextVel[i] = w.vel[i] + laplacian * w.tension - w.disp[i] * w.spring
        }
        for (let i = 1; i < NODE_COUNT - 1; i++) {
          const smoothedVel =
            w.nextVel[i] * 0.95 + (w.nextVel[i - 1] + w.nextVel[i + 1]) * 0.025
          w.vel[i] = smoothedVel * w.damping
          w.disp[i] = Math.max(-36, Math.min(36, w.disp[i] + w.vel[i]))
        }
        w.disp[0] = w.disp[1] * 0.5
        w.disp[NODE_COUNT - 1] = w.disp[NODE_COUNT - 2] * 0.5

        const baseY = height * w.yRatio
        const baseAmp = prefersReduced ? 4 : 6.5 + pointer.activation * 11.5

        for (let i = 0; i < NODE_COUNT; i++) {
          const u = i / (NODE_COUNT - 1)
          const x = i * stepX
          const harmonic =
            Math.sin(u * Math.PI * 2 * w.freq + elapsed * w.speed + w.phase) * baseAmp +
            Math.cos(u * Math.PI * 2 * (w.freq * 0.58) - elapsed * (w.speed * 0.68) + w.phase) *
              (baseAmp * 0.38)

          ptsX[i] = x
          ptsY[i] = baseY + harmonic + w.disp[i]
        }

        const [r, g, b] = dark ? w.darkColor : w.lightColor
        const activeBoost = pointer.activation

        // Trace smooth curve
        ctx.beginPath()
        ctx.moveTo(ptsX[0], ptsY[0])
        for (let i = 0; i < NODE_COUNT - 1; i++) {
          const midX = (ptsX[i] + ptsX[i + 1]) * 0.5
          const midY = (ptsY[i] + ptsY[i + 1]) * 0.5
          ctx.quadraticCurveTo(ptsX[i], ptsY[i], midX, midY)
        }
        ctx.lineTo(ptsX[NODE_COUNT - 1], ptsY[NODE_COUNT - 1])

        // Luminous Wave Curtain Fill
        const curtainHeight = Math.max(120, height * 0.22)
        const fillGrad = ctx.createLinearGradient(0, baseY - 36, 0, baseY + curtainHeight)
        const topAlpha = (dark ? 0.062 : 0.082) + activeBoost * (dark ? 0.095 : 0.11)
        fillGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${topAlpha.toFixed(3)})`)
        fillGrad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${(topAlpha * 0.3).toFixed(3)})`)
        fillGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.save()
        ctx.lineTo(width, baseY + curtainHeight + 65)
        ctx.lineTo(0, baseY + curtainHeight + 65)
        ctx.closePath()
        ctx.fillStyle = fillGrad
        ctx.fill()
        ctx.restore()

        // Re-trace crest for luminous filament
        ctx.beginPath()
        ctx.moveTo(ptsX[0], ptsY[0])
        for (let i = 0; i < NODE_COUNT - 1; i++) {
          const midX = (ptsX[i] + ptsX[i + 1]) * 0.5
          const midY = (ptsY[i] + ptsY[i + 1]) * 0.5
          ctx.quadraticCurveTo(ptsX[i], ptsY[i], midX, midY)
        }
        ctx.lineTo(ptsX[NODE_COUNT - 1], ptsY[NODE_COUNT - 1])

        const cursorNormX = Math.max(0.05, Math.min(0.95, pointer.smoothX / Math.max(1, width)))
        const spread = 0.24
        const leftStop = Math.max(0, cursorNormX - spread)
        const rightStop = Math.min(1, cursorNormX + spread)

        const baseStrokeAlpha = (dark ? 0.18 : 0.23) + activeBoost * 0.18
        const peakStrokeAlpha = Math.min(0.82, baseStrokeAlpha + activeBoost * 0.38)

        const strokeGrad = ctx.createLinearGradient(0, 0, width, 0)
        strokeGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(baseStrokeAlpha * 0.52).toFixed(3)})`)
        strokeGrad.addColorStop(leftStop, `rgba(${r}, ${g}, ${b}, ${baseStrokeAlpha.toFixed(3)})`)
        strokeGrad.addColorStop(cursorNormX, `rgba(${r}, ${g}, ${b}, ${peakStrokeAlpha.toFixed(3)})`)
        strokeGrad.addColorStop(rightStop, `rgba(${r}, ${g}, ${b}, ${baseStrokeAlpha.toFixed(3)})`)
        strokeGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${(baseStrokeAlpha * 0.52).toFixed(3)})`)

        // Soft outer light halo
        ctx.strokeStyle = strokeGrad
        ctx.lineWidth = 3.8 + activeBoost * 3.2
        ctx.globalAlpha = 0.22 + activeBoost * 0.24
        ctx.stroke()

        // Crisp inner light wave filament
        ctx.globalAlpha = 1
        ctx.lineWidth = 1.35 + activeBoost * 0.65
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [verificationStep, setVerificationStep] = useState(null) // null | 'signup_code' | 'signin_code'
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Shown when Clerk instance does not have oauth_google toggled on yet and no VITE_GOOGLE_CLIENT_ID is set
  const [googleConfigPromptOpen, setGoogleConfigPromptOpen] = useState(false)
  const [oauthKeyInput, setOauthKeyInput] = useState('')
  const [oauthConfigError, setOauthConfigError] = useState('')

  const clerkBridgeRef = useRef(null)
  const ssoContinueHandledRef = useRef(false)
  const autoLaunchHandledRef = useRef(false)

  useEffect(() => {
    const clientId = getEffectiveGoogleClientId()
    if (clientId) {
      loadGoogleGsiScript().catch(() => {})
    }
  }, [])

  async function handleClerkReady(clerk) {
    if (typeof window === 'undefined') return

    // If reloaded right after saving a new Clerk key with Google SSO enabled, auto-launch Google OAuth
    if (!autoLaunchHandledRef.current && window.location.search.includes('auto_google_oauth=1')) {
      autoLaunchHandledRef.current = true
      window.history.replaceState({}, '', window.location.pathname)
      handleGoogleLoginClick()
      return
    }

    if (ssoContinueHandledRef.current || !window.location.search.includes('sso-continue')) return
    ssoContinueHandledRef.current = true

    const signUp = clerk?.client?.signUp
    if (!signUp) return

    try {
      if (signUp.status === 'complete' && signUp.createdSessionId) {
        await clerk.setActive({ session: signUp.createdSessionId })
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      if (signUp.status === 'missing_requirements') {
        const missing = signUp.missingFields || []
        const updatePayload = {}
        if (missing.includes('username')) {
          const base = (signUp.emailAddress || 'student')
            .split('@')[0]
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .toLowerCase()
          updatePayload.username = `${base || 'student'}_${Math.floor(100 + Math.random() * 900)}`
        }
        if (missing.includes('legal_accepted')) {
          updatePayload.legalAccepted = true
        }
        if (Object.keys(updatePayload).length > 0) {
          const updated = await signUp.update(updatePayload)
          if (updated.status === 'complete' && updated.createdSessionId) {
            await clerk.setActive({ session: updated.createdSessionId })
            window.history.replaceState({}, '', window.location.pathname)
          }
        }
      }
    } catch (err) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        'Please finish completing your account details to continue.'
      setError(msg)
    }
  }

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
      darkMode: typeof profile.darkMode === 'boolean' ? profile.darkMode : undefined,
      avatarBg: profile.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
    }
    if (onLocalSignIn) onLocalSignIn(userObj)
  }

  async function launchDirectGoogleOAuth(clientId) {
    setError('')
    setOauthConfigError('')
    setGoogleLoading(true)

    try {
      const google = await loadGoogleGsiScript()
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        prompt: 'select_account',
        error_callback: err => {
          setGoogleLoading(false)
          if (err?.type && err.type !== 'popup_closed') {
            setError(`Google OAuth error: ${err.type}`)
          }
        },
        callback: async tokenResponse => {
          if (!tokenResponse?.access_token) {
            setGoogleLoading(false)
            return
          }
          try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
            })
            if (!res.ok) throw new Error('Could not retrieve Google account profile.')
            const data = await res.json()
            setGoogleLoading(false)
            setGoogleConfigPromptOpen(false)
            finalizeUserSession({
              fullName: data.name || formatNameFromEmail(data.email),
              email: data.email,
              picture: data.picture || null,
              provider: 'google',
              avatarBg: 'linear-gradient(135deg, #4285F4, #34A853)',
            })
          } catch (err) {
            setGoogleLoading(false)
            setError(err?.message || 'Google Sign-In failed. Please try again.')
          }
        },
      })
      tokenClient.requestAccessToken()
    } catch (err) {
      setGoogleLoading(false)
      setError(err?.message || 'Unable to load Google Identity Services.')
    }
  }

  /**
   * Launches real Google OAuth (accounts.google.com) via Google Identity Services or Clerk OAuth.
   */
  async function handleGoogleLoginClick() {
    setError('')
    setOauthConfigError('')

    // 1. If a Google OAuth Web Client ID is configured (.env or saved), open real Google OAuth popup directly
    const directClientId = getEffectiveGoogleClientId()
    if (directClientId) {
      await launchDirectGoogleOAuth(directClientId)
      return
    }

    setGoogleLoading(true)

    // 2. Otherwise use Clerk's Google OAuth redirect (accounts.google.com)
    if (hasPublishableKey) {
      let waited = 0
      while (!clerkBridgeRef.current?.client && waited < 6000) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waited += 100
      }

      const clerk = clerkBridgeRef.current
      const baseUrl = `${window.location.origin}${window.location.pathname}`
      const redirectUrl = `${baseUrl}?sso-callback=1`

      if (!clerk?.client?.signIn) {
        setGoogleLoading(false)
        setError(
          'Clerk authentication is still initializing (or reload your dev server to pick up .env). Try clicking Continue with Google again.'
        )
        return
      }

      try {
        try {
          localStorage.removeItem('clubhub_auth_user')
        } catch {
          // Ignore storage errors
        }

        await clerk.client.signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl,
          redirectUrlComplete: baseUrl,
          oidcPrompt: 'select_account',
        })
        return
      } catch (err) {
        setGoogleLoading(false)
        const rawMsg =
          err?.errors?.[0]?.longMessage ||
          err?.errors?.[0]?.message ||
          err?.message ||
          ''
        const errCode = err?.errors?.[0]?.code || ''

        // Detect when oauth_google is turned OFF in the active Clerk Dashboard instance
        if (
          errCode === 'form_param_value_invalid' ||
          rawMsg.includes('oauth_google') ||
          rawMsg.includes('allowed values for parameter strategy')
        ) {
          setGoogleConfigPromptOpen(true)
          return
        }

        setError(rawMsg || 'Unable to start Google Sign-In.')
        return
      }
    }

    setGoogleLoading(false)
    setGoogleConfigPromptOpen(true)
  }

  async function handleSaveOAuthKeyAndConnect(e) {
    e.preventDefault()
    setOauthConfigError('')
    const trimmed = oauthKeyInput.trim()

    if (!trimmed) {
      // If left blank, user likely just enabled Google in their Clerk Dashboard and wants to retry
      setGoogleConfigPromptOpen(false)
      handleGoogleLoginClick()
      return
    }

    // Case A: Google OAuth Web Client ID (...apps.googleusercontent.com)
    if (trimmed.includes('.apps.googleusercontent.com')) {
      try {
        localStorage.setItem(STORED_GOOGLE_CLIENT_ID_KEY, trimmed)
      } catch {
        // Ignore storage errors
      }
      await launchDirectGoogleOAuth(trimmed)
      return
    }

    // Case B: Clerk Publishable Key (pk_test_... or pk_live_...) with Google SSO enabled
    if (trimmed.startsWith('pk_test_') || trimmed.startsWith('pk_live_')) {
      try {
        localStorage.setItem(STORED_CLERK_KEY, trimmed)
      } catch {
        // Ignore storage errors
      }
      const baseUrl = `${window.location.origin}${window.location.pathname}`
      window.location.href = `${baseUrl}?auto_google_oauth=1`
      return
    }

    setOauthConfigError(
      'Enter either a Google Client ID (*.apps.googleusercontent.com) or a Clerk Publishable Key (pk_test_...).'
    )
  }

  async function handleVerifyCodeSubmit(e) {
    e.preventDefault()
    setError('')
    const code = verificationCode.trim()
    if (!code) {
      setError('Please enter the verification code sent to your email.')
      return
    }

    const clerk = clerkBridgeRef.current
    if (!clerk?.client) {
      setError('Authentication session expired. Please try again.')
      setVerificationStep(null)
      return
    }

    setSubmitting(true)
    try {
      if (verificationStep === 'signup_code') {
        const res = await clerk.client.signUp.attemptEmailAddressVerification({ code })
        if (res?.status === 'complete' && res?.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId })
          setSubmitting(false)
          return
        }
      } else if (verificationStep === 'signin_code') {
        const res = await clerk.client.signIn.attemptFirstFactor({
          strategy: 'email_code',
          code,
        })
        if (res?.status === 'complete' && res?.createdSessionId) {
          await clerk.setActive({ session: res.createdSessionId })
          setSubmitting(false)
          return
        }
      }
      setSubmitting(false)
      setError('Verification could not be completed. Please double-check your code.')
    } catch (err) {
      setSubmitting(false)
      setError(
        err?.errors?.[0]?.longMessage ||
          err?.errors?.[0]?.message ||
          'Invalid verification code. Please try again.'
      )
    }
  }

  /**
   * Unified Sign In + Sign Up handler:
   * Signs into an existing account if found, or automatically creates a new account if not.
   */
  async function handleFormSubmit(e) {
    e.preventDefault()
    setError('')

    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid email address.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)
    const clerk = clerkBridgeRef.current
    const registered = getRegisteredEmailAccounts()
    const existingLocal = registered[cleanEmail]

    // 1. Try Clerk authentication first when Clerk is active
    if (hasPublishableKey && clerk?.client) {
      let notFoundInClerk = false

      if (clerk.client.signIn) {
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
          if (res?.status === 'needs_first_factor') {
            const emailFactor = (res.supportedFirstFactors || []).find(
              f => f.strategy === 'email_code'
            )
            if (emailFactor) {
              await clerk.client.signIn.prepareFirstFactor({
                strategy: 'email_code',
                emailAddressId: emailFactor.emailAddressId,
              })
              setVerificationStep('signin_code')
              setVerificationCode('')
              setSubmitting(false)
              return
            }
          }
        } catch (err) {
          const code = err?.errors?.[0]?.code
          if (code === 'form_password_incorrect') {
            setSubmitting(false)
            setError('Incorrect password for this account. Please try again.')
            return
          }
          if (code === 'form_identifier_not_found') {
            notFoundInClerk = true
          }
        }
      }

      // If email is not in Clerk yet and not an existing local account, auto-create in Clerk
      if (notFoundInClerk && !existingLocal && clerk.client.signUp) {
        try {
          const derivedName = formatNameFromEmail(cleanEmail)
          const nameParts = derivedName.split(/\s+/)
          const firstName = nameParts[0] || 'Student'
          const lastName = nameParts.slice(1).join(' ') || undefined

          let signUpRes = await clerk.client.signUp.create({
            emailAddress: cleanEmail,
            password,
            firstName,
            ...(lastName ? { lastName } : {}),
          })

          if (signUpRes?.status === 'missing_requirements') {
            const missing = signUpRes.missingFields || []
            const patch = {}
            if (missing.includes('username')) {
              const base = cleanEmail
                .split('@')[0]
                .replace(/[^a-zA-Z0-9_-]/g, '')
                .toLowerCase()
              patch.username = `${base || 'student'}_${Math.floor(100 + Math.random() * 900)}`
            }
            if (missing.includes('legal_accepted')) {
              patch.legalAccepted = true
            }
            if (Object.keys(patch).length > 0) {
              signUpRes = await clerk.client.signUp.update(patch)
            }
          }

          if (signUpRes?.status === 'complete' && signUpRes?.createdSessionId) {
            await clerk.setActive({ session: signUpRes.createdSessionId })
            setSubmitting(false)
            return
          }

          if (signUpRes?.unverifiedFields?.includes('email_address')) {
            await clerk.client.signUp.prepareEmailAddressVerification({
              strategy: 'email_code',
            })
            setVerificationStep('signup_code')
            setVerificationCode('')
            setSubmitting(false)
            return
          }
        } catch (err) {
          const code = err?.errors?.[0]?.code
          if (
            code === 'form_password_pwned' ||
            code === 'form_password_length_too_short' ||
            code === 'form_param_format_invalid'
          ) {
            setSubmitting(false)
            setError(
              err?.errors?.[0]?.longMessage ||
                err?.errors?.[0]?.message ||
                'New accounts require a stronger password (at least 8 characters).'
            )
            return
          }
        }
      }
    }

    // 2. Unified local account sign-in / automatic sign-up fallback
    if (existingLocal) {
      if (existingLocal.password && existingLocal.password !== password) {
        setSubmitting(false)
        setError('Incorrect password for this account. Please try again.')
        return
      }

      const accountToSave = {
        ...existingLocal,
        email: cleanEmail,
        fullName: existingLocal.fullName || formatNameFromEmail(cleanEmail),
        password,
        darkMode:
          typeof existingLocal.darkMode === 'boolean' ? existingLocal.darkMode : undefined,
        avatarBg:
          existingLocal.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
      }
      saveRegisteredEmailAccount(accountToSave)
      setSubmitting(false)
      finalizeUserSession(accountToSave)
      return
    }

    const newAccount = {
      email: cleanEmail,
      fullName: formatNameFromEmail(cleanEmail),
      password,
      darkMode: Boolean(dark),
      avatarBg: 'linear-gradient(135deg, var(--blue), var(--purple))',
    }
    saveRegisteredEmailAccount(newAccount)
    setSubmitting(false)
    finalizeUserSession(newAccount)
  }

  return (
    <div className="relative min-h-dvh w-full flex flex-col bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 overflow-x-hidden">
      {hasPublishableKey && (
        <ClerkAuthBridge bridgeRef={clerkBridgeRef} onReady={handleClerkReady} />
      )}

      {/* ── Balanced Mouse-Activated Light Wave Canvas Background ── */}
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

          {/* ── Right Column: Clean Login Card (Google OAuth Above Normal Login Fields) ── */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end w-full fade-in">
            <div
              className="w-full max-w-[410px] rounded-[24px] bg-[var(--bg-card)]/90 backdrop-blur-xl
                border border-[var(--border)] shadow-[var(--shadow-lg)] p-5 sm:p-7 space-y-5"
            >
              {/* Card Header */}
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text)]">
                  {verificationStep ? 'Verify your email' : 'Welcome to ClubHub'}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {verificationStep
                    ? `Enter the code sent to ${email}`
                    : 'Sign in or create your account in one step'}
                </p>
              </div>

              {verificationStep ? (
                <form onSubmit={handleVerifyCodeSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text)] mb-1.5">
                      Verification Code
                    </label>
                    <div className="flex items-center gap-2.5 px-3.5 min-h-[44px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] focus-within:border-[var(--blue)] transition-colors">
                      <KeyRound size={15} className="text-[var(--text-light)] shrink-0" />
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value)}
                        placeholder="6-digit code"
                        className="w-full bg-transparent border-none outline-none text-base sm:text-sm text-[var(--text)] placeholder:text-[var(--text-light)] tracking-widest"
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
                    disabled={submitting}
                    className="w-full min-h-[46px] py-2.5 rounded-xl bg-[var(--blue)] hover:opacity-95 text-white text-sm font-semibold
                      shadow-[0_4px_14px_rgba(82,141,244,0.32)] flex items-center justify-center gap-1.5
                      transition-all cursor-pointer border-none disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <span>Verify &amp; Continue</span>
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVerificationStep(null)
                      setVerificationCode('')
                      setError('')
                    }}
                    className="w-full text-center text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer py-1"
                  >
                    &larr; Back to sign in
                  </button>
                </form>
              ) : (
                <>
                  {/* ── 1. Real Google OAuth Button (Above Normal Login Fields) ── */}
                  <button
                    type="button"
                    onClick={handleGoogleLoginClick}
                    disabled={googleLoading || submitting}
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
                    <span>
                      {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
                    </span>
                  </button>

                  {/* ── Actionable OAuth Setup Helper if Clerk Instance Has Google SSO Turned Off ── */}
                  {googleConfigPromptOpen && (
                    <form
                      onSubmit={handleSaveOAuthKeyAndConnect}
                      className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] space-y-2.5 text-xs fade-in"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-[var(--text)]">
                          Enable Google OAuth on Clerk or paste a Client ID
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setGoogleConfigPromptOpen(false)
                            setOauthConfigError('')
                          }}
                          className="text-[var(--text-light)] hover:text-[var(--text)] bg-transparent border-none cursor-pointer p-0.5"
                          aria-label="Dismiss"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <p className="text-[11.5px] text-[var(--text-muted)] leading-relaxed">
                        The current Clerk instance does not have <strong>Google SSO</strong> toggled
                        on yet. Either enable <strong>Google</strong> under{' '}
                        <a
                          href="https://dashboard.clerk.com"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[var(--blue-ink)] font-semibold hover:underline"
                        >
                          Clerk Dashboard &rarr; SSO Connections <ExternalLink size={10} />
                        </a>{' '}
                        (uses Clerk&apos;s shared dev credentials immediately), or paste a{' '}
                        <code className="text-[10.5px]">*.apps.googleusercontent.com</code> Client ID
                        or your own <code className="text-[10.5px]">pk_test_...</code> key below:
                      </p>

                      <input
                        type="text"
                        value={oauthKeyInput}
                        onChange={e => setOauthKeyInput(e.target.value)}
                        placeholder="...apps.googleusercontent.com or pk_test_..."
                        className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
                      />

                      {oauthConfigError && (
                        <div className="text-[11px] text-[var(--red-ink)]">{oauthConfigError}</div>
                      )}

                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="submit"
                          className="px-4 min-h-[38px] rounded-xl bg-[var(--blue)] hover:opacity-95 text-white text-xs font-semibold border-none cursor-pointer transition-opacity"
                        >
                          {oauthKeyInput.trim() ? 'Save & Launch Google' : 'Retry Google Sign-In'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Divider */}
                  <div className="flex items-center gap-3 text-[11px] text-[var(--text-light)]">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span>or continue with email</span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </div>

                  {/* ── 2. Unified Email & Password Fields ── */}
                  <form onSubmit={handleFormSubmit} className="space-y-3.5">
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
                          placeholder="Enter or create a password"
                          autoComplete="current-password"
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

                    {/* Clerk Smart Bot Protection Mount Point */}
                    <div id="clerk-captcha" />

                    <button
                      type="submit"
                      disabled={submitting || googleLoading}
                      className="w-full min-h-[46px] py-2.5 rounded-xl bg-[var(--blue)] hover:opacity-95 text-white text-sm font-semibold
                        shadow-[0_4px_14px_rgba(82,141,244,0.32)] flex items-center justify-center gap-1.5
                        transition-all cursor-pointer border-none disabled:opacity-60"
                    >
                      {submitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          <span>Continue</span>
                          <ArrowRight size={15} />
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
