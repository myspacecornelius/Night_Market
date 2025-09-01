import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        'body': ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono Variable', 'JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
      colors: {
        // Sophisticated earthy palette inspired by natural textures
        'earth': {
          50: '#faf9f7',   // Warm white, like bleached linen
          100: '#f4f1eb',  // Cream, like aged paper
          200: '#e8e0d1',  // Light sand
          300: '#d7c8b3',  // Warm beige
          400: '#c4ab8c',  // Tan leather
          500: '#a68b5b',  // Rich ochre (primary)
          600: '#8b6914',  // Dark bronze
          700: '#6b4423',  // Coffee brown
          800: '#4a2c0a',  // Dark chocolate
          900: '#2d1b06',  // Almost black, like rich soil
        },
        'sage': {
          50: '#f7f9f7',   // Pale mint
          100: '#ebf3eb',  // Light sage
          200: '#d4e6d4',  // Soft sage
          300: '#a8c8a8',  // Muted sage
          400: '#7ba47b',  // Medium sage
          500: '#5a8659',  // Deep sage (accent)
          600: '#3d5a3d',  // Forest green
          700: '#2d4a2d',  // Dark forest
          800: '#1a2e1a',  // Deep forest
          900: '#0f1a0f',  // Almost black green
        },
        'stone': {
          50: '#fafafa',   // Pure white
          100: '#f5f5f5',  // Light gray
          200: '#e5e5e5',  // Medium light gray
          300: '#d4d4d4',  // Medium gray
          400: '#a3a3a3',  // Dark gray
          500: '#737373',  // Medium dark gray
          600: '#525252',  // Charcoal
          700: '#404040',  // Dark charcoal
          800: '#262626',  // Very dark gray
          900: '#171717',  // Almost black
        },
        // System colors using earth tones
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        popover: "hsl(var(--popover))",
        "popover-foreground": "hsl(var(--popover-foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
      },
      boxShadow: {
        'soft': '0 2px 12px 0 rgb(0 0 0 / 0.05)',
        'medium': '0 4px 24px 0 rgb(0 0 0 / 0.08)',
        'hard': '0 8px 48px 0 rgb(0 0 0 / 0.12)',
        'glow': '0 0 24px 0 rgb(166 139 91 / 0.15)',
        'glow-sage': '0 0 24px 0 rgb(90 134 89 / 0.15)',
        'inner-soft': 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
        'neumorphic': '8px 8px 16px rgb(0 0 0 / 0.1), -8px -8px 16px rgb(255 255 255 / 0.8)',
      },
      borderRadius: {
        'xs': '0.125rem',
        'sm': '0.25rem', 
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        'full': '9999px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        'fade-in-down': 'fadeInDown 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'float': 'float 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'magnetic': 'magnetic 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        'shimmer': 'shimmer 2s linear infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgb(166 139 91 / 0.1)' },
          '50%': { boxShadow: '0 0 40px rgb(166 139 91 / 0.3)' },
        },
        magnetic: {
          '0%': { transform: 'scale(1) rotate(0deg)' },
          '50%': { transform: 'scale(1.05) rotate(1deg)' },
          '100%': { transform: 'scale(1.02) rotate(0deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
      },
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'magnetic': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    }
  },
  plugins: [
    require("tailwindcss-animate"),
    function({ addUtilities }) {
      addUtilities({
        '.glass-morphism': {
          'background': 'rgba(255, 255, 255, 0.05)',
          'backdrop-filter': 'blur(12px)',
          'border': '1px solid rgba(255, 255, 255, 0.1)',
        },
        '.glass-morphism-dark': {
          'background': 'rgba(0, 0, 0, 0.05)',
          'backdrop-filter': 'blur(12px)',
          'border': '1px solid rgba(0, 0, 0, 0.1)',
        },
        '.magnetic-hover': {
          'transition': 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          '&:hover': {
            'transform': 'scale(1.02) translateY(-2px)',
            'box-shadow': '0 8px 32px rgba(166, 139, 91, 0.15)',
          },
        },
        '.text-gradient': {
          'background': 'linear-gradient(135deg, #a68b5b 0%, #5a8659 100%)',
          'background-clip': 'text',
          '-webkit-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
        },
        '.bg-gradient-earth': {
          'background': 'linear-gradient(135deg, #faf9f7 0%, #e8e0d1 50%, #d7c8b3 100%)',
        },
        '.bg-gradient-sage': {
          'background': 'linear-gradient(135deg, #f7f9f7 0%, #ebf3eb 50%, #d4e6d4 100%)',
        },
        '.cursor-magnetic': {
          'cursor': 'none',
        },
      });
    },
  ]
} satisfies Config
