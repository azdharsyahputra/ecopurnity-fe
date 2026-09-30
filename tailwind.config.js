/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		colors: {
				navy: {
					50: '#F5F7FA', // Cloud
					100: '#E2E8F0',
					200: '#D1D5DB', // Slate
					300: '#CBD5E1',
					400: '#94A3B8',
					500: '#64748B',
					600: '#475569',
					700: '#334155',
					800: '#111827', // Ink
					900: '#0F172A',
					950: '#0B1220', // Economic Navy
				},
				teal: {
					50: '#F0FDFA',
					100: '#CCFBFE',
					200: '#99F6FA',
					300: '#67E8F9', // Soft Cyan
					400: '#33D1C3',
					500: '#00B8A9', // Market Teal
					600: '#009387',
					700: '#007A70',
					800: '#006159',
					900: '#004C46',
					950: '#002E2A',
				},
				lime: {
					300: '#D4FF33',
					400: '#B8F500', // Opportunity Lime
					500: '#9ACC00',
					600: '#7A9900',
				},
				amber: {
					300: '#FBBF24',
					400: '#F59E0B',
					500: '#D97706',
					600: '#B45309',
				},
				blue: {
					300: '#99F6FA',
					400: '#67E8F9', // Soft Cyan
					500: '#22D3EE',
					600: '#0891B2',
				},
				indigo: {
					300: '#99F6FA',
					400: '#67E8F9', // Soft Cyan
					500: '#22D3EE',
					600: '#0891B2',
				},
  			background: "var(--background)",
  			foreground: "var(--foreground)",
  			card: {
  				DEFAULT: "var(--card)",
  				foreground: "var(--card-foreground)"
  			},
  			popover: {
  				DEFAULT: "var(--popover)",
  				foreground: "var(--popover-foreground)"
  			},
  			primary: {
  				DEFAULT: "var(--primary)",
  				foreground: "var(--primary-foreground)"
  			},
  			secondary: {
  				DEFAULT: "var(--secondary)",
  				foreground: "var(--secondary-foreground)"
  			},
  			muted: {
  				DEFAULT: "var(--muted)",
  				foreground: "var(--muted-foreground)"
  			},
  			accent: {
  				DEFAULT: "var(--accent)",
  				foreground: "var(--accent-foreground)"
  			},
  			destructive: {
  				DEFAULT: "var(--destructive)",
  				foreground: "var(--destructive-foreground)"
  			},
  			border: "var(--border)",
  			input: "var(--input)",
  			ring: "var(--ring)",
			chart: {
				"1": "#00B8A9",
				"2": "#B8F500",
				"3": "#67E8F9",
				"4": "#0B1220",
				"5": "#D1D5DB"
			}
  		},
  		borderRadius: {
  			lg: "var(--radius)",
  			md: "calc(var(--radius) - 2px)",
  			sm: "calc(var(--radius) - 4px)"
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
