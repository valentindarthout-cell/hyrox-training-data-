function showAuthTab(t) {
  document.getElementById('atab-login').classList.toggle('active', t === 'login');
  document.getElementById('atab-signup').classList.toggle('active', t === 'signup');
  document.getElementById('auth-btn-label').textContent = t === 'login' ? 'Login' : 'Sign up';
}

async function handleAuth() {
  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  var isLogin = document.getElementById('atab-login').classList.contains('active');
  var errEl = document.getElementById('auth-error');
  var btnEl = document.getElementById('auth-btn-label');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please fill in email and password.'; return; }
  btnEl.textContent = 'Loading...';
  var endpoint = isLogin ? '/api/auth-login' : '/api/auth-signup';
  try {
    var r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await r.json();
    if (data.error) { errEl.textContent = data.error; btnEl.textContent = isLogin ? 'Login' : 'Sign up'; return; }
    authToken = data.token;
    localStorage.setItem('htd-token', authToken);
    enterApp();
  } catch(e) {
    errEl.textContent = 'Something went wrong. Try again.';
    btnEl.textContent = isLogin ? 'Login' : 'Sign up';
  }
}

function logout() {
  authToken = null;
  localStorage.removeItem('htd-token');
  document.getElementById('view-auth').style.display = 'block';
  document.getElementById('view-app').style.display = 'none';
}
