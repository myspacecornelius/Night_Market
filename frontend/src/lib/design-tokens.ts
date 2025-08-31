/**
 * Dharma Design System - Night Market Modern
 * 
 * Design tokens for consistent theming across the application.
 * Based on the "Underground Premium" aesthetic with hyper-local sneaker culture vibes.
 */

export const designTokens = {
  // Core Brand Colors
  colors: {
    // Primary Palette - Night Market Modern
    ink: '#0B0B0C',      // Deep black for text and dark backgrounds
    bone: '#F6F6F6',     // Off-white for light backgrounds and text
    heat: '#E94A3D',     // Signature red for CTAs and highlights
    olive: '#4E5A3A',    // Muted green for secondary elements
    steel: '#717784',    // Mid-tone gray for supporting text
    neon: '#C3FFD0',     // Accent green for success states and highlights
    
    // Semantic Colors
    success: '#C3FFD0',
    warning: '#F59E0B',
    error: '#E94A3D',
    info: '#3B82F6',
  },
  
  // Typography Scale
  typography: {
    // Font Families
    fontFamily: {
      grotesk: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], // Headlines
      humanist: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'], // Body
    },
    
    // Font Sizes (mobile-first, responsive)
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem' }],
      '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      '5xl': ['3rem', { lineHeight: '1' }],
    },
    
    // Font Weights
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },
  
  // Spacing Scale (8px base unit)
  spacing: {
    px: '1px',
    0: '0',
    0.5: '0.125rem', // 2px
    1: '0.25rem',    // 4px
    1.5: '0.375rem', // 6px
    2: '0.5rem',     // 8px
    2.5: '0.625rem', // 10px
    3: '0.75rem',    // 12px
    3.5: '0.875rem', // 14px
    4: '1rem',       // 16px
    5: '1.25rem',    // 20px
    6: '1.5rem',     // 24px
    7: '1.75rem',    // 28px
    8: '2rem',       // 32px
    9: '2.25rem',    // 36px
    10: '2.5rem',    // 40px
    11: '2.75rem',   // 44px
    12: '3rem',      // 48px
    14: '3.5rem',    // 56px
    16: '4rem',      // 64px
    20: '5rem',      // 80px
    24: '6rem',      // 96px
    28: '7rem',      // 112px
    32: '8rem',      // 128px
  },
  
  // Border Radius
  borderRadius: {
    none: '0',
    sm: '0.125rem',   // 2px
    DEFAULT: '0.25rem', // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    '3xl': '1.5rem',  // 24px
    full: '9999px',
  },
  
  // Shadows
  boxShadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    soft: '0 8px 30px rgba(0,0,0,.06)',
    glass: '0 8px 32px rgba(0,0,0,.08)',
    heat: '0 0 20px rgba(233, 74, 61, 0.3)',
    neon: '0 0 20px rgba(195, 255, 208, 0.4)',
  },
  
  // Animation & Motion
  animation: {
    // Duration (150-220ms for micro-interactions)
    duration: {
      fast: '150ms',
      normal: '220ms',
      slow: '300ms',
    },
    
    // Easing (springy but restrained)
    easing: {
      ease: 'ease',
      linear: 'linear',
      spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },
  
  // Breakpoints (mobile-first)
  screens: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  
  // Z-Index Scale
  zIndex: {
    hide: -1,
    auto: 'auto',
    base: 0,
    docked: 10,
    dropdown: 1000,
    sticky: 1100,
    banner: 1200,
    overlay: 1300,
    modal: 1400,
    popover: 1500,
    skipLink: 1600,
    toast: 1700,
    tooltip: 1800,
  },
} as const;

// Component-specific tokens
export const componentTokens = {
  // Button variants
  button: {
    height: {
      sm: '2rem',      // 32px
      md: '2.5rem',    // 40px
      lg: '3rem',      // 48px
    },
    padding: {
      sm: '0.5rem 0.75rem',
      md: '0.75rem 1rem',
      lg: '1rem 1.5rem',
    },
  },
  
  // Input variants
  input: {
    height: {
      sm: '2rem',
      md: '2.5rem',
      lg: '3rem',
    },
  },
  
  // Card variants
  card: {
    padding: {
      sm: '1rem',
      md: '1.5rem',
      lg: '2rem',
    },
  },
} as const;

// Utility functions for consistent spacing
export const spacing = {
  // Container widths
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
  
  // Common spacing patterns
  section: '5rem', // 80px
  component: '2rem', // 32px
  element: '1rem', // 16px
} as const;

export type DesignTokens = typeof designTokens;
export type ComponentTokens = typeof componentTokens;
