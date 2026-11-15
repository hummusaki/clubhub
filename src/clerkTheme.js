import { dark as clerkDarkTheme } from '@clerk/themes'

/**
 * Custom styling for Clerk components matching ClubHub's Vivid Midnight & Warm Stone palette.
 */
export function getClerkAppearance(isDark = false) {
  return {
    baseTheme: isDark ? clerkDarkTheme : undefined,
    layout: {
      socialButtonsPlacement: 'top',
      socialButtonsVariant: 'blockButton',
      logoPlacement: 'none',
      showOptionalFields: false,
      unsafe_disableDevelopmentModeWarnings: true,
    },
    variables: {
      colorPrimary: isDark ? '#4482FF' : '#3B6BE0',
      colorText: isDark ? '#F4F7FF' : '#1F242C',
      colorTextSecondary: isDark ? '#9FB1CE' : '#4E5664',
      colorBackground: isDark ? '#172236' : '#EFECE6',
      colorInputBackground: isDark ? '#131D2F' : '#D8D5CB',
      colorInputText: isDark ? '#F4F7FF' : '#1F242C',
      borderRadius: '16px',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    elements: {
      rootBox: {
        width: '100%',
        maxWidth: '440px',
      },
      card: {
        backgroundColor: isDark ? '#172236' : '#EFECE6',
        border: `1px solid ${isDark ? '#304770' : '#C4C0B4'}`,
        borderRadius: '24px',
        boxShadow: isDark
          ? '0 20px 44px rgba(2, 5, 15, 0.7)'
          : '0 16px 38px rgba(28, 31, 38, 0.11)',
        padding: '2.25rem 2rem',
      },
      headerTitle: {
        fontSize: '24px',
        fontWeight: '700',
        color: isDark ? '#F4F7FF' : '#1F242C',
        letterSpacing: '-0.02em',
      },
      headerSubtitle: {
        fontSize: '13px',
        color: isDark ? '#9FB1CE' : '#4E5664',
        marginTop: '4px',
      },
      formFieldLabel: {
        fontSize: '12px',
        fontWeight: '600',
        color: isDark ? '#F4F7FF' : '#1F242C',
        marginBottom: '5px',
      },
      formFieldInput: {
        borderRadius: '12px',
        backgroundColor: isDark ? '#131D2F' : '#D8D5CB',
        border: `1px solid ${isDark ? '#233350' : '#CECBC0'}`,
        color: isDark ? '#F4F7FF' : '#1F242C',
        fontSize: '14px',
        padding: '0.7rem 0.9rem',
        transition: 'all 0.2s ease',
        '&:focus': {
          borderColor: isDark ? '#4482FF' : '#3B6BE0',
          boxShadow: '0 0 0 3px rgba(59, 107, 224, 0.22)',
        },
      },
      otpCodeFieldInput: {
        borderRadius: '12px',
        backgroundColor: isDark ? '#131D2F' : '#D8D5CB',
        border: `1.5px solid ${isDark ? '#233350' : '#CECBC0'}`,
        color: isDark ? '#F4F7FF' : '#1F242C',
        fontSize: '20px',
        fontWeight: '700',
        height: '52px',
        '&:focus': {
          borderColor: isDark ? '#4482FF' : '#3B6BE0',
          boxShadow: '0 0 0 3px rgba(59, 107, 224, 0.22)',
        },
      },
      formButtonPrimary: {
        backgroundColor: isDark ? '#4482FF' : '#3B6BE0',
        borderRadius: '9999px',
        fontSize: '14px',
        fontWeight: '600',
        height: '42px',
        textTransform: 'none',
        boxShadow: '0 3px 12px rgba(59, 107, 224, 0.34)',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: isDark ? '#3574F5' : '#2F5CCA',
          boxShadow: '0 4px 16px rgba(59, 107, 224, 0.44)',
          transform: 'translateY(-1px)',
        },
        '&:active': {
          transform: 'translateY(0)',
        },
      },
      footerActionLink: {
        color: isDark ? '#8AB6FF' : '#2349A6',
        fontWeight: '600',
        '&:hover': {
          textDecoration: 'underline',
        },
      },
      footerActionText: {
        color: isDark ? '#9FB1CE' : '#4E5664',
        fontSize: '13px',
      },
      formResendCodeLink: {
        color: isDark ? '#8AB6FF' : '#2349A6',
        fontWeight: '600',
      },
      identityPreview: {
        backgroundColor: isDark ? '#131D2F' : '#D8D5CB',
        border: `1px solid ${isDark ? '#233350' : '#CECBC0'}`,
        borderRadius: '14px',
      },
      identityPreviewText: {
        color: isDark ? '#F4F7FF' : '#1F242C',
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
    layout: {
      unsafe_disableDevelopmentModeWarnings: true,
    },
    variables: {
      colorPrimary: isDark ? '#4482FF' : '#3B6BE0',
      colorText: isDark ? '#F4F7FF' : '#1F242C',
      colorBackground: isDark ? '#172236' : '#EFECE6',
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
          boxShadow: '0 0 0 2px #4482FF',
        },
      },
      userButtonPopoverCard: {
        backgroundColor: isDark ? '#172236' : '#EFECE6',
        border: `1px solid ${isDark ? '#304770' : '#C4C0B4'}`,
        borderRadius: '20px',
        boxShadow: isDark
          ? '0 18px 42px rgba(2, 5, 15, 0.68)'
          : '0 16px 38px rgba(28, 31, 38, 0.13)',
      },
    },
  }
}
