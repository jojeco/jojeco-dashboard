/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // shadcn/ui CSS variable tokens (legacy — kept for existing pages)
        border:      'hsl(var(--border))',
        input:       'hsl(var(--input))',
        ring:        'hsl(var(--ring))',
        background:  'hsl(var(--background))',
        foreground:  'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // ── v4 Design System tokens (DESIGN.md §2) ──────────────────────────
        void:    '#0d1117',
        console: '#161b22',
        raised:  '#1c2128',
        well:    '#10141a',
        signal:  '#e6edf3',
        readout: '#8b949e',
        trace:   '#6e7681',
        amber:   '#58a6ff',
        nominal:  '#3fb950',
        degraded: '#d29922',
        fault:    '#f85149',
        standby:  '#6e7681',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'fade-up':        'fadeUp 400ms cubic-bezier(0.16,1,0.3,1) both',
        'pulse-dot':      'pulseDot 2s ease-in-out infinite',
        'shimmer':        'shimmer 1.4s linear infinite',
        // v4 animations
        'live-breathe':   'liveBreathe 2s ease-in-out infinite',
        'settle':         'settle 150ms ease-out both',
        'stagger-in':     'staggerIn 300ms cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.4', transform: 'scale(0.8)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to:   { backgroundPosition: '200% center' },
        },
        // v4 keyframes
        liveBreathe: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        settle: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        staggerIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      gridTemplateColumns: {
        'command': '8fr 4fr',
      },
      maxWidth: {
        'command': '1600px',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
