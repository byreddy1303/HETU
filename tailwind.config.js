const color = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: color('bg'),
          raised: color('bg-raised'),
          overlay: color('bg-overlay')
        },
        border: {
          DEFAULT: color('border'),
          hover: color('border-hover')
        },
        text: {
          DEFAULT: color('text'),
          muted: color('text-muted'),
          faint: color('text-faint')
        },
        accent: {
          DEFAULT: color('accent'),
          hover: color('accent-hover'),
          faint: color('accent-faint'),
          contrast: color('accent-contrast')
        },
        success: {
          DEFAULT: color('success'),
          faint: color('success-faint'),
          contrast: color('success-contrast')
        },
        danger: {
          DEFAULT: color('danger'),
          faint: color('danger-faint'),
          contrast: color('danger-contrast')
        },
        warn: {
          DEFAULT: color('warn'),
          faint: color('warn-faint'),
          contrast: color('warn-contrast')
        },
        guess: {
          DEFAULT: color('guess'),
          faint: color('guess-faint'),
          contrast: color('guess-contrast')
        },
        highlight: {
          DEFAULT: color('highlight'),
          contrast: color('highlight-contrast')
        },
        ink: {
          cobalt: color('ink-cobalt'),
          teal: color('ink-teal'),
          violet: color('ink-violet'),
          rose: color('ink-rose'),
          marigold: color('ink-marigold'),
          slate: color('ink-slate')
        },
        scrim: color('scrim')
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
        sm: 'var(--shadow-sm)',
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        press: 'var(--shadow-press)',
        key: 'var(--shadow-key)',
        'key-hover': 'var(--shadow-key-hover)',
        nav: 'var(--shadow-nav)'
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
