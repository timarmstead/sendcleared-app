// Safe wrapper around Google Analytics (gtag), which is loaded in app/layout.tsx.
// Does nothing if GA is blocked, not loaded yet, or running on the server,
// so tracking can never break a page.

type EventParams = Record<string, string | number | boolean>

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function trackEvent(name: string, params: EventParams = {}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  try {
    window.gtag('event', name, params)
  } catch {
    // Never let analytics break the app.
  }
}
