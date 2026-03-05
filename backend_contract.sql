-- simulator-ui/backend_contract.sql
-- This file defines the backend contracts expected by the UI.
-- Apply in simulator project only after reviewing and adapting for your RLS/auth model.

-- 1) UI role context
-- Returns role metadata for current auth user.
create or replace function public.rpc_sim_get_ui_context()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_admin', false,
    'role', 'viewer'
  );
$$;

-- 2) Run helper for admin reset
create or replace function public.rpc_sim_reset_running_to_pending(p_source text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sim_run_details
  set queue_status = 'PENDING', updated_at = now()
  where queue_status = 'RUNNING';

  return jsonb_build_object('success', true, 'message', 'Reset completed');
end;
$$;

-- 3) Alert retry
create or replace function public.rpc_sim_retry_alert(p_alert_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sim_failure_alert_queue
  set status = 'PENDING',
      retry_count = coalesce(retry_count, 0) + 1,
      next_retry_at = now(),
      last_error = null,
      updated_at = now()
  where id = p_alert_id;

  return jsonb_build_object('success', found);
end;
$$;

-- 4) Recipient upsert
create or replace function public.rpc_sim_upsert_alert_recipient(
  p_name text,
  p_email text,
  p_severity_min text,
  p_module_filter text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.sim_alert_recipients(name, email, severity_min, module_filter, is_active)
  values (p_name, p_email, p_severity_min, p_module_filter, coalesce(p_is_active, true))
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

-- 5) Recipient delete
create or replace function public.rpc_sim_delete_alert_recipient(p_recipient_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sim_alert_recipients where id = p_recipient_id;
  return jsonb_build_object('success', found);
end;
$$;

-- 6) Severity mute/unmute
create or replace function public.rpc_sim_set_alert_mute(
  p_action text,
  p_severity text,
  p_mute_until timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'mute' then
    insert into public.sim_alert_mute_rules(severity, mute_until, reason, is_active)
    values (p_severity, p_mute_until, p_reason, true)
    on conflict (severity) do update
      set mute_until = excluded.mute_until,
          reason = excluded.reason,
          is_active = true,
          updated_at = now();
  else
    update public.sim_alert_mute_rules
    set is_active = false,
        updated_at = now()
    where severity = p_severity;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- 7) Optional helper: safe admin context check
create or replace function public.sim_is_admin_context_safe()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
begin
  if to_regprocedure('public.sim_is_admin_context()') is null then
    return false;
  end if;

  execute 'select public.sim_is_admin_context()' into v_is_admin;
  return coalesce(v_is_admin, false);
exception
  when others then
    return false;
end;
$$;

-- 8) Webhook config table (single-row)
create table if not exists public.sim_alert_webhook_config (
  id smallint primary key default 1 check (id = 1),
  is_enabled boolean not null default false,
  endpoint_url text not null default '',
  auth_header_name text,
  auth_header_value text,
  debounce_seconds integer not null default 20 check (debounce_seconds between 5 and 3600),
  request_timeout_ms integer not null default 5000 check (request_timeout_ms between 1000 and 30000),
  max_batch_size integer not null default 100 check (max_batch_size between 1 and 1000),
  last_fired_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.sim_alert_webhook_config(id)
values (1)
on conflict (id) do nothing;

-- 9) Webhook delivery log
create table if not exists public.sim_alert_webhook_delivery_log (
  id bigserial primary key,
  trigger_source text not null,
  pending_count integer not null,
  batch_size integer not null,
  request_id bigint,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

-- 10) Upsert webhook config
create or replace function public.rpc_sim_upsert_alert_webhook_config(
  p_is_enabled boolean,
  p_endpoint_url text,
  p_auth_header_name text default null,
  p_auth_header_value text default null,
  p_debounce_seconds integer default 20,
  p_request_timeout_ms integer default 5000,
  p_max_batch_size integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sim_is_admin_context_safe() then
    raise exception 'Admin role required';
  end if;

  insert into public.sim_alert_webhook_config(
    id, is_enabled, endpoint_url, auth_header_name, auth_header_value,
    debounce_seconds, request_timeout_ms, max_batch_size, updated_at
  )
  values (
    1, coalesce(p_is_enabled, false), coalesce(trim(p_endpoint_url), ''),
    nullif(trim(coalesce(p_auth_header_name, '')), ''),
    nullif(trim(coalesce(p_auth_header_value, '')), ''),
    coalesce(p_debounce_seconds, 20),
    coalesce(p_request_timeout_ms, 5000),
    coalesce(p_max_batch_size, 100),
    now()
  )
  on conflict (id) do update set
    is_enabled = excluded.is_enabled,
    endpoint_url = excluded.endpoint_url,
    auth_header_name = excluded.auth_header_name,
    auth_header_value = excluded.auth_header_value,
    debounce_seconds = excluded.debounce_seconds,
    request_timeout_ms = excluded.request_timeout_ms,
    max_batch_size = excluded.max_batch_size,
    updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

-- 11) Read webhook config (masked secret value)
create or replace function public.rpc_sim_get_alert_webhook_config()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_enabled', c.is_enabled,
    'endpoint_url', c.endpoint_url,
    'auth_header_name', c.auth_header_name,
    'has_auth_header_value', (c.auth_header_value is not null),
    'debounce_seconds', c.debounce_seconds,
    'request_timeout_ms', c.request_timeout_ms,
    'max_batch_size', c.max_batch_size,
    'last_fired_at', c.last_fired_at,
    'updated_at', c.updated_at
  )
  from public.sim_alert_webhook_config c
  where c.id = 1;
