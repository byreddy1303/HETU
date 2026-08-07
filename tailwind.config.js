/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0f19',
          raised: '#111827',
          overlay: '#1e293b'
        },
        border: {
          DEFAULT: '#1e293b',
          hover: '#334155'
        },
        text: {
          DEFAULT: '#f8fafc',
          muted: '#94a3b8',
          faint: '#64748b'
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
          faint: 'rgba(99, 102, 241, 0.15)'
        },
        success: { DEFAULT: '#10b981', faint: 'rgba(16, 185, 129, 0.15)' },
        danger: { DEFAULT: '#f43f5e', faint: 'rgba(244, 63, 94, 0.15)' },
        warn: { DEFAULT: '#f59e0b', faint: 'rgba(245, 158, 11, 0.15)' },
        guess: { DEFAULT: '#a855f7', faint: 'rgba(168, 85, 247, 0.15)' },
        highlight: '#38bdf8',
        ink: {
          cobalt: '#38bdf8',
          teal: '#2dd4bf',
          violet: '#c084fc',
          rose: '#fb7185',
          marigold: '#fbbf24',
          slate: '#94a3b8'
        }
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Azeret Mono"', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        none: '0',
        sm: '6px',
        DEFAULT: '10px',
        lg: '16px',
        full: '9999px'
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 2px 6px -1px rgba(0, 0, 0, 0.3)',
        lift: '0 12px 36px -4px rgba(0, 0, 0, 0.6), 0 4px 12px -2px rgba(0, 0, 0, 0.4)',
        press: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)'
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px'
      },
      transitionDuration: { DEFAULT: '150ms' }
    }
  },
  plugins: []
};
