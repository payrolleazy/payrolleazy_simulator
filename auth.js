const $ = (s) => document.querySelector(s);

const conn = {
  url: window.SIM_CONFIG?.SUPABASE_URL || '',
  key: window.SIM_CONFIG?.SUPABASE_PUBLISHABLE_KEY || window.SIM_CONFIG?.SUPABASE_ANON_KEY || '',
};

init();

async function init() {
  if (conn.url && conn.key) {
    try {
      const client = window.supabase.createClient(conn.url, conn.key);
      const { data } = await client.auth.getSession();
      if (data?.session?.access_token) {
        const { data: userData, error: userError } = await client.auth.getUser();
        if (!userError && userData?.user) {
          window.location.replace('/');
          return;
        }
      }
    } catch {
      // Stay on auth page if session validation fails.
    }
  }

  $('#btn-check').onclick = checkEligibility;
  $('#btn-signup').onclick = signUp;
  $('#btn-login').onclick = login;
}

function saveConn() {
  conn.url = (window.SIM_CONFIG?.SUPABASE_URL || '').trim().replace(/\/$/, '');
  conn.key = (window.SIM_CONFIG?.SUPABASE_PUBLISHABLE_KEY || window.SIM_CONFIG?.SUPABASE_ANON_KEY || '').trim();
}

function out(obj) {
  $('#auth-output').textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
}

function validateBasic() {
  saveConn();
  if (!conn.url || !conn.key) {
    throw new Error('Supabase URL and key are required.');
  }
  const email = $('#auth-email').value.trim().toLowerCase();
  const password = $('#auth-password').value;
  if (!email) throw new Error('Email is required.');
  return { email, password };
}

async function checkEligibility() {
  try {
    const { email } = validateBasic();
    const res = await fetch(`${conn.url}/rest/v1/rpc/rpc_sim_check_signup_eligibility`, {
      method: 'POST',
      headers: {
        apikey: conn.key,
        Authorization: `Bearer ${conn.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_email: email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || JSON.stringify(data));
    out(data);
  } catch (e) {
    out(`Eligibility check failed: ${e.message}`);
  }
}

async function signUp() {
  try {
    const { email, password } = validateBasic();
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const eligRes = await fetch(`${conn.url}/rest/v1/rpc/rpc_sim_check_signup_eligibility`, {
      method: 'POST',
      headers: {
        apikey: conn.key,
        Authorization: `Bearer ${conn.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_email: email }),
    });
    const elig = await eligRes.json();
    if (!eligRes.ok) throw new Error(elig?.message || JSON.stringify(elig));
    if (!elig?.allowed) throw new Error(elig?.message || 'Email is not allowlisted.');

    const client = window.supabase.createClient(conn.url, conn.key);
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + '/auth' },
    });
    if (error) throw error;

    if (!data?.session) {
      out('Signup initiated. Check your email and confirm, then login.');
    } else {
      out('Signup successful. Redirecting...');
      window.location.replace('/');
    }
  } catch (e) {
    out(`Signup failed: ${e.message}`);
  }
}

async function login() {
  try {
    const { email, password } = validateBasic();
    const client = window.supabase.createClient(conn.url, conn.key);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    out('Login successful. Redirecting...');
    window.location.replace('/');
  } catch (e) {
    out(`Login failed: ${e.message}`);
  }
}