$$;

-- 12) Batched webhook dispatcher
create or replace function public.sim_trigger_alert_webhook(
  p_trigger_source text default 'db_trigger',
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg public.sim_alert_webhook_config%rowtype;
  v_pending integer := 0;
  v_batch_size integer := 0;
  v_payload jsonb;
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
  v_request_id bigint;
  v_lock_key bigint := hashtext('sim_alert_webhook_dispatch')::bigint;
  v_locked boolean := false;
  v_net_post_exists boolean := false;
begin
  select * into v_cfg
  from public.sim_alert_webhook_config
  where id = 1;

  if not found or not coalesce(v_cfg.is_enabled, false) then
    return jsonb_build_object('triggered', false, 'reason', 'webhook_disabled');
  end if;

  if coalesce(trim(v_cfg.endpoint_url), '') = '' then
    return jsonb_build_object('triggered', false, 'reason', 'missing_endpoint_url');
  end if;

  select count(*)::int into v_pending
  from public.sim_failure_alert_queue q
  where coalesce(q.delivery_status, 'PENDING') in ('PENDING', 'RETRY');

  if v_pending = 0 then
    return jsonb_build_object('triggered', false, 'reason', 'no_pending_alerts');
  end if;

  if not p_force
     and v_cfg.last_fired_at is not null
     and v_cfg.last_fired_at > now() - make_interval(secs => v_cfg.debounce_seconds) then
    return jsonb_build_object(
      'triggered', false,
      'reason', 'debounced',
      'pending_count', v_pending,
      'last_fired_at', v_cfg.last_fired_at
    );
  end if;

  v_locked := pg_try_advisory_lock(v_lock_key);
  if not v_locked then
    return jsonb_build_object('triggered', false, 'reason', 'already_in_progress', 'pending_count', v_pending);
  end if;

  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    insert into public.sim_alert_webhook_delivery_log(trigger_source, pending_count, batch_size, status, error_message)
    values (p_trigger_source, v_pending, 0, 'SKIPPED', 'net.http_post is not available');
    return jsonb_build_object('triggered', false, 'reason', 'pg_net_missing');
  end if;

  v_batch_size := least(v_pending, v_cfg.max_batch_size);

  v_payload := jsonb_build_object(
    'source', p_trigger_source,
    'queued_at', now(),
    'pending_count', v_pending,
    'batch_size', v_batch_size
  );

  if v_cfg.auth_header_name is not null and v_cfg.auth_header_value is not null then
    v_headers := v_headers || jsonb_build_object(v_cfg.auth_header_name, v_cfg.auth_header_value);
  end if;

  execute 'select net.http_post($1, $2, $3, $4, $5)'
    into v_request_id
    using v_cfg.endpoint_url, v_payload, '{}'::jsonb, v_headers, v_cfg.request_timeout_ms;

  update public.sim_alert_webhook_config
  set last_fired_at = now(),
      updated_at = now()
  where id = 1;

  insert into public.sim_alert_webhook_delivery_log(trigger_source, pending_count, batch_size, request_id, status)
  values (p_trigger_source, v_pending, v_batch_size, v_request_id, 'QUEUED');

  perform pg_advisory_unlock(v_lock_key);

  return jsonb_build_object(
    'triggered', true,
    'request_id', v_request_id,
    'pending_count', v_pending,
    'batch_size', v_batch_size
  );
exception
  when others then
    if v_locked then
      perform pg_advisory_unlock(v_lock_key);
    end if;

    insert into public.sim_alert_webhook_delivery_log(trigger_source, pending_count, batch_size, status, error_message)
    values (coalesce(p_trigger_source, 'db_trigger'), coalesce(v_pending, 0), coalesce(v_batch_size, 0), 'ERROR', sqlerrm);

    raise;
end;
$$;

-- 13) Manual force endpoint for webhook path
create or replace function public.rpc_sim_force_alert_webhook(
  p_force boolean default true,
  p_source text default 'manual_force'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sim_is_admin_context_safe() then
    raise exception 'Admin role required';
  end if;

  return public.sim_trigger_alert_webhook(coalesce(p_source, 'manual_force'), coalesce(p_force, true));
end;
$$;

-- 14) Trigger function: on queue insert/update, debounce + batch webhook dispatch
create or replace function public.trg_sim_alert_queue_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.delivery_status, 'PENDING') in ('PENDING', 'RETRY') then
      perform public.sim_trigger_alert_webhook('queue_insert', false);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(new.delivery_status, 'PENDING') in ('PENDING', 'RETRY')
       and coalesce(old.delivery_status, 'PENDING') is distinct from coalesce(new.delivery_status, 'PENDING') then
      perform public.sim_trigger_alert_webhook('queue_update', false);
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists sim_alert_queue_webhook_trigger on public.sim_failure_alert_queue;
create trigger sim_alert_queue_webhook_trigger
after insert or update of delivery_status
on public.sim_failure_alert_queue
for each row
execute function public.trg_sim_alert_queue_webhook();
