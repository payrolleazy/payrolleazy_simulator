# Simulator UI (Blue Theme)

A lightweight, fully functional frontend for the simulator backend.

## Path
`D:\codex_cli\simulator-ui`

## Views
- Overview: KPIs + run actions
- Permanent Tests: severity + search
- Run Details: execution trace
- Settings: connection + alert queue + recipients + mute + cron + webhook + allowlist

## Run
1. Open `index.html` in browser (or serve folder via static server).
2. Enter `Supabase URL` + `Publishable/Anon key`.
3. Save connection.
4. Use left navigation.
5. If not logged in, you will be redirected to `auth.html`.

Local config file:
- This project reads Supabase runtime config from `config.js`.
- For local manual run, copy `config.example.js` to `config.js` and set:
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
- Never put `service_role` key in frontend config.

## Cloudflare Deployment

### Option A: Cloudflare Pages (Git-integrated, recommended)
1. Push this repo to GitHub.
2. In Cloudflare Dashboard: `Workers & Pages` -> `Create` -> `Pages` -> `Connect to Git`.
3. Select repo: `payrolleazy/payrolleazy_simulator`.
4. Build settings:
   - Framework preset: `None`
   - Build command: `npm run build:config`
   - Build output directory: `.`
5. Deploy from branch: `main`.
6. In Pages -> `Settings` -> `Environment variables`, add:
   - `SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` (or anon publishable key)
7. Add these vars in both `Production` and `Preview`.

Accepted fallback names:
- URL: `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`
- Key: `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Option B: Wrangler CLI
1. Install wrangler: `npm i -g wrangler`
2. Login: `wrangler login`
3. Generate runtime config:
   - `SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... npm run build:config`
4. Deploy:
   - `wrangler pages project create payrolleazy-simulator-ui` (one-time)
   - `wrangler pages deploy .`

### Notes
- `wrangler.toml` is included with `pages_build_output_dir = "."`.
- `_headers` adds baseline security headers.
- `_redirects` maps `/` and `/auth` cleanly to static HTML files.
- `scripts/generate-config.mjs` creates `config.js` from environment variables during build.

## Auth Flow
- Signup is allowlist-based.
- Main developer must insert email first in `public.sim_signup_allowlist`.
- User opens `auth.html`, enters URL/key/email/password.
- `Check Eligibility` verifies allowlist match.
- `Sign Up` triggers Supabase confirmation email for allowlisted email.
- After confirmation, user can `Login` and use `index.html`.

## Backend Contracts Expected
The UI calls these RPCs if available:
- `rpc_run_simulator_suite`
- `rpc_process_batch`
- `rpc_sim_get_ui_context`
- `rpc_sim_reset_running_to_pending`
- `rpc_sim_retry_alert`
- `rpc_sim_upsert_alert_recipient`
- `rpc_sim_delete_alert_recipient`
- `rpc_sim_set_alert_mute`
- `rpc_sim_upsert_alert_dispatch_cron`
- `rpc_sim_get_alert_webhook_config`
- `rpc_sim_upsert_alert_webhook_config`
- `rpc_sim_force_alert_webhook`

The UI reads these tables if present:
- `sim_permanent_queries`
- `sim_run_history`
- `sim_run_details`
- `sim_failure_alert_queue`
- `sim_alert_recipients`
- `sim_alert_mute_rules`

Use `backend_contract.sql` as starting contract for required RPCs.

## Security Note
Admin actions are intentionally RPC-only. Keep write access behind secure `SECURITY DEFINER` RPCs + role checks in DB.
