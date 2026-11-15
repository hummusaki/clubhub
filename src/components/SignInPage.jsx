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
  Users,
  Megaphone,
  Calendar,
  Clock,
} from 'lucide-react'
import { ClubHubLogo, IconBadge } from './ui'
import {
  STORED_CLERK_KEY,
  isValidClerkPublishableKey,
} from '../utils/authValidation'
import {
  authenticateWorkspaceEmail,
  syncExternalWorkspaceSession,
} from '../api/workspaceClient'
import {
  isSupabaseConfigured,
  signInOrSignUpWithSupabase,
} from '../lib/supabaseClient'

const STORED_GOOGLE_CLIENT_ID_KEY = 'clubhub_google_client_id'

// Support & Help links (e.g. Google Forms link for issue reporting)
const SUPPORT_FORM_URL = 'https://forms.gle/ZmD1cq6mLFFLxBeB8'
const SUPPORT_EMAIL = 'support@clubhub.ucsc.edu'

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
 * Zero-Latency Direct-Tracking Light Wave Canvas Background.
 * Locks cursor illumination, crest highlights, and shallow-water wave wakes 1:1
 * to the live pointer position on every frame with zero tracking lag.
 */
function LightWaveBackground({ dark }) {
  const canvasRef = useRef(null)
  const darkRef = useRef(dark)
  darkRef.current = dark

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    function isReducedMotion() {
      return (
        Boolean(mediaQuery?.matches) ||
        (typeof document !== 'undefined' &&
          document.documentElement.classList.contains('reduce-motion'))
      )
    }

    const NODE_COUNT = 128
    const OVERSCAN = 80
    const SPONGE_NODES = 14

    const WAVE_CONFIGS = [
      {
        yRatio: 0.34,
        depth: 0.78,
        freq: 1.45,
        speed: 0.36,
        phase: 0.2,
        tension: 0.29,
        spring: 0.0062,
        dampingRate: 0.0295,
        viscosity: 0.17,
        lightColor: [64, 112, 212],   // Muted Cobalt
        darkColor: [68, 134, 255],    // Electric Azure
      },
      {
        yRatio: 0.49,
        depth: 0.94,
        freq: 1.18,
        speed: -0.29,
        phase: 1.85,
        tension: 0.32,
        spring: 0.006,
        dampingRate: 0.0282,
        viscosity: 0.165,
        lightColor: [118, 96, 196],   // Muted Iris
        darkColor: [162, 112, 255],   // Vivid Violet
      },
      {
        yRatio: 0.64,
        depth: 1.0,
        freq: 1.62,
        speed: 0.33,
        phase: 3.45,
        tension: 0.31,
        spring: 0.0064,
        dampingRate: 0.029,
        viscosity: 0.165,
        lightColor: [42, 148, 140],   // Muted Sea-Glass Teal
        darkColor: [25, 214, 194],    // Vivid Cyan-Teal
      },
      {
        yRatio: 0.79,
        depth: 0.85,
        freq: 1.3,
        speed: -0.25,
        phase: 5.05,
        tension: 0.27,
        spring: 0.0058,
        dampingRate: 0.03,
        viscosity: 0.175,
        lightColor: [196, 140, 42],   // Warm Ochre Gold
        darkColor: [255, 182, 42],    // Vivid Golden Amber
      },
    ]

    let width = window.innerWidth || 1200
    let height = window.innerHeight || 800
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    const waves = WAVE_CONFIGS.map(cfg => ({
      ...cfg,
      disp: new Float32Array(NODE_COUNT),
      vel: new Float32Array(NODE_COUNT),
      nextVel: new Float32Array(NODE_COUNT),
      sway: new Float32Array(NODE_COUNT),
      fx: width * 0.5,
      fy: height * 0.5,
      fvx: 0,
      fvy: 0,
      smoothEnergy: 0,
    }))

    const ptsX = new Float32Array(NODE_COUNT)
    const ptsY = new Float32Array(NODE_COUNT)
    const ptsUnderY = new Float32Array(NODE_COUNT)

    const pointer = {
      rawX: width * 0.5,
      rawY: height * 0.5,
      prevX: width * 0.5,
      prevY: height * 0.5,
      bufX: width * 0.5,
      bufY: height * 0.5,
      glowX: width * 0.5,
      glowY: height * 0.5,
      velX: 0,
      velY: 0,
      targetActivation: 0,
      activation: 0,
      inside: false,
      lastEventAt: 0,
      lastRippleAt: 0,
    }

    const ripples = []
    let darkMix = darkRef.current ? 1 : 0

    function clampToViewport() {
      pointer.rawX = Math.max(0, Math.min(width, pointer.rawX))
      pointer.rawY = Math.max(0, Math.min(height, pointer.rawY))
      pointer.prevX = Math.max(0, Math.min(width, pointer.prevX))
      pointer.prevY = Math.max(0, Math.min(height, pointer.prevY))
      pointer.bufX = pointer.rawX
      pointer.bufY = pointer.rawY
      pointer.glowX = pointer.rawX
      pointer.glowY = pointer.rawY
      for (let i = 0; i < waves.length; i++) {
        waves[i].fx = pointer.rawX
        waves[i].fy = pointer.rawY
      }
    }

    function resize() {
      const parent = canvas.parentElement
      width = (parent && parent.clientWidth) || window.innerWidth || 1200
      height = (parent && parent.clientHeight) || window.innerHeight || 800
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      clampToViewport()
    }

    resize()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && canvas.parentElement
        ? new ResizeObserver(() => resize())
        : null
    if (resizeObserver && canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement)
    }

    function toCanvasCoords(clientX, clientY) {
      const rect = canvas.getBoundingClientRect()
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      }
    }

    function syncEntryPosition(x, y) {
      pointer.rawX = x
      pointer.rawY = y
      pointer.prevX = x
      pointer.prevY = y
      pointer.bufX = x
      pointer.bufY = y
      pointer.glowX = x
      pointer.glowY = y
      pointer.velX = 0
      pointer.velY = 0
      for (let i = 0; i < waves.length; i++) {
        waves[i].fx = x
        waves[i].fy = y
        waves[i].fvx = 0
        waves[i].fvy = 0
      }
      pointer.inside = true
    }

    function queueBufferedDroplet(x, y, strength = 1) {
      if (isReducedMotion()) return
      const now = performance.now()
      if (now - pointer.lastRippleAt < 150) return
      pointer.lastRippleAt = now
      if (ripples.length >= 4) ripples.shift()
      ripples.push({
        x,
        y,
        age: 0,
        duration: 0.2,
        strength,
      })
      pointer.targetActivation = Math.min(0.72, pointer.targetActivation + 0.14 * strength)
    }

    function onMouseMove(e) {
      const now = performance.now()
      const { x, y } = toCanvasCoords(e.clientX, e.clientY)
      if (!pointer.inside) {
        syncEntryPosition(x, y)
      } else {
        pointer.rawX = x
        pointer.rawY = y
      }
      pointer.lastEventAt = now
    }

    function onMouseDown(e) {
      const { x, y } = toCanvasCoords(e.clientX, e.clientY)
      if (!pointer.inside) {
        syncEntryPosition(x, y)
      }
      pointer.lastEventAt = performance.now()
      queueBufferedDroplet(x, y, 1)
    }

    function onMouseOut(e) {
      if (!e.relatedTarget) {
        pointer.inside = false
      }
    }

    function onWindowBlur() {
      pointer.inside = false
    }

    function onTouchStart(e) {
      if (!e.touches || e.touches.length === 0) return
      const t = e.touches[0]
      const { x, y } = toCanvasCoords(t.clientX, t.clientY)
      syncEntryPosition(x, y)
      pointer.lastEventAt = performance.now()
      queueBufferedDroplet(x, y, 0.85)
    }

    function onTouchMove(e) {
      if (!e.touches || e.touches.length === 0) return
      const t = e.touches[0]
      const { x, y } = toCanvasCoords(t.clientX, t.clientY)
      if (!pointer.inside) {
        syncEntryPosition(x, y)
      } else {
        pointer.rawX = x
        pointer.rawY = y
      }
      pointer.lastEventAt = performance.now()
    }

    function onTouchEnd() {
      pointer.inside = false
    }

    function traceForwardCurve(xs, ys) {
      ctx.moveTo(xs[0], ys[0])
      for (let i = 0; i < NODE_COUNT - 1; i++) {
        const midX = (xs[i] + xs[i + 1]) * 0.5
        const midY = (ys[i] + ys[i + 1]) * 0.5
        ctx.quadraticCurveTo(xs[i], ys[i], midX, midY)
      }
      ctx.lineTo(xs[NODE_COUNT - 1], ys[NODE_COUNT - 1])
    }

    function traceReverseCurve(xs, ys) {
      ctx.lineTo(xs[NODE_COUNT - 1], ys[NODE_COUNT - 1])
      for (let i = NODE_COUNT - 1; i > 0; i--) {
        const midX = (xs[i] + xs[i - 1]) * 0.5
        const midY = (ys[i] + ys[i - 1]) * 0.5
        ctx.quadraticCurveTo(xs[i], ys[i], midX, midY)
      }
      ctx.lineTo(xs[0], ys[0])
    }

    let rafId = null
    const t0 = performance.now()
    let prevNow = t0

    function render(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - prevNow) * 0.001))
      prevNow = now
      const dt60 = dt * 60
      const elapsed = (now - t0) * 0.001
      const reduced = isReducedMotion()

      // Smoothly cross-fade palette when light/dark theme toggles
      const targetDark = darkRef.current ? 1 : 0
      darkMix += (targetDark - darkMix) * (1 - Math.exp(-dt * 9))

      // Direct 1:1 cursor position tracking (zero position lag)
      const prevX = pointer.prevX
      const prevY = pointer.prevY
      const moveX = pointer.rawX - prevX
      const moveY = pointer.rawY - prevY
      pointer.prevX = pointer.rawX
      pointer.prevY = pointer.rawY
      pointer.bufX = pointer.rawX
      pointer.bufY = pointer.rawY
      pointer.glowX = pointer.rawX
      pointer.glowY = pointer.rawY

      // Low-pass filtered velocity prevents 60Hz/120Hz sub-frame mouse event strobing
      const rawVx = Math.max(-2400, Math.min(2400, moveX / dt))
      const rawVy = Math.max(-2400, Math.min(2400, moveY / dt))
      const velAlpha = 1 - Math.exp(-dt * 14)
      pointer.velX += (rawVx - pointer.velX) * velAlpha
      pointer.velY += (rawVy - pointer.velY) * velAlpha

      // Steady, flicker-free illumination while cursor is on page (decoupled from per-frame delta spikes)
      const smoothSpeed = reduced ? 0 : Math.hypot(pointer.velX, pointer.velY)
      const steadyTarget =
        !reduced && pointer.inside ? 0.46 + 0.14 * Math.tanh(smoothSpeed / 950) : 0
      const envRate = steadyTarget > pointer.targetActivation ? 7.5 : 2.6
      pointer.targetActivation +=
        (steadyTarget - pointer.targetActivation) * (1 - Math.exp(-dt * envRate))
      pointer.activation +=
        (pointer.targetActivation - pointer.activation) * (1 - Math.exp(-dt * 8.0))

      // Advance buffered click/touch droplets
      for (let r = ripples.length - 1; r >= 0; r--) {
        ripples[r].age += dt
        if (ripples[r].age >= ripples[r].duration) {
          ripples.splice(r, 1)
        }
      }

      ctx.clearRect(0, 0, width, height)

      // 1. Buffered Radial Light Bloom (gentle in light mode, vivid in dark mode)
      if (pointer.activation > 0.008) {
        const bloomRadius = Math.min(width, height) * 0.55
        const bloomAlpha = (0.088 + 0.102 * darkMix) * pointer.activation
        const r1 = Math.round(64 + (68 - 64) * darkMix)
        const g1 = Math.round(112 + (134 - 112) * darkMix)
        const b1 = Math.round(212 + (255 - 212) * darkMix)
        const r2 = Math.round(118 + (162 - 118) * darkMix)
        const g2 = Math.round(96 + (112 - 96) * darkMix)
        const b2 = Math.round(196 + (255 - 196) * darkMix)

        const radial = ctx.createRadialGradient(
          pointer.glowX,
          pointer.glowY,
          0,
          pointer.glowX,
          pointer.glowY,
          bloomRadius
        )
        radial.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, ${bloomAlpha.toFixed(3)})`)
        radial.addColorStop(0.55, `rgba(${r2}, ${g2}, ${b2}, ${(bloomAlpha * 0.44).toFixed(3)})`)
        radial.addColorStop(1, `rgba(${r2}, ${g2}, ${b2}, 0)`)
        ctx.fillStyle = radial
        ctx.fillRect(0, 0, width, height)
      }

      // 2. Stage 2 Per-Layer Fluid Coupling & Shallow-Water Wave Simulation
      const totalSpan = width + OVERSCAN * 2
      const stepX = totalSpan / (NODE_COUNT - 1)
      const wakeBaseRadius = Math.max(84, width * 0.088)
      const swayDecay = Math.exp(-dt * 6.8)
      const subSteps = Math.min(4, Math.max(1, Math.ceil(dt * 120)))
      const h = dt60 / subSteps

      for (let wIdx = 0; wIdx < waves.length; wIdx++) {
        const w = waves[wIdx]
        const waveY = height * w.yRatio

        // Direct 1:1 per-layer cursor coupling (zero depth lag)
        w.fx = pointer.rawX
        w.fy = pointer.rawY
        w.fvx = pointer.velX
        w.fvy = pointer.velY

        for (let i = 0; i < NODE_COUNT; i++) {
          w.sway[i] *= swayDecay
        }

        if (!reduced) {
          const moveDist = Math.hypot(moveX, moveY)
          const layerSpeed = Math.hypot(w.fvx, w.fvy)
          if (moveDist > 0.15 && layerSpeed > 2) {
            const ux = Math.tanh(w.fvx / 620)
            const uy = Math.tanh(w.fvy / 520)
            const sigmaY = height * 0.28
            const wakeRadius = wakeBaseRadius * (1.16 - 0.2 * w.depth)
            const strength = 0.52 * (0.86 + 0.22 * w.depth)

            const segSteps = Math.min(6, Math.max(1, Math.ceil(moveDist / (wakeRadius * 0.65))))
            const stepWeight = 1 / segSteps

            for (let s = 1; s <= segSteps; s++) {
              const t = s / segSteps
              const sampleX = prevX + moveX * t
              const sampleY = prevY + moveY * t
              const dyWave = sampleY - waveY
              const yFalloff = 0.16 + 0.84 * Math.exp(-0.5 * (dyWave / sigmaY) ** 2)

              const centerIdx = (sampleX + OVERSCAN) / stepX
              const spanIdx = (wakeRadius * 3.1) / stepX
              const startIdx = Math.max(1, Math.floor(centerIdx - spanIdx))
              const endIdx = Math.min(NODE_COUNT - 2, Math.ceil(centerIdx + spanIdx))

              for (let i = startIdx; i <= endIdx; i++) {
                const nodeX = -OVERSCAN + i * stepX
                const d = (nodeX - sampleX) / wakeRadius
                const g = Math.exp(-0.5 * d * d)

                // Bow-wave crest ahead of horizontal travel + smooth vertical drag wake
                const horizWake = (-ux * d * 0.88 - Math.abs(ux) * (1 - d * d) * 0.18) * g
                const vertWake = uy * g * 1.06

                // Local energy headroom cushion prevents blowup on repeated scrubbing
                const localE = Math.abs(w.disp[i]) / 28 + Math.abs(w.vel[i]) / 2.2
                const headroom = 1 / (1 + localE * localE * 1.65)

                w.vel[i] +=
                  (vertWake + horizWake) * strength * yFalloff * headroom * stepWeight * dt60
                w.sway[i] = Math.max(
                  -9.5,
                  Math.min(9.5, w.sway[i] + ux * g * yFalloff * 0.52 * stepWeight * dt60)
                )
              }
            }
          }

          // Smooth bell-envelope droplet pulses on click/tap
          for (let r = 0; r < ripples.length; r++) {
            const rip = ripples[r]
            const env = Math.sin((rip.age / rip.duration) * Math.PI)
            const dyWave = rip.y - waveY
            const sigmaY = height * 0.3
            const yFalloff = 0.2 + 0.8 * Math.exp(-0.5 * (dyWave / sigmaY) ** 2)
            const dropRadius = wakeBaseRadius * 0.72
            const centerIdx = (rip.x + OVERSCAN) / stepX
            const spanIdx = (dropRadius * 3.0) / stepX
            const startIdx = Math.max(1, Math.floor(centerIdx - spanIdx))
            const endIdx = Math.min(NODE_COUNT - 2, Math.ceil(centerIdx + spanIdx))

            for (let i = startIdx; i <= endIdx; i++) {
              const nodeX = -OVERSCAN + i * stepX
              const d = (nodeX - rip.x) / dropRadius
              const packet = (1 - 0.45 * d * d) * Math.exp(-0.5 * d * d)
              const localE = Math.abs(w.disp[i]) / 30 + Math.abs(w.vel[i]) / 2.4
              const headroom = 1 / (1 + localE * localE * 1.5)
              w.vel[i] -= env * rip.strength * yFalloff * packet * headroom * 0.39 * dt60
            }
          }
        }
      }

      // Step coupled viscous wave PDE with subtle inter-ribbon sympathy
      for (let sub = 0; sub < subSteps; sub++) {
        for (let wIdx = 0; wIdx < waves.length; wIdx++) {
          const w = waves[wIdx]
          const prevW = wIdx > 0 ? waves[wIdx - 1] : null
          const nextW = wIdx < waves.length - 1 ? waves[wIdx + 1] : null
          const damp = Math.exp(-w.dampingRate * h)

          for (let i = 1; i < NODE_COUNT - 1; i++) {
            const u = w.disp[i]
            const lapU = w.disp[i - 1] + w.disp[i + 1] - 2 * u
            const lapV = w.vel[i - 1] + w.vel[i + 1] - 2 * w.vel[i]
            const restoring = w.spring * u + 0.0000038 * u * u * u

            let sympathy = 0
            if (prevW) sympathy += (prevW.disp[i] - u) * 0.001
            if (nextW) sympathy += (nextW.disp[i] - u) * 0.001

            w.nextVel[i] =
              (w.vel[i] + (lapU * w.tension - restoring + lapV * w.viscosity + sympathy) * h) *
              damp
          }
        }

        for (let wIdx = 0; wIdx < waves.length; wIdx++) {
          const w = waves[wIdx]
          for (let i = 1; i < NODE_COUNT - 1; i++) {
            let edgeDamp = 1
            if (i < SPONGE_NODES) {
              const ratio = 1 - i / SPONGE_NODES
              edgeDamp = 1 - 0.18 * ratio * ratio * h
            } else if (i > NODE_COUNT - 1 - SPONGE_NODES) {
              const ratio = 1 - (NODE_COUNT - 1 - i) / SPONGE_NODES
              edgeDamp = 1 - 0.18 * ratio * ratio * h
            }
            w.vel[i] = w.nextVel[i] * edgeDamp
            const nextU = w.disp[i] + w.vel[i] * h
            w.disp[i] = 68 * Math.tanh(nextU / 68)
          }
          w.disp[0] = w.disp[1] * 0.68
          w.disp[NODE_COUNT - 1] = w.disp[NODE_COUNT - 2] * 0.68
        }
      }

      // 3. Render Liquid Silk Ribbons, Atmospheric Curtains & Specular Filaments
      const haloSpan = Math.max(220, width * 0.28)

      for (let wIdx = 0; wIdx < waves.length; wIdx++) {
        const w = waves[wIdx]
        const baseY = height * w.yRatio

        // Measure rolling wave energy so glowing crests stay luminous while propagating
        let energySum = 0
        for (let i = SPONGE_NODES; i < NODE_COUNT - SPONGE_NODES; i += 2) {
          energySum += Math.abs(w.disp[i])
        }
        const avgDisp = energySum / ((NODE_COUNT - SPONGE_NODES * 2) * 0.5)
        const targetWaveEnergy = Math.min(1, avgDisp / 11)
        w.smoothEnergy += (targetWaveEnergy - w.smoothEnergy) * (1 - Math.exp(-dt * 8.5))

        const activeBoost = Math.min(1, pointer.activation * 0.72 + w.smoothEnergy * 0.45)
        const baseAmp = reduced ? 4 : 8.2 + activeBoost * 4.8

        for (let i = 0; i < NODE_COUNT; i++) {
          const u = i / (NODE_COUNT - 1)
          const xBase = -OVERSCAN + i * stepX
          const phaseWarp = Math.sin(u * Math.PI * 2.1 + elapsed * 0.2 + w.phase) * 0.28
          const theta = u * Math.PI * 2 * w.freq + elapsed * w.speed + w.phase + phaseWarp

          const h1 = Math.sin(theta)
          const h2 =
            Math.cos(
              u * Math.PI * 2 * (w.freq * 0.54) - elapsed * (w.speed * 0.63) + w.phase * 1.3
            ) * 0.42
          const h3 =
            Math.sin(
              u * Math.PI * 2 * (w.freq * 0.27) + elapsed * (w.speed * 0.31) + w.phase * 0.7
            ) * 0.22
          const harmonic = (h1 + h2 + h3) * baseAmp

          const slope =
            i > 0 && i < NODE_COUNT - 1 ? (w.disp[i + 1] - w.disp[i - 1]) * 0.5 : 0
          const orbitalSway = reduced
            ? 0
            : Math.max(
                -stepX * 0.36,
                Math.min(stepX * 0.36, -slope * 0.28 + w.sway[i] + Math.cos(theta) * 2.2)
              )

          ptsX[i] = xBase + orbitalSway
          ptsY[i] = baseY + harmonic + w.disp[i]

          const ribbonTwist =
            13 +
            Math.sin(u * Math.PI * 3.0 - elapsed * (w.speed * 0.82) + w.phase * 1.65) * 7.2 +
            w.disp[i] * 0.34
          ptsUnderY[i] = baseY + harmonic * 0.84 + w.disp[i] * 0.58 + ribbonTwist
        }

        const r = Math.round(w.lightColor[0] + (w.darkColor[0] - w.lightColor[0]) * darkMix)
        const g = Math.round(w.lightColor[1] + (w.darkColor[1] - w.lightColor[1]) * darkMix)
        const b = Math.round(w.lightColor[2] + (w.darkColor[2] - w.lightColor[2]) * darkMix)

        // A. Deep Atmospheric Curtain Fill (softer in light mode, richer in dark mode)
        ctx.beginPath()
        traceForwardCurve(ptsX, ptsY)
        const curtainHeight = Math.max(125, height * 0.23)
        const fillGrad = ctx.createLinearGradient(0, baseY - 44, 0, baseY + curtainHeight)
        const topAlpha =
          0.052 + darkMix * 0.034 + activeBoost * (0.072 + darkMix * 0.038)
        fillGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${topAlpha.toFixed(3)})`)
        fillGrad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${(topAlpha * 0.32).toFixed(3)})`)
        fillGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.save()
        ctx.lineTo(width + OVERSCAN, baseY + curtainHeight + 65)
        ctx.lineTo(-OVERSCAN, baseY + curtainHeight + 65)
        ctx.closePath()
        ctx.fillStyle = fillGrad
        ctx.fill()
        ctx.restore()

        // B. Twisting Liquid Silk Ribbon Body (between primary crest & undertow contour)
        ctx.beginPath()
        traceForwardCurve(ptsX, ptsY)
        traceReverseCurve(ptsX, ptsUnderY)
        ctx.closePath()
        const ribbonAlpha =
          0.032 + darkMix * 0.022 + activeBoost * (0.048 + darkMix * 0.024)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${ribbonAlpha.toFixed(3)})`
        ctx.fill()

        // C. Luminous Wave Crest Halo & Specular Filament
        ctx.beginPath()
        traceForwardCurve(ptsX, ptsY)

        const baseStrokeAlpha = 0.175 + darkMix * 0.085 + activeBoost * 0.16
        const peakStrokeAlpha = Math.min(0.84, baseStrokeAlpha + activeBoost * 0.34)
        const midStrokeAlpha = baseStrokeAlpha + (peakStrokeAlpha - baseStrokeAlpha) * 0.52

        const strokeGrad = ctx.createLinearGradient(
          pointer.glowX - haloSpan,
          0,
          pointer.glowX + haloSpan,
          0
        )
        const edgeRgba = `rgba(${r}, ${g}, ${b}, ${baseStrokeAlpha.toFixed(3)})`
        const midRgba = `rgba(${r}, ${g}, ${b}, ${midStrokeAlpha.toFixed(3)})`
        const peakRgba = `rgba(${r}, ${g}, ${b}, ${peakStrokeAlpha.toFixed(3)})`
        strokeGrad.addColorStop(0, edgeRgba)
        strokeGrad.addColorStop(0.25, midRgba)
        strokeGrad.addColorStop(0.5, peakRgba)
        strokeGrad.addColorStop(0.75, midRgba)
        strokeGrad.addColorStop(1, edgeRgba)

        // Soft outer liquid halo
        ctx.strokeStyle = strokeGrad
        ctx.lineWidth = 4.2 + activeBoost * 3.2
        ctx.globalAlpha = 0.22 + activeBoost * 0.23
        ctx.stroke()

        // Crisp inner light filament
        ctx.globalAlpha = 1
        ctx.lineWidth = 1.35 + activeBoost * 0.6
        ctx.stroke()
      }

      rafId = requestAnimationFrame(render)
    }

    function onPointerMove(e) {
      if (e.pointerType === 'touch') return
      onMouseMove(e)
    }

    function onPointerDown(e) {
      if (e.pointerType === 'touch') return
      onMouseDown(e)
    }

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mousedown', onMouseDown, { passive: true })
    window.addEventListener('mouseout', onMouseOut, { passive: true })
    window.addEventListener('blur', onWindowBlur, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })

    rafId = requestAnimationFrame(render)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (resizeObserver) resizeObserver.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseout', onMouseOut)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full z-0"
    />
  )
}

