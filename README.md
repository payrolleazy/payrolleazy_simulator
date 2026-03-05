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
