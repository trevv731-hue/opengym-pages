import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import { useStore } from './store/useStore.js'
import { LOCAL_PAGES, TRAINNOTE } from './lib/demo.js'
import {startJournalSync} from './trainnote/sync.js'
import { setLang, baseLang } from './lib/i18n.js'
import { effectiveLang } from './lib/default-lang.js'
import { recoverPrimaryRecord, startLocalSafety } from './lib/data-safety.js'
import { startCloudSync } from './lib/cloud-sync.js'
import { startMediaSync } from './lib/media-sync.js'
import { startNativeKeyboard } from './lib/native-keyboard.js'
import './index.css'

// App.jsx restores per-route scroll itself; the browser's own attempt races it.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

// Prepare translations before React's first render. Chinese packs ship with the
// local build, so a cold or offline start never paints an English interface.
async function mountApp() {
  if (LOCAL_PAGES) {
    await recoverPrimaryRecord(useStore)
    startLocalSafety(useStore)
    const S = useStore.getState().S
    const lang = effectiveLang(S, { default_lang: 'zh' })
    await setLang(lang, S.enParens?.[baseLang(lang)] ?? true, S.enOnly?.[baseLang(lang)] === true)
    // Supabase email callbacks use the hash too. Consume their credentials
    // before HashRouter can replace an unrecognised route with /home.
    const authReturn = /(?:^#|&)access_token=|(?:^#|&)error=/.test(location.hash) || new URLSearchParams(location.search).has('code')
    if (TRAINNOTE) {
      await import('./trainnote/trainnote.css')
      startJournalSync(useStore)
    } else if (authReturn) {
      await startCloudSync(useStore)
      location.hash = '/settings/account'
    } else startCloudSync(useStore)
  }
  createRoot(document.getElementById('root')).render(
    <StrictMode><App /></StrictMode>
  )
}
mountApp()

// The photos and videos of custom exercises, in every build (the phone and the demo included):
// uploads of what the server lacks, the local clean-up, and the plan's files kept offline.
startMediaSync(useStore)

// Android 15 does not resize the page for the soft keyboard; the app says how much it covers and
// this keeps the focused field above it. Idle everywhere else.
startNativeKeyboard()

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
  // The plan's exercise media, kept by the worker for a workout opened without a network (#281).
  // It only fetches ahead while the page runs as the installed app; a tab keeps what it has shown.
  import('./lib/media-prefetch.js').then(m => m.startMediaPrefetch(useStore)).catch(() => {})
}