export default function SignInPage({
  dark,
  onToggleDark,
  hasPublishableKey,
  initialError = '',
  onEnterDemo,
  onLocalSignIn,
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [verificationStep, setVerificationStep] = useState(null) // null | 'signup_code' | 'signin_code'
  const [verificationCode, setVerificationCode] = useState('')
  const [error, setError] = useState(() => initialError || '')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    if (initialError) setError(initialError)
  }, [initialError])

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
      loadGoogleGsiScript().catch(() => { })
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.title = verificationStep ? 'Verify Email · ClubHub' : 'Sign In · ClubHub'
  }, [verificationStep])

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

  function finalizeUserSession(profile, workspaceOverview = null) {
    const cleanEmail = (profile.email || '').trim().toLowerCase()
    const resolvedName = (profile.fullName || '').trim() || formatNameFromEmail(cleanEmail)
    const userObj = {
      id: profile.id || workspaceOverview?.user?.id || '',
      fullName: resolvedName,
      firstName: resolvedName.split(' ')[0],
      email: cleanEmail,
      picture: profile.picture || null,
      primaryEmailAddress: { emailAddress: cleanEmail },
      provider: profile.provider || 'email',
      authenticated: true,
      verifiedEdu: cleanEmail.endsWith('.edu'),
      themeMode:
        profile.themeMode === 'light' ||
        profile.themeMode === 'dark' ||
        profile.themeMode === 'system'
          ? profile.themeMode
          : undefined,
      avatarBg: profile.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
    }
    if (onLocalSignIn) onLocalSignIn(userObj, workspaceOverview)
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
            const synced = await syncExternalWorkspaceSession({
              provider: 'google',
              googleAccessToken: tokenResponse.access_token,
              email: data.email,
              fullName: data.name || formatNameFromEmail(data.email),
              avatarBg: 'linear-gradient(135deg, #4285F4, #34A853)',
            })
            setGoogleLoading(false)
            setGoogleConfigPromptOpen(false)
            finalizeUserSession(
              {
                id: synced?.user?.id || '',
                fullName: synced?.user?.fullName || data.name || formatNameFromEmail(data.email),
                email: data.email,
                picture: data.picture || null,
                provider: 'google',
                avatarBg: 'linear-gradient(135deg, #4285F4, #34A853)',
              },
              synced?.ok ? synced : null
            )
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
          'Authentication service is still initializing. Please wait a moment and click Continue with Google again.'
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
          if (import.meta.env.DEV) {
            setGoogleConfigPromptOpen(true)
          } else {
            setError(
              'Google Sign-In is not currently enabled. Please continue with your email address below or click Preview Demo.'
            )
          }
          return
        }

        setError(rawMsg || 'Unable to start Google Sign-In.')
        return
      }
    }

    setGoogleLoading(false)
    if (import.meta.env.DEV) {
      setGoogleConfigPromptOpen(true)
    } else {
      setError(
        'Google Sign-In is not currently configured. Please continue with your email address below or click Preview Demo.'
      )
    }
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

    // Case B: Genuine Clerk Publishable Key (pk_test_... or pk_live_...) with Google SSO enabled
    if (isValidClerkPublishableKey(trimmed)) {
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
      'Enter either a valid Google Client ID (*.apps.googleusercontent.com) or a valid Clerk Publishable Key (pk_test_... / pk_live_...).'
    )
  }

  async function ensureSupabaseSessionForCredentials(targetEmail, targetPassword) {
    if (!isSupabaseConfigured() || !targetEmail || !targetPassword || targetPassword.length < 6) {
      return
    }
    try {
      await signInOrSignUpWithSupabase({
        email: targetEmail,
        password: targetPassword,
        fullName: formatNameFromEmail(targetEmail),
      })
    } catch {
      // Best-effort native Supabase Auth bridge alongside Clerk
    }
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
          await ensureSupabaseSessionForCredentials(email.trim().toLowerCase(), password)
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
          await ensureSupabaseSessionForCredentials(email.trim().toLowerCase(), password)
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
            await ensureSupabaseSessionForCredentials(cleanEmail, password)
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

      if (notFoundInClerk && clerk.client.signUp) {
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
            await ensureSupabaseSessionForCredentials(cleanEmail, password)
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
        } catch {
          // Fall through to Supabase / Workspace cloud auth
        }
      }
    }

    // 2. Cloud Supabase Auth / Backend Multi-User Session (zero localStorage credentials)
    try {
      const authRes = await authenticateWorkspaceEmail({
        email: cleanEmail,
        password,
        fullName: formatNameFromEmail(cleanEmail),
        avatarBg: 'linear-gradient(135deg, var(--blue), var(--purple))',
        mode: 'auto',
      })

      if (!authRes?.ok) {
        setSubmitting(false)
        setError(authRes?.error || 'Unable to sign in. Please verify your email and password.')
        return
      }

      setSubmitting(false)
      finalizeUserSession(
        {
          id: authRes.user?.id || '',
          email: authRes.user?.email || cleanEmail,
          fullName: authRes.user?.fullName || formatNameFromEmail(cleanEmail),
          avatarBg:
            authRes.user?.avatarBg || 'linear-gradient(135deg, var(--blue), var(--purple))',
        },
        authRes
      )
    } catch (err) {
      setSubmitting(false)
      setError(err?.message || 'Unable to reach authentication service.')
    }
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[var(--bg)] text-[var(--text)] transition-colors duration-300 overflow-hidden">
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

      {/* ── Main Content Stage ── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-12 py-4 sm:py-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-7 lg:gap-9 items-center">
          {/* ── Left Column: Low-Opacity Backdrop & Plain Description ── */}
          <div className="lg:col-span-6 fade-in">
            <div
              className="rounded-[24px] bg-[var(--bg-card)]/45 backdrop-blur-md
                border border-[var(--border)]/55
                p-5 sm:p-7 text-center lg:text-left space-y-3.5 sm:space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--blue-light)]/80 text-[var(--blue-ink)] border border-[var(--blue)]/25">
                <GraduationCap size={14} />
                <span>UC Santa Cruz</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-[36px] font-extrabold tracking-tight text-[var(--text)] leading-[1.16] text-balance">
                See what&apos;s happening{' '}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      'linear-gradient(135deg, var(--blue) 0%, var(--purple) 52%, var(--teal) 100%)',
                  }}
                >
                  across every campus club.
                </span>
              </h1>

              <p className="text-[13.5px] sm:text-[14.5px] text-[var(--text-muted)] leading-relaxed max-w-lg mx-auto lg:mx-0">
                Explore student organizations, follow announcements from Discord and Instagram, and
                coordinate event RSVPs and group availability.
              </p>

              {/* Compact 2x2 Feature Highlights */}
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5 pt-1 text-left">
                {[
                  { title: 'Club Directory', color: 'blue', Icon: Users },
                  { title: 'Discord & IG Feed', color: 'purple', Icon: Megaphone },
                  { title: 'Events & RSVPs', color: 'teal', Icon: Calendar },
                  { title: 'Group Availability', color: 'green', Icon: Clock },
                ].map(({ title, color, Icon }) => (
                  <div
                    key={title}
                    style={{
                      borderLeftWidth: '3px',
                      borderLeftColor: `var(--${color})`,
                    }}
                    className="rounded-xl px-2.5 py-2 sm:px-3 sm:py-2.5 bg-[var(--bg-tile)]/45 border border-[var(--border)]/60 flex items-center gap-2 sm:gap-2.5"
                  >
                    <IconBadge color={color} size={28} radius={8}>
                      <Icon size={14} />
                    </IconBadge>
                    <span className="text-[11.5px] sm:text-xs font-semibold text-[var(--text)] leading-tight">
                      {title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right Column: Clean Login Card (Google OAuth Above Normal Login Fields) ── */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end w-full fade-in">
            <div
              className="w-full max-w-[410px] rounded-[24px] bg-[var(--bg-tile)]/90 backdrop-blur-xl
                border border-[var(--border-tile)] shadow-[var(--shadow-lg)] p-5 sm:p-7 space-y-5"
            >
              {/* Card Header */}
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text)]">
                  {verificationStep ? 'Verify your email' : 'Welcome to ClubHub'}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {verificationStep
                    ? `Enter the code sent to ${email}`
                    : 'Sign in or create an account'}
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
                      shadow-[0_4px_14px_color-mix(in_srgb,var(--blue)_32%,transparent)] flex items-center justify-center gap-1.5
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
                  {error && (
                    <div className="flex items-start justify-between gap-2.5 text-xs text-[var(--red-ink)] bg-[var(--red-light)] px-3.5 py-2.5 rounded-xl border border-[var(--red)]/25 fade-in">
                      <div className="flex items-start gap-2 min-w-0">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{error}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setError('')}
                        aria-label="Dismiss error"
                        className="bg-transparent border-none text-[var(--red-ink)] opacity-75 hover:opacity-100 cursor-pointer p-0.5 shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

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

                    {/* Clerk Smart Bot Protection Mount Point */}
                    <div id="clerk-captcha" />

                    <button
                      type="submit"
                      disabled={submitting || googleLoading}
                      className="w-full min-h-[46px] py-2.5 rounded-xl bg-[var(--blue)] hover:opacity-95 text-white text-sm font-semibold
                        shadow-[0_4px_14px_color-mix(in_srgb,var(--blue)_32%,transparent)] flex items-center justify-center gap-1.5
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

              {/* Card Footer: Support Email & Issue Form Button */}
              <div className="pt-3 border-t border-[var(--border)] text-center text-xs text-[var(--text-muted)] space-y-2">
                <p className="text-[12px] text-[var(--text-light)]">
                  Need help? Contact{' '}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-medium text-[var(--blue-ink)] hover:underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                </p>

                <div>
                  <a
                    href={SUPPORT_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold
                      bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] border border-[var(--border)]
                      hover:border-[var(--blue)] text-[var(--text)] transition-colors shadow-2xs no-underline"
                  >
                    <span>Submit Issue Form</span>
                    <ExternalLink size={12} className="text-[var(--text-muted)]" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
