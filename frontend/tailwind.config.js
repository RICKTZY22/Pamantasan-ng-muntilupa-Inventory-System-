/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Accent color driven by CSS variables (set at runtime by ThemeProvider)
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          light: 'rgb(var(--accent-light) / <alpha-value>)',
          dark: 'rgb(var(--accent-dark) / <alpha-value>)',
          50: 'rgb(var(--accent-50) / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          500: 'rgb(var(--accent) / <alpha-value>)',
          600: 'rgb(var(--accent-dark) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
        },
        // Keep 'primary' as alias for backward compatibility
        primary: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dark: 'rgb(var(--accent-dark) / <alpha-value>)',
          light: 'rgb(var(--accent-light) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: '#64748b',
          dark: '#475569',
          light: '#94a3b8',
        },
        // Fixed PLMun brand greens for pre-login surfaces (auth pages, footer).
        // Deliberately NOT the runtime-themeable `accent` — brand identity on
        // public pages must not change with a user's saved theme.
        plmun: {
          DEFAULT: '#006B3F',
          light: '#0E8A57',
          dark: '#00553A',
          deep: '#004430',
          gold: '#D4A017',
        },
        // Dashboard Pro surface colors
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f8f9fa',
          dark: '#111827',
          'dark-secondary': '#1f2937',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        'pro': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      },
    },
  },
  plugins: [],
}
