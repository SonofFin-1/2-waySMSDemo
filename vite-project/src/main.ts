import './style.css'
import { initApp } from './app.ts'

const AUTH_KEY = '2waySMS_authenticated'
const PASSWORD = '2waySMS'

function showPasswordGate() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="password-gate">
      <div class="password-gate-card">
        <h1 class="password-gate-title">Enter password</h1>
        <form id="passwordForm" class="password-gate-form">
          <input
            type="password"
            id="passwordInput"
            class="password-gate-input"
            placeholder="Password"
            autocomplete="off"
            autofocus
          />
          <p id="passwordError" class="password-gate-error" aria-live="polite"></p>
          <button type="submit" class="password-gate-btn">Continue</button>
        </form>
      </div>
    </div>
  `

  const form = document.getElementById('passwordForm')!
  const input = document.getElementById('passwordInput') as HTMLInputElement
  const errorEl = document.getElementById('passwordError')!

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const value = input.value.trim()
    errorEl.textContent = ''
    if (value === PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, '1')
      app.innerHTML = ''
      initApp()
    } else {
      errorEl.textContent = 'Incorrect password. Please try again.'
      input.value = ''
      input.focus()
    }
  })
}

if (sessionStorage.getItem(AUTH_KEY)) {
  initApp()
} else {
  showPasswordGate()
}
