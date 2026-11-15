import { dark as clerkDarkTheme } from '@clerk/themes'

/**
 * Custom styling for Clerk components matching ClubHub's Midnight Slate & Porcelain palette.
 */
export function getClerkAppearance(isDark = false) {
  return {
    baseTheme: isDark ? clerkDarkTheme : undefined,
    layout: {
      socialButtonsPlacement: 'top',
      socialButtonsVariant: 'blockButton',
      logoPlacement: 'none',
      showOptionalFields: false,
    },
    variables: {
      colorPrimary: isDark ? '#60A5FA' : '#3B82F6',
      colorText: isDark ? '#EEF2F8' : '#0F172A',
      colorTextSecondary: isDark ? '#94A3B8' : '#475569',
      colorBackground: isDark ? '#151C26' : '#FFFFFF',
      colorInputBackground: isDark ? '#1B2432' : '#F1F5F9',
      colorInputText: isDark ? '#EEF2F8' : '#0F172A',
      borderRadius: '16px',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    elements: {
      rootBox: {
        width: '100%',
        maxWidth: '440px',
      },
      card: {
        backgroundColor: isDark ? '#151C26' : '#FFFFFF',
        border: `1px solid ${isDark ? '#263346' : '#E2E8F0'}`,
        borderRadius: '24px',
        boxShadow: isDark
          ? '0 16px 40px rgba(2, 6, 23, 0.55)'
          : '0 16px 40px rgba(15, 23, 42, 0.08)',
        padding: '2.25rem 2rem',
      },
      headerTitle: {
        fontSize: '24px',
        fontWeight: '700',
        color: isDark ? '#EEF2F8' : '#0F172A',
        letterSpacing: '-0.02em',
      },
      headerSubtitle: {
        fontSize: '13px',
        color: isDark ? '#94A3B8' : '#475569',
        marginTop: '4px',
      },
      formFieldLabel: {
        fontSize: '12px',
        fontWeight: '600',
        color: isDark ? '#EEF2F8' : '#0F172A',
        marginBottom: '5px',
      },
      formFieldInput: {
        borderRadius: '12px',
        backgroundColor: isDark ? '#1B2432' : '#F1F5F9',
        border: `1px solid ${isDark ? '#263346' : '#E2E8F0'}`,
        color: isDark ? '#EEF2F8' : '#0F172A',
        fontSize: '14px',
        padding: '0.7rem 0.9rem',
        transition: 'all 0.2s ease',
        '&:focus': {
          borderColor: '#60A5FA',
          boxShadow: '0 0 0 3px rgba(96, 165, 250, 0.22)',
        },
      },
      otpCodeFieldInput: {
        borderRadius: '12px',
        backgroundColor: isDark ? '#1B2432' : '#F1F5F9',
        border: `1.5px solid ${isDark ? '#263346' : '#E2E8F0'}`,
        color: isDark ? '#EEF2F8' : '#0F172A',
        fontSize: '20px',
        fontWeight: '700',
        height: '52px',
        '&:focus': {
          borderColor: '#60A5FA',
          boxShadow: '0 0 0 3px rgba(96, 165, 250, 0.22)',
        },
      },
      formButtonPrimary: {
        backgroundColor: '#3B82F6',
        borderRadius: '9999px',
        fontSize: '14px',
        fontWeight: '600',
        height: '42px',
        textTransform: 'none',
        boxShadow: '0 3px 10px rgba(59, 130, 246, 0.35)',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: '#2563EB',
          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.45)',
          transform: 'translateY(-1px)',
        },
        '&:active': {
          transform: 'translateY(0)',
        },
      },
      footerActionLink: {
        color: isDark ? '#60A5FA' : '#2563EB',
        fontWeight: '600',
        '&:hover': {
          textDecoration: 'underline',
        },
      },
      footerActionText: {
        color: isDark ? '#94A3B8' : '#475569',
        fontSize: '13px',
      },
      formResendCodeLink: {
        color: isDark ? '#60A5FA' : '#2563EB',
        fontWeight: '600',
      },
      identityPreview: {
        backgroundColor: isDark ? '#1B2432' : '#F1F5F9',
        border: `1px solid ${isDark ? '#263346' : '#E2E8F0'}`,
        borderRadius: '14px',
      },
      identityPreviewText: {
        color: isDark ? '#EEF2F8' : '#0F172A',
      },
    },
  }
}

/**
 * Custom styling for Clerk's UserButton avatar and popover card.
 */
export function getUserButtonAppearance(isDark = false) {
  return {
    baseTheme: isDark ? clerkDarkTheme : undefined,
    variables: {
      colorPrimary: isDark ? '#60A5FA' : '#3B82F6',
      colorText: isDark ? '#EEF2F8' : '#0F172A',
      colorBackground: isDark ? '#151C26' : '#FFFFFF',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    elements: {
      userButtonAvatarBox: {
        width: '34px',
        height: '34px',
        borderRadius: '50%',
      },
      userButtonTrigger: {
        '&:focus': {
          boxShadow: '0 0 0 2px #60A5FA',
        },
      },
      userButtonPopoverCard: {
        backgroundColor: isDark ? '#151C26' : '#FFFFFF',
        border: `1px solid ${isDark ? '#263346' : '#E2E8F0'}`,
        borderRadius: '20px',
        boxShadow: isDark
          ? '0 16px 40px rgba(2, 6, 23, 0.55)'
          : '0 16px 40px rgba(15, 23, 42, 0.12)',
      },
    },
  }
}
