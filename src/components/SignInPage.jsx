import { useState, useEffect, useRef } from 'react'
import { useClerk } from '@clerk/react'
import {
  Moon,
  Sun,
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
import { ClubHubLogo, Button, IconButton } from './ui'
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

// Support & Help links
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
      loadGoogleGsiScript().catch(() => {})
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
      avatarBg: profile.avatarBg || '#1A73E8',
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
              avatarBg: '#1A73E8',
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
                avatarBg: '#1A73E8',
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

    const directClientId = getEffectiveGoogleClientId()
    if (directClientId) {
      await launchDirectGoogleOAuth(directClientId)
      return
    }

    setGoogleLoading(true)

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

        if (
          errCode === 'form_param_value_invalid' ||
          rawMsg.includes('oauth_google') ||
          rawMsg.includes('allowed values for parameter strategy')
        ) {
          if (import.meta.env.DEV) {
            setGoogleConfigPromptOpen(true)
          } else {
            setError(
              'Google Sign-In is not currently enabled. Please continue with your email address below or click Preview demo.'
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
        'Google Sign-In is not currently configured. Please continue with your email address below or click Preview demo.'
      )
    }
  }

  async function handleSaveOAuthKeyAndConnect(e) {
    e.preventDefault()
    setOauthConfigError('')
    const trimmed = oauthKeyInput.trim()

    if (!trimmed) {
      setGoogleConfigPromptOpen(false)
      handleGoogleLoginClick()
      return
    }

    if (trimmed.includes('.apps.googleusercontent.com')) {
      try {
        localStorage.setItem(STORED_GOOGLE_CLIENT_ID_KEY, trimmed)
      } catch {
        // Ignore storage errors
      }
      await launchDirectGoogleOAuth(trimmed)
      return
    }

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

    try {
      const authRes = await authenticateWorkspaceEmail({
        email: cleanEmail,
        password,
        fullName: formatNameFromEmail(cleanEmail),
        avatarBg: '#1A73E8',
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
          avatarBg: authRes.user?.avatarBg || '#1A73E8',
        },
        authRes
      )
    } catch (err) {
      setSubmitting(false)
      setError(err?.message || 'Unable to reach authentication service.')
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[var(--md-surface-container)] dark:bg-[var(--bg)] text-[var(--text)] px-4 sm:px-6 py-8 transition-colors duration-200">
      {hasPublishableKey && (
        <ClerkAuthBridge bridgeRef={clerkBridgeRef} onReady={handleClerkReady} />
      )}

      <div className="w-full max-w-[960px] flex flex-col gap-3.5 fade-in">
        {/* ── Google Account Sign-In Card (28px M3 Dialog Surface) ── */}
        <main className="w-full rounded-[28px] bg-[var(--bg-card)] border border-[var(--border)] p-6 sm:p-10 lg:p-11 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* ── Left Column: Brand Mark, Display Heading & Campus Context ── */}
          <div className="lg:col-span-6 flex flex-col items-start">
            <ClubHubLogo size={44} />

            <h1 className="font-display text-[28px] sm:text-[36px] font-normal tracking-tight text-[var(--text)] leading-[1.2] mt-5">
              {verificationStep ? 'Verify your email' : 'Sign in'}
            </h1>

            <p className="text-base text-[var(--text)] mt-2">
              {verificationStep
                ? `Enter the 6-digit code sent to ${email}`
                : 'to continue to ClubHub'}
            </p>

            <p className="text-sm text-[var(--text-muted)] leading-relaxed mt-4 max-w-md">
              Explore UC Santa Cruz student organizations, follow announcements from Discord and
              Instagram, RSVP to campus events, and coordinate group availability.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[var(--secondary-container)] text-[var(--on-secondary-container)] text-xs font-medium">
                <GraduationCap size={14} />
                <span>UC Santa Cruz</span>
              </span>
              {[
                { title: 'Club Directory', Icon: Users },
                { title: 'Social Feed', Icon: Megaphone },
                { title: 'Events & RSVPs', Icon: Calendar },
                { title: 'Group Availability', Icon: Clock },
              ].map(({ title, Icon }) => (
                <span
                  key={title}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] text-xs font-medium"
                >
                  <Icon size={13} className="text-[var(--blue)]" />
                  <span>{title}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── Right Column: Google OAuth + Unified Email/Password Form ── */}
          <div className="lg:col-span-6 w-full lg:pt-2 space-y-5">
            {verificationStep ? (
              <form onSubmit={handleVerifyCodeSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="clubhub-verify-code"
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                  >
                    Verification code
                  </label>
                  <div className="flex items-center gap-2.5 px-3.5 h-12 rounded-lg bg-transparent border border-[var(--md-outline)] focus-within:border-[var(--blue)] focus-within:ring-1 focus-within:ring-[var(--blue)] transition-colors">
                    <KeyRound size={16} className="text-[var(--text-muted)] shrink-0" />
                    <input
                      id="clubhub-verify-code"
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
                  <div className="flex items-center gap-2.5 text-xs text-[var(--red-ink)] bg-[var(--red-light)] px-3.5 py-2.5 rounded-lg">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-4">
                  <Button
                    variant="text"
                    onClick={() => {
                      setVerificationStep(null)
                      setVerificationCode('')
                      setError('')
                    }}
                  >
                    Back
                  </Button>

                  <Button type="submit" variant="filled" disabled={submitting}>
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      'Verify & continue'
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {error && (
                  <div className="flex items-start justify-between gap-2.5 text-xs text-[var(--red-ink)] bg-[var(--red-light)] px-3.5 py-2.5 rounded-lg fade-in">
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{error}</span>
                    </div>
                    <IconButton
                      size="sm"
                      ariaLabel="Dismiss error"
                      onClick={() => setError('')}
                      className="-my-1 -mr-1.5 text-[var(--red-ink)]"
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                )}

                {/* 1. Google Identity Services / Clerk OAuth Button */}
                <button
                  type="button"
                  onClick={handleGoogleLoginClick}
                  disabled={googleLoading || submitting}
                  className="md-state-layer w-full h-11 px-5 rounded-full bg-[var(--bg-card)] border border-[var(--md-outline)] hover:border-[var(--text-muted)] text-sm font-medium text-[var(--text)] flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
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

                {/* Dev-only OAuth configuration prompt */}
                {googleConfigPromptOpen && (
                  <form
                    onSubmit={handleSaveOAuthKeyAndConnect}
                    className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] space-y-3 text-xs fade-in"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-[var(--text)]">
                        Enable Google OAuth on Clerk or paste a Client ID
                      </div>
                      <IconButton
                        size="sm"
                        ariaLabel="Dismiss"
                        onClick={() => {
                          setGoogleConfigPromptOpen(false)
                          setOauthConfigError('')
                        }}
                        className="-mt-1 -mr-1.5"
                      >
                        <X size={14} />
                      </IconButton>
                    </div>

                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      Enable <strong>Google</strong> under{' '}
                      <a
                        href="https://dashboard.clerk.com"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[var(--blue)] font-medium hover:underline"
                      >
                        Clerk Dashboard &rarr; SSO Connections <ExternalLink size={11} />
                      </a>
                      , or paste a <code className="text-[11px]">*.apps.googleusercontent.com</code>{' '}
                      Client ID or <code className="text-[11px]">pk_test_...</code> key:
                    </p>

                    <input
                      type="text"
                      value={oauthKeyInput}
                      onChange={e => setOauthKeyInput(e.target.value)}
                      placeholder="...apps.googleusercontent.com or pk_test_..."
                      className="w-full h-10 px-3.5 rounded-lg bg-[var(--bg-card)] border border-[var(--md-outline)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)]"
                    />

                    {oauthConfigError && (
                      <div className="text-xs text-[var(--red-ink)]">{oauthConfigError}</div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <Button type="submit" variant="filled" size="sm">
                        {oauthKeyInput.trim() ? 'Save & launch Google' : 'Retry Google sign-in'}
                      </Button>
                    </div>
                  </form>
                )}

                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <div className="flex-1 h-px bg-[var(--border)]" />
                  <span>or continue with email</span>
                  <div className="flex-1 h-px bg-[var(--border)]" />
                </div>

                {/* 2. Unified Email & Password Fields */}
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="clubhub-email"
                      className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                    >
                      Email address
                    </label>
                    <div className="flex items-center gap-2.5 px-3.5 h-12 rounded-lg bg-transparent border border-[var(--md-outline)] focus-within:border-[var(--blue)] focus-within:ring-1 focus-within:ring-[var(--blue)] transition-colors">
                      <Mail size={16} className="text-[var(--text-muted)] shrink-0" />
                      <input
                        id="clubhub-email"
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
                    <label
                      htmlFor="clubhub-password"
                      className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
                    >
                      Password
                    </label>
                    <div className="flex items-center gap-2.5 pl-3.5 pr-1.5 h-12 rounded-lg bg-transparent border border-[var(--md-outline)] focus-within:border-[var(--blue)] focus-within:ring-1 focus-within:ring-[var(--blue)] transition-colors">
                      <Lock size={16} className="text-[var(--text-muted)] shrink-0" />
                      <input
                        id="clubhub-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter or create a password"
                        autoComplete="current-password"
                        className="w-full bg-transparent border-none outline-none text-base sm:text-sm text-[var(--text)] placeholder:text-[var(--text-light)]"
                      />
                      <IconButton
                        size="sm"
                        ariaLabel={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword(prev => !prev)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </IconButton>
                    </div>
                  </div>

                  {/* Clerk Smart Bot Protection Mount Point */}
                  <div id="clerk-captcha" />

                  <div className="flex items-center justify-between gap-3 pt-2">
                    {onEnterDemo ? (
                      <Button
                        variant="text"
                        onClick={onEnterDemo}
                        icon={<Play size={14} fill="currentColor" />}
                      >
                        Preview demo
                      </Button>
                    ) : (
                      <span />
                    )}

                    <Button
                      type="submit"
                      variant="filled"
                      disabled={submitting || googleLoading}
                    >
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Continue'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </main>

        {/* ── Below-Card Google Account Footer Row ── */}
        <footer className="flex flex-wrap items-center justify-between gap-3 px-2 sm:px-4 text-xs text-[var(--text-muted)]">
          <button
            type="button"
            onClick={onToggleDark}
            aria-label="Toggle color theme"
            className="md-state-layer inline-flex items-center gap-2 px-3 h-8 rounded-lg bg-transparent border-none text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer transition-colors"
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
            <span>{dark ? 'Light theme' : 'Dark theme'}</span>
          </button>

          <div className="flex items-center gap-5">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] no-underline hover:underline"
            >
              Help ({SUPPORT_EMAIL})
            </a>
            <a
              href={SUPPORT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] no-underline hover:underline"
            >
              <span>Submit issue</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}
