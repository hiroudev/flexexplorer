import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import 'flex-design/theme-forge/designer.css'
import { THEMES } from 'flex-design/themes/presets.js'
import { registerTheme, applyTheme, initCustomThemes } from 'flex-design/runtime/theme.js'
import { useStore } from './store/useStore'

for (const t of Object.values(THEMES)) registerTheme(t)
initCustomThemes()
applyTheme(useStore.getState().theme, document.documentElement)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
