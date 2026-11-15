import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App'

function resolvePublishableKey() {
  const envKey = (
    import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    ''
  ).trim()

  if (envKey.startsWith('pk_')) {
    return envKey
  }

  try {
    const customKey = localStorage.getItem('clubhub_clerk_publishable_key')
    if (customKey && customKey.trim().startsWith('pk_')) {
      return customKey.trim()
    }
  } catch {
    // Ignore storage errors
  }

  return ''
}

const PUBLISHABLE_KEY = resolvePublishableKey()

const AFTER_SIGN_OUT_URL =
  typeof window !== 'undefined' ? window.location.pathname || '/' : '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl={AFTER_SIGN_OUT_URL}>
        <App hasClerkKey={true} />
      </ClerkProvider>
    ) : (
      <App hasClerkKey={false} />
    )}
  </StrictMode>,
)
