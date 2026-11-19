import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App'
import {
  resolveValidClerkPublishableKey,
  STORED_CLERK_KEY,
} from './utils/authValidation'

class ClerkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { clerkFailed: false }
  }

  static getDerivedStateFromError() {
    return { clerkFailed: true }
  }

  componentDidCatch(error) {
    console.warn('[ClubHub] Clerk initialization error — falling back to standalone auth:', error?.message || error)
    try {
      localStorage.removeItem(STORED_CLERK_KEY)
    } catch {
      // Ignore storage errors
    }
  }

  render() {
    if (this.state.clerkFailed) {
      return <App hasClerkKey={false} />
    }
    return this.props.children
  }
}

const PUBLISHABLE_KEY = resolveValidClerkPublishableKey()

const AFTER_SIGN_OUT_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}`
    : './'

function navigateFromClerk(destination, replace = false) {
  const url = new URL(destination, window.location.href)
  const callbackCompletion = url.origin === window.location.origin &&
    (url.searchParams.has('sso-complete') || url.searchParams.has('sso-continue'))
  if (replace || callbackCompletion) window.location.replace(url.href)
  else window.location.assign(url.href)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkErrorBoundary>
        <ClerkProvider
          publishableKey={PUBLISHABLE_KEY}
          afterSignOutUrl={AFTER_SIGN_OUT_URL}
          routerPush={url => navigateFromClerk(url)}
          routerReplace={url => navigateFromClerk(url, true)}
          unsafe_disableDevelopmentModeConsoleWarning={true}
          appearance={{
            layout: {
              unsafe_disableDevelopmentModeWarnings: true,
            },
          }}
        >
          <App hasClerkKey={true} />
        </ClerkProvider>
      </ClerkErrorBoundary>
    ) : (
      <App hasClerkKey={false} />
    )}
  </StrictMode>,
)
