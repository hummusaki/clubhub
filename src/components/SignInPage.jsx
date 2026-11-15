import { useState } from 'react'
import { SignIn } from '@clerk/react'
import { Moon, Sun, ShieldCheck, Key, ArrowRight, Play, GraduationCap } from 'lucide-react'
import { getClerkAppearance } from '../clerkTheme'
import { ClubHubLogo, IconBadge } from './ui'
import { StatIcon } from './icons'

export default function SignInPage({ dark, onToggleDark, hasPublishableKey, onEnterDemo }) {
  const [copied, setCopied] = useState(false)

  const copySnippet = () => {
    navigator.clipboard?.writeText('VITE_CLERK_PUBLISHABLE_KEY=pk_test_...')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-[var(--bg)] text-[var(--text)] transition-colors duration-300">
      {/* ── Top Bar ── */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-[var(--border)] bg-[var(--bg-surface)]">
        <div className="flex items-center gap-3">
          <ClubHubLogo size={38} />
          <div>
            <div className="font-bold text-lg leading-tight tracking-tight text-[var(--text)]">
              ClubHub
            </div>
            <div className="text-xs text-[var(--text-muted)]">Campus Organization Platform</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onEnterDemo && (
            <button
              onClick={onEnterDemo}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold
                bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text)]
                hover:border-[var(--blue)] hover:text-[var(--blue)] transition-colors shadow-sm cursor-pointer"
            >
              <Play size={12} fill="currentColor" />
              <span>Preview Demo</span>
            </button>
          )}

          <button
            onClick={onToggleDark}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full border border-[var(--border)]
              bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)]
              text-xs font-medium transition-colors shadow-sm cursor-pointer"
            title="Toggle theme"
          >
            {dark ? <Sun size={15} className="text-[var(--yellow)]" /> : <Moon size={15} />}
            <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* ── Main Content Hero ── */}
      <main className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Hero Column: Brand intro & Highlights */}
          <div className="lg:col-span-6 space-y-6 fade-in">
            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold
              bg-[var(--blue-light)] text-[var(--blue-ink)]"
            >
              <GraduationCap size={15} />
              <span>Verified Student Community</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] leading-[1.15]">
              Connect with clubs. <br />
              <span className="text-[var(--blue)]">RSVP for events.</span>
            </h1>

            <p className="text-base text-[var(--text-muted)] leading-relaxed max-w-lg">
              Sign in with your university email to join student clubs, receive campus announcements, and keep track of club meetings.
            </p>

            {/* Bubble feature highlights */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-4 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow)] flex items-center gap-3">
                <IconBadge color="blue" size={38} radius={11}>
                  <StatIcon name="Users" size={20} />
                </IconBadge>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">Active Clubs</div>
                  <div className="text-xs text-[var(--text-muted)]">From Tech to Arts</div>
                </div>
              </div>

              <div className="p-4 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow)] flex items-center gap-3">
                <IconBadge color="green" size={38} radius={11}>
                  <StatIcon name="Heart" size={20} />
                </IconBadge>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">Verified Access</div>
                  <div className="text-xs text-[var(--text-muted)]">Students &amp; faculty</div>
                </div>
              </div>

              <div className="p-4 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow)] flex items-center gap-3">
                <IconBadge color="yellow" size={38} radius={11}>
                  <StatIcon name="Calendar" size={20} />
                </IconBadge>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">Calendar Sync</div>
                  <div className="text-xs text-[var(--text-muted)]">Never miss meetings</div>
                </div>
              </div>

              <div className="p-4 rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow)] flex items-center gap-3">
                <IconBadge color="purple" size={38} radius={11}>
                  <StatIcon name="Link" size={20} />
                </IconBadge>
                <div>
                  <div className="text-sm font-semibold text-[var(--text)]">Multi-Channel</div>
                  <div className="text-xs text-[var(--text-muted)]">Discord &amp; Instagram</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] pt-1">
              <ShieldCheck size={16} className="text-[var(--green)]" />
              <span>Direct verification via your university inbox</span>
            </div>
          </div>

          {/* Right Column: Clerk Auth Card */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center fade-in">
            {hasPublishableKey ? (
              <div className="w-full flex justify-center">
                <SignIn routing="hash" appearance={getClerkAppearance(dark)} />
              </div>
            ) : (
              <div
                className="w-full max-w-[430px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[24px]
                p-8 shadow-[var(--shadow-md)] text-center space-y-5"
              >
                <div className="w-12 h-12 rounded-full bg-[var(--blue-light)] text-[var(--blue-ink)] flex items-center justify-center mx-auto">
                  <Key size={24} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-[var(--text)]">Connect Clerk App</h2>
                  <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                    Add your Clerk Publishable Key in{' '}
                    <code className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                      .env
                    </code>{' '}
                    to activate live authentication.
                  </p>
                </div>

                <div
                  onClick={copySnippet}
                  className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-left
                    text-xs font-mono space-y-1 cursor-pointer hover:border-[var(--blue)] transition-colors group"
                >
                  <div className="text-[var(--text-muted)] text-[11px] flex justify-between items-center">
                    <span># In your .env file:</span>
                    <span className="text-[var(--blue-ink)] font-sans text-[10px]">
                      {copied ? 'Copied!' : 'Click to copy'}
                    </span>
                  </div>
                  <div className="text-[var(--blue-ink)] break-all font-semibold">
                    VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
                  </div>
                </div>

                {onEnterDemo && (
                  <button
                    onClick={onEnterDemo}
                    className="w-full py-2.5 rounded-full bg-[var(--blue)] text-white text-xs font-semibold
                      shadow-[0_2px_8px_rgba(123,170,247,0.35)] flex items-center justify-center gap-1.5
                      hover:bg-[#689bf0] transition-colors cursor-pointer border-none"
                  >
                    Explore Dashboard in Demo Mode <ArrowRight size={14} />
                  </button>
                )}

                <div className="pt-2 text-[11px] text-[var(--text-muted)] border-t border-[var(--border)]">
                  Once your key is added, students will sign in directly with their university email and receive a secure one-time verification code.
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
