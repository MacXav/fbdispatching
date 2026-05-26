import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#0f172a',
        'dark-card': '#1e293b',
        'dark-border': '#334155',
        'primary': '#3b82f6',
        'primary-dark': '#1e40af',
        'success': '#10b981',
        'warning': '#f59e0b',
        'danger': '#ef4444',
      },
    },
  },
  plugins: [],
}

export default config
