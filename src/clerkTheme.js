import { dark as clerkDarkTheme } from '@clerk/themes'

/**
 * Custom styling for Clerk components matching Google Material Design 3 Light & Dark tokens.
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
      colorPrimary: isDark ? '#A8C7FA' : '#0B57D0',
      colorTextOnPrimaryBackground: isDark ? '#062E6F' : '#FFFFFF',
      colorText: isDark ? '#E3E3E3' : '#1F1F1F',
      colorTextSecondary: isDark ? '#C4C7C5' : '#444746',
      colorBackground: isDark ? '#1E1F20' : '#FFFFFF',
      colorInputBackground: isDark ? '#282A2C' : '#FFFFFF',
      colorInputText: isDark ? '#E3E3E3' : '#1F1F1F',
      borderRadius: '28px',
      fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    elements: {
      rootBox: {
        width: '100%',
        maxWidth: '440px',
      },
      card: {
        backgroundColor: isDark ? '#1E1F20' : '#FFFFFF',
        border: `1px solid ${isDark ? '#444746' : '#E1E3E1'}`,
        borderRadius: '28px',
        boxShadow: 'none',
        padding: '2.25rem 2rem',
      },
      headerTitle: {
        fontFamily: "'Google Sans', 'Outfit', 'Roboto', sans-serif",
        fontSize: '24px',
        fontWeight: '400',
        color: isDark ? '#E3E3E3' : '#1F1F1F',
        letterSpacing: '0',
      },
      headerSubtitle: {
        fontSize: '14px',
        color: isDark ? '#C4C7C5' : '#444746',
        marginTop: '4px',
      },
      formFieldLabel: {
        fontSize: '12px',
        fontWeight: '500',
        color: isDark ? '#C4C7C5' : '#444746',
        marginBottom: '6px',
      },
      formFieldInput: {
        borderRadius: '8px',
        backgroundColor: isDark ? '#1E1F20' : '#FFFFFF',
        border: `1px solid ${isDark ? '#8E918F' : '#747775'}`,
        color: isDark ? '#E3E3E3' : '#1F1F1F',
        fontSize: '14px',
        padding: '0.7rem 0.9rem',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        '&:focus': {
          borderColor: isDark ? '#A8C7FA' : '#0B57D0',
          boxShadow: `0 0 0 1px ${isDark ? '#A8C7FA' : '#0B57D0'}`,
        },
      },
      otpCodeFieldInput: {
        borderRadius: '8px',
        backgroundColor: isDark ? '#1E1F20' : '#FFFFFF',
        border: `1px solid ${isDark ? '#8E918F' : '#747775'}`,
        color: isDark ? '#E3E3E3' : '#1F1F1F',
        fontSize: '20px',
        fontWeight: '500',
        height: '52px',
        '&:focus': {
          borderColor: isDark ? '#A8C7FA' : '#0B57D0',
          boxShadow: `0 0 0 1px ${isDark ? '#A8C7FA' : '#0B57D0'}`,
        },
      },
      formButtonPrimary: {
        backgroundColor: isDark ? '#A8C7FA' : '#0B57D0',
        color: isDark ? '#062E6F' : '#FFFFFF',
        borderRadius: '9999px',
        fontSize: '14px',
        fontWeight: '500',
        height: '40px',
        textTransform: 'none',
        boxShadow: 'none',
        transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
        '&:hover': {
          backgroundColor: isDark ? '#BDD6FC' : '#0842A0',
          boxShadow: isDark
            ? '0 1px 2px rgba(0, 0, 0, 0.4)'
            : '0 1px 2px rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)',
        },
      },
      footerActionLink: {
        color: isDark ? '#A8C7FA' : '#0B57D0',
        fontWeight: '500',
        '&:hover': {
          textDecoration: 'underline',
        },
      },
      footerActionText: {
        color: isDark ? '#C4C7C5' : '#444746',
        fontSize: '13px',
      },
      formResendCodeLink: {
        color: isDark ? '#A8C7FA' : '#0B57D0',
        fontWeight: '500',
      },
      identityPreview: {
        backgroundColor: isDark ? '#282A2C' : '#F0F4F9',
        border: `1px solid ${isDark ? '#444746' : '#E1E3E1'}`,
        borderRadius: '9999px',
      },
      identityPreviewText: {
        color: isDark ? '#E3E3E3' : '#1F1F1F',
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
      colorPrimary: isDark ? '#A8C7FA' : '#0B57D0',
      colorTextOnPrimaryBackground: isDark ? '#062E6F' : '#FFFFFF',
      colorText: isDark ? '#E3E3E3' : '#1F1F1F',
      colorBackground: isDark ? '#282A2C' : '#F0F4F9',
      fontFamily: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    elements: {
      userButtonAvatarBox: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
      },
      userButtonTrigger: {
        '&:focus': {
          boxShadow: `0 0 0 2px ${isDark ? '#A8C7FA' : '#0B57D0'}`,
        },
      },
      userButtonPopoverCard: {
        backgroundColor: isDark ? '#282A2C' : '#F0F4F9',
        border: `1px solid ${isDark ? '#444746' : '#E1E3E1'}`,
        borderRadius: '24px',
        boxShadow: isDark
          ? '0 6px 16px 4px rgba(0, 0, 0, 0.5)'
          : '0 4px 8px 3px rgba(60, 64, 67, 0.15), 0 1px 3px rgba(60, 64, 67, 0.3)',
      },
    },
  }
}
