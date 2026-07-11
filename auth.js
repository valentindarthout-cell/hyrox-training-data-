/* ============ AUTH ============ */
var authMode = 'login';
var signupRole = 'athlete';

function pickRole(r){
  signupRole = r;
  document.getElementById('roleAthlete').classList.toggle('active', r==='athlete');
  document.getElementById('roleCoach').classList.toggle('active', r==='coach');
}

function showAuthTab(mode){
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode==='login');
  document.getElementById('tabSignup').classList.toggle('active', mode==='signup');
  document.getElementById('authBtn').textContent = mode==='login' ? 'Log in' : 'Sign up';
  document.getElementById('rolePick').style.display = mode==='signup' ? 'flex' : 'none';
  document.getElementById('authError').textContent = '';
}

async function handleAuth(){
  var email = document.getElementById('authEmail').value.trim();
  var password = document.getElementById('authPassword').value;
  var errEl = document.getElementById('authError');
  errEl.textContent = '';
  if(!email || !password){ errEl.textContent = 'Enter your email and password.'; return; }
  var btn = document.getElementById('authBtn');
  btn.disabled = true;
  try{
    var res = await fetch('/api/auth', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({action: authMode, email:email, password:password})
    });
    var data = await res.json();
    if(!res.ok || !data.access_token){
      errEl.textContent = data.error || 'Something went wrong. Try again.';
      btn.disabled = false;
      return;
    }
    localStorage.setItem('htd_token', data.access_token);
    localStorage.setItem('htd_user_id', data.user_id || '');
    if(authMode === 'signup' && signupRole === 'coach'){
      try{
        await fetch('/api/profile', { method:'PUT',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+data.access_token},
          body: JSON.stringify({ role:'coach', onboarded:true }) });
      }catch(e){}
    }
    location.reload();   // hard reset — never reuse in-memory state across accounts
  }catch(e){
    errEl.textContent = 'Network error. Check your connection.';
    btn.disabled = false;
  }
}

function logout(){
  localStorage.removeItem('htd_token');
  localStorage.removeItem('htd_user_id');
  location.reload();
}

function getToken(){ return localStorage.getItem('htd_token') || ''; }
