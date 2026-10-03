import { create } from 'zustand'

export type ThemePref = 'light' | 'dark' | 'system'

const THEME_KEY = 'ecp-theme'
// Undefined while prerendering (src/entry-server.tsx), where there is no window.
const media = typeof window === 'undefined' ? undefined : window.matchMedia('(prefers-color-scheme: dark)')

function readTheme(): ThemePref {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemePref) ?? 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches)
  document.documentElement.classList.toggle('dark', dark)
}

interface UiState {
  theme: ThemePref
  setTheme: (t: ThemePref) => void
  /** Why the auth gate is open (e.g. "bid di auction ini"); null = closed. */
  authGate: string | null
  openAuthGate: (reason: string) => void
  closeAuthGate: () => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  // Starts as the prerendered value; the saved theme is set below, so hydration (which reads the
  // store's initial state as its server snapshot) matches the HTML and the toggle updates right after.
  theme: 'system',
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // per-session only
    }
    applyTheme(theme)
    set({ theme })
  },
  authGate: null,
  openAuthGate: (reason) => set({ authGate: reason }),
  closeAuthGate: () => set({ authGate: null }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}))

if (media) {
  useUi.setState({ theme: readTheme() })
  applyTheme(useUi.getState().theme)
  media.addEventListener('change', () => applyTheme(useUi.getState().theme))
}
