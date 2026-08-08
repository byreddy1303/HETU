/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#F1F5F0',
          raised: '#FBFDFB',
          overlay: '#E7EFE9'
        },
        border: {
          DEFAULT: '#D5E1D8',
          hover: '#B8C9BD'
        },
        text: {
          DEFAULT: '#19352F',
          muted: '#50665F',
          faint: '#657871'
        },
        accent: {
          DEFAULT: '#2F6F5E',
          hover: '#265E50',
          faint: 'rgba(47, 111, 94, 0.11)'
        },
        success: { DEFAULT: '#4F7C45', faint: 'rgba(79, 124, 69, 0.12)' },
        danger: { DEFAULT: '#B85045', faint: 'rgba(184, 80, 69, 0.11)' },
        warn: { DEFAULT: '#8A5B13', faint: 'rgba(167, 117, 36, 0.14)' },
        guess: { DEFAULT: '#67518F', faint: 'rgba(103, 81, 143, 0.11)' },
        highlight: '#F3D58A',
        ink: {
          cobalt: '#376C8C',
          teal: '#2F6F5E',
          violet: '#67518F',
          rose: '#A94C60',
          marigold: '#8A5B13',
          slate: '#50665F'
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
        sm: '0 1px 2px rgba(25, 53, 47, 0.08)',
        card: '0 10px 28px -18px rgba(25, 53, 47, 0.34), 0 1px 3px rgba(25, 53, 47, 0.08)',
        lift: '0 18px 42px -20px rgba(25, 53, 47, 0.38), 0 4px 12px -6px rgba(25, 53, 47, 0.16)',
        press: 'inset 0 2px 4px rgba(25, 53, 47, 0.14)'
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
