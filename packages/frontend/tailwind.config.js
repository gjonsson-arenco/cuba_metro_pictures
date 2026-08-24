/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif']
      },
      colors: {
        // CUBA institutional palette (Club Universitario de Buenos Aires)
        cuba: {
          navy: '#0A2A66',       // primary
          'navy-dark': '#061F4D', // hover
          'navy-light': '#1E4A94',
          gold: '#C8A24D',       // nautical brass
          'gold-dark': '#a4832d',
          red: '#B01B2E',        // regatta accent
          cream: '#F5EFE0',      // subtle bg
          sand: '#EEE6D3'
        }
      },
      boxShadow: {
        card: '0 1px 3px rgba(10,42,102,0.08), 0 8px 24px -8px rgba(10,42,102,0.12)'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms')
  ]
};
