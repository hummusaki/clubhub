import { dark as clerkDarkTheme } from '@clerk/themes'

/**
 * Custom styling for Clerk components matching ClubHub's Google-Bubble theme.
 * Adapts seamlessly between warm cappuccino dark mode and pastel light mode.
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
      colorPrimary: '#7BAAF7',
      colorText: isDark ? '#EDE8E1' : '#3C3226',
      colorTextSecondary: isDark ? '#A89E92' : '#8A7E72',
      colorBackground: isDark ? '#3E3930' : '#FFFFFF',
      colorInputBackground: isDark ? '#36322A' : '#FAF7F3',
      colorInputText: isDark ? '#EDE8E1' : '#3C3226',
      borderRadius: '16px',
      fontFamily: "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    elements: {
      rootBox: {
        width: '100%',
        maxWidth: '440px',
      },
      card: {
        backgroundColor: isDark ? '#3E3930' : '#FFFFFF',
        border: `1px solid ${isDark ? '#524D44' : '#E8E0D8'}`,
        borderRadius: '24px',
        boxShadow: isDark
          ? '0 16px 40px rgba(0, 0, 0, 0.45)'
          : '0 16px 40px rgba(60, 50, 38, 0.08)',
        padding: '2.25rem 2rem',
      },
      headerTitle: {
        fontSize: '24px',
        fontWeight: '700',
        color: isDark ? '#EDE8E1' : '#3C3226',
        letterSpacing: '-0.02em',
      },
      headerSubtitle: {
        fontSize: '13px',
        color: isDark ? '#A89E92' : '#8A7E72',
        marginTop: '4px',
      },
      formFieldLabel: {
        fontSize: '12px',
        fontWeight: '600',
        color: isDark ? '#EDE8E1' : '#3C3226',
        marginBottom: '5px',
      },
      formFieldInput: {
        borderRadius: '12px',
        backgroundColor: isDark ? '#36322A' : '#FAF7F3',
        border: `1px solid ${isDark ? '#524D44' : '#E8E0D8'}`,
        color: isDark ? '#EDE8E1' : '#3C3226',
        fontSize: '14px',
        padding: '0.7rem 0.9rem',
        transition: 'all 0.2s ease',
        '&:focus': {
          borderColor: '#7BAAF7',
          boxShadow: '0 0 0 3px rgba(123, 170, 247, 0.25)',
        },
      },
      // Styling for 6-digit email OTP verification codes
      otpCodeFieldInput: {
        borderRadius: '12px',
        backgroundColor: isDark ? '#36322A' : '#FAF7F3',
        border: `1.5px solid ${isDark ? '#524D44' : '#E8E0D8'}`,
        color: isDark ? '#EDE8E1' : '#3C3226',
        fontSize: '20px',
        fontWeight: '700',
        height: '52px',
        '&:focus': {
          borderColor: '#7BAAF7',
          boxShadow: '0 0 0 3px rgba(123, 170, 247, 0.25)',
        },
      },
      formButtonPrimary: {
        backgroundColor: '#7BAAF7',
        borderRadius: '9999px',
        fontSize: '14px',
        fontWeight: '600',
        height: '42px',
        textTransform: 'none',
        boxShadow: '0 3px 10px rgba(123, 170, 247, 0.35)',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: '#689bf0',
          boxShadow: '0 4px 14px rgba(123, 170, 247, 0.45)',
          transform: 'translateY(-1px)',
        },
        '&:active': {
          transform: 'translateY(0)',
        },
      },
      footerActionLink: {
        color: '#7BAAF7',
        fontWeight: '600',
        '&:hover': {
          textDecoration: 'underline',
        },
      },
      footerActionText: {
        color: isDark ? '#A89E92' : '#8A7E72',
        fontSize: '13px',
      },
      formResendCodeLink: {
        color: '#7BAAF7',
        fontWeight: '600',
      },
      identityPreview: {
        backgroundColor: isDark ? '#36322A' : '#FAF7F3',
        border: `1px solid ${isDark ? '#524D44' : '#E8E0D8'}`,
        borderRadius: '14px',
      },
      identityPreviewText: {
        color: isDark ? '#EDE8E1' : '#3C3226',
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
      colorPrimary: '#7BAAF7',
      colorText: isDark ? '#EDE8E1' : '#3C3226',
      colorBackground: isDark ? '#3E3930' : '#FFFFFF',
      fontFamily: "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    elements: {
      userButtonAvatarBox: {
        width: '34px',
        height: '34px',
        borderRadius: '50%',
      },
      userButtonTrigger: {
        '&:focus': {
          boxShadow: '0 0 0 2px #7BAAF7',
        },
      },
      userButtonPopoverCard: {
        backgroundColor: isDark ? '#3E3930' : '#FFFFFF',
        border: `1px solid ${isDark ? '#524D44' : '#E8E0D8'}`,
        borderRadius: '20px',
        boxShadow: isDark
          ? '0 16px 40px rgba(0, 0, 0, 0.45)'
          : '0 16px 40px rgba(60, 50, 38, 0.12)',
      },
    },
  }
}

