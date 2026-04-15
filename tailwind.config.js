export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas:  '#09090b',
        surface: '#111116',
        raised:  '#18181f',
        overlay: '#1f1f28',
        accent: {
          DEFAULT: '#14b8a6',
          dim:    'rgba(20,184,166,0.12)',
          border: 'rgba(20,184,166,0.22)',
        },
      },
      animation: {
        'fade-up':   'fadeUp 400ms cubic-bezier(0.16,1,0.3,1) both',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.4', transform: 'scale(0.8)' },
        },
      },
    },
  },
  plugins: [],
}
