const NAV = [
  { key: "overview", label: "Overview", subtitle: "Simulator run and test intelligence" },
  { key: "docs", label: "Documentation", subtitle: "Architecture, workflows, and debugging guide" },
  { key: "tests", label: "Permanent Tests", subtitle: "Coverage, severity, scripts" },
  { key: "details", label: "Run Details", subtitle: "Execution-level trace and status" },
  { key: "gateway-cases", label: "Gateway Cases", subtitle: "Role-scoped gateway test catalog" },
  { key: "gateway-runs", label: "Gateway Runs", subtitle: "Gateway run history and case outcomes" },
  { key: "gateway-fixtures", label: "Gateway Fixtures", subtitle: "Seeded data plans, fixture context, and cleanup trace" },
  { key: "devops-gate", label: "DevOps Gate", subtitle: "Release gate policy, run control, and verdict tracking" },
];
const SETTINGS_VIEW = {
  key: "settings",
  label: "Settings",
  subtitle: "Connection, alerts, recipients, cron, and allowlist controls",
};

const COLUMN_LABELS = {
  id: "ID",
  run_id: "Run ID",
  suite_run_id: "Suite ID",
  test_id: "Test ID",
  test_case_id: "Test Case",
  functionality_name: "Functionality",
  target_config_id: "Config ID",
  role_context: "Role",
  is_active: "Active",
  created_at: "Created",
  updated_at: "Updated",
  started_at: "Started",
  completed_at: "Completed",
  execution_time_ms: "Exec Time (ms)",
  queue_status: "Queue State",
  job_status: "Job State",
  status: "Status",
  total_jobs: "Total Jobs",
  pending_jobs: "Pending Jobs",
  passed_jobs: "Passed Jobs",
  failed_jobs: "Failed Jobs",
  dead_jobs: "Dead Jobs",
  pending_count: "Pending",
  passed_count: "Passed",
  failed_count: "Failed",
  pass_rate_pct: "Pass Rate (%)",
  gate_reason: "Gate Reason",
  release_ref: "Release Ref",
  execution_mode: "Execution Mode",
  triggered_by: "Triggered By",
  threshold_snapshot: "Threshold Snapshot",
  metadata: "Metadata",
  fixture_scope: "Fixture Scope",
  fixture_mode: "Fixture Mode",
  terminal_cleanup_policy: "Cleanup Policy",
  timeout_seconds: "Timeout (s)",
  source: "Source",
  worker_id: "Worker",
  retry_count: "Retries",
  last_error: "Last Error",
  severity_min: "Min Severity",
  module_filter: "Module Filter",
  intended_role: "Role",
  consumed_at: "Consumed",
  auth_user_id: "Auth User",
  delivery_status: "Delivery State",
  job_id: "Job ID",
  error_message: "Error",
};

const state = {
  view: "overview",
  auth: { isAdmin: false, role: "viewer", session: null },
  supabase: null,
  tests: { page: 1, pageSize: 10, total: 0, rows: [] },
  details: { page: 1, pageSize: 10, total: 0, rows: [] },
  gatewayCases: { page: 1, pageSize: 10, total: 0, rows: [] },
  gatewayRuns: { resultsPage: 1, resultsPageSize: 10, resultsTotal: 0 },
  gatewayFixtures: {
    activeTab: "plans",
    plansPage: 1,
    plansPageSize: 10,
    plansTotal: 0,
    runsPage: 1,
    runsPageSize: 10,
    runsTotal: 0,
  },
  devopsGate: {
    runsPage: 1,
    runsPageSize: 10,
    runsTotal: 0,
    selectedGateRunId: "",
  },
  testEditor: { currentId: null, mode: "SQL_SCRIPT" },
  runLoop: {
    sql: { active: false, stopRequested: false },
    gateway: { active: false, stopRequested: false },
  },
  gatewayRunner: {
    module: localStorage.getItem("sim.gw.module") || "",
    workerId: localStorage.getItem("sim.gw.workerId") || "ui:settings:gateway",
  },
  conn: {
    url: window.SIM_CONFIG?.SUPABASE_URL || localStorage.getItem("sim.sb.url") || "",
    key: window.SIM_CONFIG?.SUPABASE_PUBLISHABLE_KEY || window.SIM_CONFIG?.SUPABASE_ANON_KEY || localStorage.getItem("sim.sb.key") || "",
    source: localStorage.getItem("sim.sb.source") || "UI_SIMULATOR",
    batchSize: Number(localStorage.getItem("sim.sb.batch") || 10),
  },
};

const $ = (sel) => document.querySelector(sel);

init();

function init() {
  buildNav();
  const settingsBtn = $("#nav-settings");
  if (settingsBtn) {
    settingsBtn.onclick = () => {
      state.view = "settings";
      buildNav();
      renderView();
    };
  }
  $("#refresh-all").addEventListener("click", async () => {
    await resolveUiRole();
    renderView();
  });
  initAuthSession()
    .finally(() => resolveUiRole().finally(renderView));
}

async function initAuthSession() {
  if (!state.conn.url || !state.conn.key || !window.supabase?.createClient) return;
  state.supabase = window.supabase.createClient(state.conn.url, state.conn.key);
  const { data } = await state.supabase.auth.getSession();
  state.auth.session = data?.session ?? null;

  if (!state.auth.session || !state.auth.session.access_token) {
    await state.supabase.auth.signOut();
    window.location.replace("auth.html");
    return;
  }

  // Verify the session is actually valid with the server
  const { data: userData, error: userError } = await state.supabase.auth.getUser();
  if (userError || !userData?.user) {
    await state.supabase.auth.signOut();
    window.location.replace("auth.html");
    return;
  }

  const logoutBtn = $("#logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await state.supabase.auth.signOut();
      window.location.href = "auth.html";
    };
  }
}

function buildNav() {
  const nav = $("#nav");
  nav.innerHTML = "";
  NAV.forEach((item) => {
    const btn = document.createElement("button");
    btn.textContent = item.label;
    btn.className = item.key === state.view ? "active" : "";
    btn.onclick = () => {
      state.view = item.key;
      buildNav();
      renderView();
    };
    nav.appendChild(btn);
  });
  const settingsBtn = $("#nav-settings");
  if (settingsBtn) {
    settingsBtn.classList.toggle("active", state.view === "settings");
  }
}

function bindConnection() {
  if (!$("#save-conn") || !$("#test-conn")) return;
  $("#save-conn").addEventListener("click", async () => {
    state.conn.url = $("#sb-url").value.trim().replace(/\/$/, "");
    state.conn.key = $("#sb-key").value.trim();
    state.conn.source = $("#run-source").value.trim() || "UI_SIMULATOR";
    state.conn.batchSize = Number($("#batch-size").value || 10);

    localStorage.setItem("sim.sb.url", state.conn.url);
    localStorage.setItem("sim.sb.key", state.conn.key);
    localStorage.setItem("sim.sb.source", state.conn.source);
    localStorage.setItem("sim.sb.batch", String(state.conn.batchSize));

    setConnStatus("Saved", "ok");
    await initAuthSession();
    await resolveUiRole();
    buildNav();
    renderView();
  });

  $("#test-conn").addEventListener("click", async () => {
    try {
      await rest("sim_run_history", { select: "run_id", limit: "1" });
      setConnStatus("Connected", "ok");
      await resolveUiRole();
      buildNav();
    } catch (e) {
      setConnStatus(`Connection failed: ${e.message}`, "err");
      setRolePill("unknown", false);
    }
  });
}

function hydrateConnectionInputs() {
  if (!$("#sb-url") || !$("#sb-key") || !$("#run-source") || !$("#batch-size")) return;
  $("#sb-url").value = state.conn.url;
  $("#sb-key").value = state.conn.key;
  $("#run-source").value = state.conn.source;
  $("#batch-size").value = String(state.conn.batchSize);
}

function setConnStatus(text, cls) {
  const el = $("#conn-status");
  if (!el) return;
  el.textContent = text;
  el.className = `status-pill ${cls}`;
}

function setRolePill(role, isAdmin) {
  const el = $("#role-pill");
  el.textContent = `Role: ${role}`;
  el.className = `status-pill ${isAdmin ? "ok" : "idle"}`;
}

async function resolveUiRole() {
  try {
    assertConn();
    const ctx = await rpc("rpc_sim_get_ui_context", {});
    state.auth.isAdmin = Boolean(ctx?.is_admin);
    state.auth.role = ctx?.role || (state.auth.isAdmin ? "admin" : "viewer");
  } catch {
    state.auth.isAdmin = false;
    state.auth.role = "viewer";
  }
  setRolePill(state.auth.role, state.auth.isAdmin);
}

async function renderView() {
  const target = state.view === "settings"
    ? SETTINGS_VIEW
    : (NAV.find((v) => v.key === state.view) || NAV[0]);
  state.view = target.key;
  $("#section-title").textContent = target.label;
  $("#section-subtitle").textContent = target.subtitle;

  const view = $("#view");
  view.innerHTML = `<div class="card">Loading ${target.label}...</div>`;

  if (state.view === "overview") return renderOverview();
  if (state.view === "docs") return renderDocs();
  if (state.view === "tests") return renderTests();
  if (state.view === "details") return renderDetails();
  if (state.view === "gateway-cases") return renderGatewayCases();
  if (state.view === "gateway-runs") return renderGatewayRuns();
  if (state.view === "gateway-fixtures") return renderGatewayFixtures();
  if (state.view === "devops-gate") return renderDevopsGate();
  if (state.view === "settings") return renderSettings();
}

async function renderOverview() {
  const tpl = $("#overview-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);

  $("#btn-run-sql-auto").onclick = runSqlSuiteAuto;
  $("#btn-stop-sql-auto").onclick = () => {
    state.runLoop.sql.stopRequested = true;
    setRunModalOutput("Stop requested by user.\nWaiting for the current logical step to finish...");
  };
  $("#btn-process-sql-batch").onclick = () => runSqlOverviewAction("rpc_process_sql_batch", {
    p_source: state.conn.source,
    p_batch_size: 1,
  });
  $("#btn-reset-sql").onclick = () => runSqlOverviewAction("rpc_sim_reset_running_to_pending", {
    p_source: state.conn.source,
  });

  $("#btn-run-gateway-auto").onclick = runGatewaySuiteAuto;
  $("#btn-stop-gateway-auto").onclick = () => {
    state.runLoop.gateway.stopRequested = true;
    setRunModalOutput("Stop requested by user.\nWaiting for the current gateway dispatch to settle...");
  };
  $("#btn-process-gateway-job").onclick = processNextGatewayJobManual;
  $("#btn-reset-gateway").onclick = () => runGatewayOverviewAction("rpc_sim_reset_running_to_pending", {
    p_source: getGatewayOverviewSource(),
  });

  try {
    await refreshOverviewPanels();
  } catch (e) {
    if ($("#sql-run-summary")) $("#sql-run-summary").textContent = `Overview load failed: ${e.message}`;
    if ($("#gateway-run-summary")) $("#gateway-run-summary").textContent = `Overview load failed: ${e.message}`;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openRunModal(title, subtitle, status = "idle", options = {}) {
  const modal = $("#run-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  if ($("#run-modal-title")) $("#run-modal-title").textContent = title;
  if ($("#run-modal-subtitle")) $("#run-modal-subtitle").textContent = subtitle;
  updateRunModalStatus(status);
  if ($("#run-modal-phase")) $("#run-modal-phase").textContent = "Preparing";
  if ($("#run-modal-result")) $("#run-modal-result").textContent = "Waiting";
  if ($("#run-modal-note")) $("#run-modal-note").textContent = "Stay on this screen while the runner updates progress.";
  if ($("#run-modal-progress")) {
    $("#run-modal-progress").max = 100;
    $("#run-modal-progress").value = 0;
  }
  if ($("#run-modal-progress-label")) {
    $("#run-modal-progress-label").textContent = "Waiting for the first test to settle.";
  }
  setRunBanner("", "info", true);
  const closeBtn = $("#run-modal-close");
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.onclick = () => {
      if (!closeBtn.disabled) closeRunModal();
    };
  }
  const stopBtn = $("#run-modal-stop");
  if (stopBtn) {
    stopBtn.disabled = !options.onStop;
    stopBtn.classList.toggle("hidden", !options.onStop);
    stopBtn.onclick = () => {
      if (typeof options.onStop === "function") options.onStop();
    };
  }
}

function updateRunModalStatus(status, subtitle = null) {
  if ($("#run-modal-status")) {
    $("#run-modal-status").textContent = `Status: ${status}`;
    $("#run-modal-status").className = `status-pill ${status === "SUCCESS" ? "ok" : status === "FAILED" || status === "ERROR" || status === "PARTIAL_FAILURE" ? "err" : "idle"}`;
  }
  if (subtitle && $("#run-modal-subtitle")) {
    $("#run-modal-subtitle").textContent = subtitle;
  }
  if ($("#run-modal-phase")) $("#run-modal-phase").textContent = humanizeStatus(status);
}

function setRunModalOutput(text) {
  if ($("#run-modal-output")) {
    $("#run-modal-output").textContent = text;
  }
}

function setRunModalProgress(completed, total, label = null) {
  const safeTotal = Math.max(Number(total || 0), 1);
  const safeCompleted = Math.max(0, Math.min(Number(completed || 0), safeTotal));
  if ($("#run-modal-progress")) {
    $("#run-modal-progress").max = safeTotal;
    $("#run-modal-progress").value = safeCompleted;
  }
  if ($("#run-modal-progress-label")) {
    $("#run-modal-progress-label").textContent = label || `${safeCompleted}/${safeTotal} tests settled`;
  }
}

function completeRunModal(status, subtitle = null) {
  updateRunModalStatus(status, subtitle);
  const closeBtn = $("#run-modal-close");
  if (closeBtn) closeBtn.disabled = false;
  const stopBtn = $("#run-modal-stop");
  if (stopBtn) stopBtn.disabled = true;
  if ($("#run-modal-result")) $("#run-modal-result").textContent = humanizeStatus(status);
  if ($("#run-modal-note")) {
    $("#run-modal-note").textContent = status === "ERROR"
      ? "Execution stopped with an error. Review the JSON payload below."
      : status === "STOPPED"
        ? "Execution was stopped by the operator."
        : "Execution finished. Review the final payload below, then close the dialog.";
  }
  setRunBanner(
    status === "ERROR"
      ? "Execution failed. The error payload is preserved below."
      : status === "STOPPED"
        ? "Execution was stopped. Partial output is preserved below."
        : "Execution completed successfully.",
    status === "ERROR" ? "error" : status === "STOPPED" ? "info" : "success"
  );
}

function closeRunModal() {
  const modal = $("#run-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function setRunBanner(message, tone = "info", hidden = false) {
  const banner = $("#run-modal-banner");
  if (!banner) return;
  if (hidden || !message) {
    banner.textContent = "";
    banner.className = "run-banner hidden";
    return;
  }
  banner.textContent = message;
  banner.className = `run-banner ${tone}`;
}

function humanizeStatus(value) {
  const text = String(value || "").trim();
  if (!text) return "Unknown";
  return text
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function labelForColumn(name) {
  return COLUMN_LABELS[name] || humanizeStatus(name);
}

function getGatewayOverviewSource() {
  return `${state.conn.source}__gateway_ui`;
}

function getGatewayModuleFilter() {
  const raw = String(state.gatewayRunner.module || "").trim();
  if (!raw || raw.toUpperCase() === "ALL") return null;
  return raw;
}

async function refreshOverviewPanels() {
  const [runs, sqlSnapshot, gatewaySnapshot] = await Promise.all([
    loadOverviewRuns(),
    loadSqlOverviewSnapshotForSource(state.conn.source),
    loadGatewayOverviewSnapshot(),
  ]);
  applyOverviewRunsToDom(runs);
  applySqlOverviewSnapshot(sqlSnapshot);
  applyGatewayOverviewSnapshot(gatewaySnapshot);
}

async function runSqlSuiteAuto() {
  if (state.runLoop.sql.active) {
    setRunModalOutput("Logical auto-run is already in progress.");
    return;
  }

  state.runLoop.sql.active = true;
  state.runLoop.sql.stopRequested = false;
  let finalModalStatus = "SUCCESS";
  let finalModalSubtitle = "Logical execution finished";
  openRunModal("Logical Tests", `Source: ${state.conn.source}`, "RUNNING", {
    onStop: () => {
      state.runLoop.sql.stopRequested = true;
      setRunModalOutput(`${$("#run-modal-output")?.textContent || ""}\n\nStop requested by user.`);
    },
  });
  setRunModalOutput("Preparing logical suite...");

  try {
    const maxIterations = 1000;
    let steps = 0;
    await ensureSqlOverviewRun();
    while (steps < maxIterations) {
      steps += 1;
      const result = await rpc("rpc_process_sql_batch", {
        p_source: state.conn.source,
        p_batch_size: 1,
      });
      const snapshot = await loadSqlOverviewSnapshotForSource(state.conn.source);
      await refreshOverviewPanels();

      const summary = formatSqlExecutionSummary(snapshot, result, steps);
      setRunModalOutput(summary);
      updateRunModalStatus(snapshot?.overall_status ?? result?.overall_status ?? "RUNNING");
      const total = Number(snapshot?.passed_count ?? 0) + Number(snapshot?.failed_count ?? 0) + Number(snapshot?.pending_count ?? 0);
      const completed = Number(snapshot?.passed_count ?? 0) + Number(snapshot?.failed_count ?? 0);
      setRunModalProgress(completed, total, total ? `${completed}/${total} logical tests settled` : "Waiting for the first logical test to settle.");

      if (state.runLoop.sql.stopRequested) {
        setRunModalOutput(`${summary}\n\nStopped by user.`);
        finalModalStatus = "STOPPED";
        finalModalSubtitle = "Logical execution stopped";
        break;
      }
      if (Number(snapshot?.pending_count ?? result?.pending ?? 0) <= 0) {
        setRunModalOutput(`${summary}\n\nLogical test run completed.`);
        finalModalStatus = snapshot?.overall_status ?? result?.overall_status ?? "SUCCESS";
        finalModalSubtitle = "Logical execution finished";
        break;
      }

      await sleep(300);
    }

    if (steps >= maxIterations) {
      setRunModalOutput(`${$("#run-modal-output")?.textContent || ""}\n\nStopped: max logical-test steps reached.`);
      finalModalStatus = "STOPPED";
      finalModalSubtitle = "Logical execution stopped";
    }
  } catch (e) {
    setRunModalOutput(`Logical auto-run failed: ${e.message}`);
    completeRunModal("ERROR", "Logical execution failed");
  } finally {
    state.runLoop.sql.active = false;
    state.runLoop.sql.stopRequested = false;
    await refreshOverviewPanels();
    if (!$("#run-modal-close")?.disabled) return;
    completeRunModal(finalModalStatus, finalModalSubtitle);
  }
}

async function runGatewaySuiteAuto() {
  if (state.runLoop.gateway.active) {
    setRunModalOutput("Gateway auto-run is already in progress.");
    return;
  }

  state.runLoop.gateway.active = true;
  state.runLoop.gateway.stopRequested = false;
  let finalModalStatus = "SUCCESS";
  let finalModalSubtitle = "Gateway execution finished";
  openRunModal("Gateway Tests", `Source: ${getGatewayOverviewSource()}`, "RUNNING", {
    onStop: () => {
      state.runLoop.gateway.stopRequested = true;
      setRunModalOutput(`${$("#run-modal-output")?.textContent || ""}\n\nStop requested by user.`);
    },
  });
  setRunModalOutput("Preparing gateway suite...");

  try {
    const ensured = await ensureGatewayOverviewSuite();
    const suiteRunId = ensured?.suite_run_id || ensured?.payload?.suite_run_id;
    if (!suiteRunId) {
      throw new Error("Unable to create or reuse a gateway suite.");
    }

    const maxCycles = 1000;
    let cycles = 0;
    while (cycles < maxCycles) {
      cycles += 1;
      const result = await rpc("rpc_run_next_gateway_job_for_suite_v2", {
        p_suite_run_id: suiteRunId,
        p_worker_id: `ui:${state.conn.source}:gateway`,
        p_lease_seconds: 120,
      });

      await sleep(1200);
      const snapshot = await loadGatewaySuiteSnapshotById(suiteRunId);
      await refreshOverviewPanels();

      const summary = formatExecutionSummary("Gateway tests", snapshot, result);
      setRunModalOutput(summary);
      updateRunModalStatus(snapshot?.status ?? result?.suite_status ?? "RUNNING");
      const total = Number(snapshot?.total_jobs ?? 0);
      const completed = Number(snapshot?.passed_jobs ?? 0) + Number(snapshot?.failed_jobs ?? 0);
      setRunModalProgress(completed, total, total ? `${completed}/${total} gateway jobs settled` : "Waiting for the first gateway job to settle.");

      if (state.runLoop.gateway.stopRequested) {
        setRunModalOutput(`${summary}\n\nStopped by user.`);
        finalModalStatus = "STOPPED";
        finalModalSubtitle = "Gateway execution stopped";
        break;
      }
      if (Number(snapshot?.pending_jobs ?? 0) <= 0 && ["SUCCESS", "FAILED", "PARTIAL_FAILURE", "CANCELLED"].includes(String(snapshot?.status || ""))) {
        setRunModalOutput(`${summary}\n\nGateway test run completed.`);
        finalModalStatus = snapshot?.status ?? "SUCCESS";
        finalModalSubtitle = "Gateway execution finished";
        break;
      }
      if (result?.claimed === false && Number(snapshot?.pending_jobs ?? 0) <= 0) {
        setRunModalOutput(`${summary}\n\nNo queued gateway jobs remaining.`);
        finalModalStatus = snapshot?.status ?? result?.suite_status ?? "SUCCESS";
        finalModalSubtitle = "Gateway execution finished";
        break;
      }
    }

    if (cycles >= maxCycles) {
      setRunModalOutput(`${$("#run-modal-output")?.textContent || ""}\n\nStopped: max cycles reached.`);
      finalModalStatus = "STOPPED";
      finalModalSubtitle = "Gateway execution stopped";
    }
  } catch (e) {
    setRunModalOutput(`Gateway auto-run failed: ${e.message}`);
    completeRunModal("ERROR", "Gateway execution failed");
  } finally {
    state.runLoop.gateway.active = false;
    state.runLoop.gateway.stopRequested = false;
    await refreshOverviewPanels();
    if (!$("#run-modal-close")?.disabled) return;
    completeRunModal(finalModalStatus, finalModalSubtitle);
  }
}

async function runSqlOverviewAction(name, body) {
  openRunModal("Logical Tests", `Action: ${name}`, "RUNNING");
  setRunModalOutput(`Running ${name}...`);
  try {
    if (name === "rpc_process_sql_batch") {
      await ensureSqlOverviewRun();
    }
    const result = await rpc(name, body);
    await refreshOverviewPanels();
    const snapshot = await loadSqlOverviewSnapshotForSource(state.conn.source);
    const summary = formatSqlExecutionSummary(snapshot, result);
    setRunModalOutput(summary);
    const total = Number(snapshot?.passed_count ?? 0) + Number(snapshot?.failed_count ?? 0) + Number(snapshot?.pending_count ?? 0);
    const completed = Number(snapshot?.passed_count ?? 0) + Number(snapshot?.failed_count ?? 0);
    setRunModalProgress(completed, total, total ? `${completed}/${total} logical tests settled` : "No logical tests settled yet.");
    completeRunModal(snapshot?.overall_status ?? result?.overall_status ?? "SUCCESS", "Logical action finished");
  } catch (e) {
    setRunModalOutput(`RPC ${name} failed: ${e.message}`);
    completeRunModal("ERROR", "Logical action failed");
  }
}

async function runGatewayOverviewAction(name, body) {
  openRunModal("Gateway Tests", `Action: ${name}`, "RUNNING");
  setRunModalOutput(`Running ${name}...`);
  try {
    const result = await rpc(name, body);
    await sleep(300);
    await refreshOverviewPanels();
    const snapshot = await loadGatewayOverviewSnapshot();
    const summary = formatExecutionSummary("Gateway tests", snapshot, result);
    setRunModalOutput(summary);
    const suite = snapshot?.latest_suite || {};
    const total = Number(suite?.total_jobs ?? 0);
    const completed = Number(suite?.passed_jobs ?? 0) + Number(suite?.failed_jobs ?? 0);
    setRunModalProgress(completed, total, total ? `${completed}/${total} gateway jobs settled` : "No gateway jobs settled yet.");
    completeRunModal(snapshot?.latest_suite?.status ?? result?.overall_status ?? "SUCCESS", "Gateway action finished");
  } catch (e) {
    setRunModalOutput(`RPC ${name} failed: ${e.message}`);
    completeRunModal("ERROR", "Gateway action failed");
  }
}

async function processNextGatewayJobManual() {
  openRunModal("Gateway Tests", "Action: process next gateway job", "RUNNING");
  setRunModalOutput("Preparing gateway suite...");
  try {
    const ensured = await ensureGatewayOverviewSuite();
    const suiteRunId = ensured?.suite_run_id || ensured?.payload?.suite_run_id;
    if (!suiteRunId) throw new Error("Unable to create or reuse a gateway suite.");

    const result = await rpc("rpc_run_next_gateway_job_for_suite_v2", {
      p_suite_run_id: suiteRunId,
      p_worker_id: `ui:${state.conn.source}:gateway`,
      p_lease_seconds: 120,
    });
    await sleep(1200);
    await refreshOverviewPanels();
    const snapshot = await loadGatewaySuiteSnapshotById(suiteRunId);
    const summary = formatExecutionSummary("Gateway tests", snapshot, result);
    setRunModalOutput(summary);
    const total = Number(snapshot?.total_jobs ?? 0);
    const completed = Number(snapshot?.passed_jobs ?? 0) + Number(snapshot?.failed_jobs ?? 0);
    setRunModalProgress(completed, total, total ? `${completed}/${total} gateway jobs settled` : "No gateway jobs settled yet.");
    completeRunModal(snapshot?.status ?? result?.suite_status ?? "SUCCESS", "Gateway job action finished");
  } catch (e) {
    setRunModalOutput(`Gateway batch failed: ${e.message}`);
    completeRunModal("ERROR", "Gateway job action failed");
  }
}

function formatExecutionSummary(label, snapshot, result) {
  const suite = snapshot?.latest_suite || snapshot || {};
  return [
    `${label}`,
    `Status: ${suite?.overall_status ?? suite?.status ?? result?.overall_status ?? result?.suite_status ?? "UNKNOWN"}`,
    `Pending: ${suite?.pending_count ?? suite?.pending_jobs ?? result?.pending ?? 0}`,
    `Passed: ${suite?.passed_count ?? suite?.passed_jobs ?? result?.passed ?? 0}`,
    `Failed: ${suite?.failed_count ?? suite?.failed_jobs ?? result?.failed ?? 0}`,
    "",
    "Payload:",
    JSON.stringify(result ?? {}, null, 2),
  ].join("\n");
}

function formatSqlExecutionSummary(snapshot, result, steps = null) {
  const total = Number(snapshot?.passed_count ?? 0) + Number(snapshot?.failed_count ?? 0) + Number(snapshot?.pending_count ?? 0);
  const lines = [
    "Logical tests",
    `Status: ${snapshot?.overall_status ?? result?.overall_status ?? "UNKNOWN"}`,
    `Total: ${total}`,
    `Pending: ${snapshot?.pending_count ?? result?.pending ?? 0}`,
    `Passed: ${snapshot?.passed_count ?? result?.passed ?? 0}`,
    `Failed: ${snapshot?.failed_count ?? result?.failed ?? 0}`,
  ];
  if (steps !== null) {
    lines.push(`Processed steps: ${steps}`);
  }
  if (Number(result?.processed ?? 0) > 0) {
    lines.push(`Last action: processed ${result.processed} logical test`);
  } else if (result?.message) {
    lines.push(`Last action: ${result.message}`);
  }
  return lines.join("\n");
}

async function loadOverviewRuns() {
  const rows = await rest("sim_run_history", {
    select: "run_id,triggered_by,overall_status,passed_count,failed_count,pending_count,started_at,completed_at,run_metadata",
    triggered_by: `eq.${state.conn.source}`,
    order: "started_at.desc",
    limit: "8",
  });
  return (rows || []).filter((row) => String(row?.run_metadata?.execution_scope || "") === "SQL_SCRIPT");
}

function applyOverviewRunsToDom(runs) {
  renderTable($("#tbl-runs"), [
    "run_id", "triggered_by", "overall_status", "passed_count", "failed_count", "pending_count", "started_at", "completed_at",
  ], runs, {
    overall_status: (v) => badge(v),
    run_id: (v) => `<span class='mono'>${short(v)}</span>`,
  });
}

async function loadSqlOverviewSnapshotForSource(source) {
  const src = String(source || "").trim();
  if (!src) return null;

  const rows = await rest("sim_run_history", {
    select: "run_id,triggered_by,overall_status,passed_count,failed_count,pending_count,started_at,completed_at,run_metadata",
    triggered_by: `eq.${src}`,
    order: "started_at.desc",
    limit: "1",
  });
  const row = rows?.[0] || null;
  if (!row) return null;
  return String(row?.run_metadata?.execution_scope || "") === "SQL_SCRIPT" ? row : null;
}

async function loadGatewaySuiteSnapshotById(suiteRunId) {
  const id = String(suiteRunId || "").trim();
  if (!id) return null;
  const rows = await rest("sim_suite_runs", {
    select: "id,source,execution_mode,module,status,total_jobs,passed_jobs,failed_jobs,pending_jobs,started_at,completed_at,created_at,updated_at,metadata",
    id: `eq.${id}`,
    execution_mode: "eq.GATEWAY_CONFIG",
    limit: "1",
  });
  return rows?.[0] || null;
}

async function loadGatewayOverviewSnapshot() {
  const [activeCases, latestSuiteRows] = await Promise.all([
    rest("sim_permanent_queries", {
      select: "id,module",
      execution_mode: "eq.GATEWAY_CONFIG",
      is_active: "eq.true",
      order: "id.asc",
    }).catch(() => []),
    rest("sim_suite_runs", {
      select: "id,source,execution_mode,module,status,total_jobs,passed_jobs,failed_jobs,pending_jobs,started_at,completed_at,created_at,updated_at,metadata",
      execution_mode: "eq.GATEWAY_CONFIG",
      order: "created_at.desc",
      limit: "1",
    }).catch(() => []),
  ]);

  const activeRows = Array.isArray(activeCases) ? activeCases : [];
  const latestSuite = Array.isArray(latestSuiteRows) ? latestSuiteRows[0] : null;
  const activeModules = new Set(activeRows.map((row) => String(row?.module || "").trim()).filter(Boolean)).size;
  let workflowRows = [];

  return {
    active_case_count: activeRows.length,
    active_module_count: activeModules,
    latest_suite: latestSuite,
    workflow_rows: Array.isArray(workflowRows) ? workflowRows : [],
    workflow_status_counts: {},
  };
}

function applySqlOverviewSnapshot(snapshot) {
  const total = Number(snapshot?.passed_count ?? 0) + Number(snapshot?.failed_count ?? 0) + Number(snapshot?.pending_count ?? 0);
  const completed = Number(snapshot?.passed_count ?? 0) + Number(snapshot?.failed_count ?? 0);
  if ($("#sql-kpi-total")) $("#sql-kpi-total").textContent = total || 0;
  if ($("#sql-kpi-pending")) $("#sql-kpi-pending").textContent = snapshot?.pending_count ?? 0;
  if ($("#sql-kpi-passed")) $("#sql-kpi-passed").textContent = snapshot?.passed_count ?? 0;
  if ($("#sql-kpi-failed")) $("#sql-kpi-failed").textContent = snapshot?.failed_count ?? 0;
  if ($("#sql-run-summary")) {
    $("#sql-run-summary").textContent = total
      ? `${completed}/${total} settled. Latest status: ${snapshot?.overall_status || "UNKNOWN"}.`
      : "No logical run completed yet.";
  }
  if ($("#sql-overall-status")) {
    const status = snapshot?.overall_status || "idle";
    $("#sql-overall-status").textContent = `Status: ${status}`;
    $("#sql-overall-status").className = `status-pill ${status === "SUCCESS" ? "ok" : status === "PARTIAL_FAILURE" || status === "FAILED" || status === "ERROR" ? "err" : "idle"}`;
  }
}

function applyGatewayOverviewSnapshot(snapshot) {
  const activeTotal = Number(snapshot?.active_case_count ?? 0);
  const latestSuite = snapshot?.latest_suite || null;
  const suiteTotal = Number(latestSuite?.total_jobs ?? 0);
  const completed = Number(latestSuite?.passed_jobs ?? 0) + Number(latestSuite?.failed_jobs ?? 0);
  const workflowRows = Array.isArray(snapshot?.workflow_rows) ? snapshot.workflow_rows : [];
  const statusCounts = snapshot?.workflow_status_counts || {};
  if ($("#gateway-kpi-total")) $("#gateway-kpi-total").textContent = activeTotal || 0;
  if ($("#gateway-kpi-pending")) $("#gateway-kpi-pending").textContent = latestSuite?.pending_jobs ?? 0;
  if ($("#gateway-kpi-passed")) $("#gateway-kpi-passed").textContent = latestSuite?.passed_jobs ?? 0;
  if ($("#gateway-kpi-failed")) $("#gateway-kpi-failed").textContent = latestSuite?.failed_jobs ?? 0;
  if ($("#gateway-run-summary")) {
    $("#gateway-run-summary").textContent = suiteTotal
      ? `${completed}/${suiteTotal} settled. Latest suite status: ${latestSuite?.status || "UNKNOWN"}.`
      : activeTotal
        ? `${activeTotal} active gateway cases across ${Number(snapshot?.active_module_count ?? 0)} module(s). No gateway suite completed yet.`
        : "No active gateway suite completed yet.";
  }
  if ($("#gateway-overall-status")) {
    const status = latestSuite?.status || "idle";
    $("#gateway-overall-status").textContent = `Status: ${status}`;
    $("#gateway-overall-status").className = `status-pill ${status === "SUCCESS" ? "ok" : status === "PARTIAL_FAILURE" || status === "FAILED" || status === "ERROR" ? "err" : "idle"}`;
  }
}

function deriveGatewaySuiteDisplayStatus(suite, runningJobCount = 0) {
  const rawStatus = String(suite?.status || "NA");
  const totalJobs = Number(suite?.total_jobs ?? 0);
  const passedJobs = Number(suite?.passed_jobs ?? 0);
  const failedJobs = Number(suite?.failed_jobs ?? 0);
  const pendingJobs = Number(suite?.pending_jobs ?? 0);
  const settledJobs = passedJobs + failedJobs;

  if (rawStatus === "RUNNING") {
    if (Number(runningJobCount || 0) > 0) return "RUNNING";
    if (pendingJobs > 0) return "IDLE_PENDING";
    if (totalJobs > 0 && settledJobs >= totalJobs) {
      if (failedJobs > 0 && passedJobs > 0) return "PARTIAL_FAILURE";
      if (failedJobs > 0) return "FAILED";
      return "SUCCESS";
    }
  }

  if ((rawStatus === "QUEUED" || rawStatus === "RUNNING") && pendingJobs <= 0 && totalJobs > 0 && settledJobs >= totalJobs) {
    if (failedJobs > 0 && passedJobs > 0) return "PARTIAL_FAILURE";
    if (failedJobs > 0) return "FAILED";
    return "SUCCESS";
  }

  return rawStatus;
}

async function ensureGatewayOverviewSuite() {
  return rpc("rpc_ensure_gateway_suite_v2", {
    p_source: getGatewayOverviewSource(),
    p_module: getGatewayModuleFilter(),
  });
}

async function ensureSqlOverviewRun() {
  const snapshot = await loadSqlOverviewSnapshotForSource(state.conn.source);
  if (!snapshot || Number(snapshot.pending_count ?? 0) <= 0) {
    return rpc("rpc_initiate_sql_run", { p_source: state.conn.source });
  }
  return { success: true, reused: true, run_id: snapshot.run_id };
}

async function renderTests() {
  const tpl = $("#tests-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);
  if ($("#drawer-close")) {
    $("#drawer-close").onclick = closeTestDrawer;
  }
  wireTestEditor();
  if ($("#btn-new-sql-test")) {
    $("#btn-new-sql-test").disabled = !state.auth.isAdmin;
    $("#btn-new-sql-test").onclick = () => openNewTestEditor("SQL_SCRIPT");
  }

  const load = async () => {
    const q = $("#test-search").value.trim();
    const severity = $("#severity-filter").value;
    state.tests.pageSize = 10;
    const offset = (state.tests.page - 1) * state.tests.pageSize;
    const params = {
      select: "id,module,functionality_name,severity,is_active,created_at",
      order: "id.asc",
      limit: String(state.tests.pageSize),
      offset: String(offset),
    };
    if (severity) params.severity = `eq.${severity}`;
    if (q) {
      params.or = `(module.ilike.*${q}*,functionality_name.ilike.*${q}*)`;
    }

    const { rows, count } = await restWithCount("sim_permanent_queries", params);
    state.tests.rows = rows;
    state.tests.total = count;

    renderTable($("#tbl-tests"), ["id", "module", "functionality_name", "severity", "is_active", "created_at"], rows, {
      severity: (v) => badge(v || "N/A"),
      id: (v) => `<span class='mono'>${v}</span>`,
      is_active: (v) => (v ? badge("ACTIVE") : badge("INACTIVE")),
    });
    if ($("#tests-meta")) {
      $("#tests-meta").textContent = `Rows: ${rows.length} (total ${count})`;
    }
    if ($("#tests-page-info")) {
      const maxPage = Math.max(1, Math.ceil(count / state.tests.pageSize));
      $("#tests-page-info").textContent = `Page ${state.tests.page} / ${maxPage}`;
    }
    if ($("#tests-prev")) $("#tests-prev").disabled = state.tests.page <= 1;
    if ($("#tests-next")) {
      const maxPage = Math.max(1, Math.ceil(count / state.tests.pageSize));
      $("#tests-next").disabled = state.tests.page >= maxPage;
    }

    const bodyRows = document.querySelectorAll("#tbl-tests tbody tr");
    bodyRows.forEach((tr, idx) => {
      tr.style.cursor = "pointer";
      tr.onclick = () => showTestCase(rows[idx]?.id);
    });
  };

  $("#apply-test-filter").onclick = () => {
    state.tests.page = 1;
    load();
  };
  $("#tests-prev").onclick = () => {
    if (state.tests.page > 1) {
      state.tests.page -= 1;
      load();
    }
  };
  $("#tests-next").onclick = () => {
    state.tests.page += 1;
    load();
  };
  load().catch((e) => {
    if ($("#tbl-tests")) {
      $("#tbl-tests").innerHTML = `<tbody><tr><td>Failed: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
    if ($("#tests-meta")) {
      $("#tests-meta").textContent = "Failed to load tests. Check key/RLS/filter.";
    }
  });
}

async function showTestCase(testId, preferredMode = null) {
  if (!testId) return;
  const title = $("#selected-test-title");
  const script = $("#selected-test-script");
  if (!title || !script) return;
  title.textContent = `Loading test ${testId}...`;
  script.textContent = "Loading...";
  try {
    const rows = await rest("sim_permanent_queries", {
      select: "id,module,functionality_name,test_sql_script,synopsis,expected_result,is_active,severity,execution_mode,target_config_id,gateway_endpoint,gateway_payload_template,test_tags,correction_note",
      id: `eq.${testId}`,
      limit: "1",
    });
    const r = rows?.[0];
    if (!r) {
      title.textContent = `Test ${testId} not found`;
      script.textContent = "";
      openTestDrawer();
      return;
    }
    state.testEditor.currentId = r.id;
    state.testEditor.mode = preferredMode || r.execution_mode || "SQL_SCRIPT";
    populateTestEditor(r);
    openTestDrawer();
  } catch (e) {
    title.textContent = `Failed loading test ${testId}`;
    script.textContent = String(e.message || e);
    openTestDrawer();
  }
}

function wireTestEditor() {
  if ($("#tc-execution-mode")) {
    $("#tc-execution-mode").onchange = () => {
      state.testEditor.mode = $("#tc-execution-mode").value || "SQL_SCRIPT";
      syncTestEditorMode();
    };
  }
  if ($("#btn-save-test-case")) {
    $("#btn-save-test-case").onclick = saveTestCaseFromEditor;
  }
  if ($("#btn-toggle-test-case")) {
    $("#btn-toggle-test-case").onclick = toggleTestCaseFromEditor;
  }
}

function openNewTestEditor(mode) {
  state.testEditor.currentId = null;
  state.testEditor.mode = mode || "SQL_SCRIPT";
  populateTestEditor({
    id: null,
    module: mode === "GATEWAY_CONFIG" ? "LMS" : "",
    functionality_name: "",
    test_sql_script: mode === "GATEWAY_CONFIG" ? "-- gateway test case --" : "",
    synopsis: "",
    expected_result: mode === "GATEWAY_CONFIG" ? { success: true } : {},
    is_active: true,
    severity: "",
    execution_mode: mode || "SQL_SCRIPT",
    target_config_id: "",
    gateway_endpoint: mode === "GATEWAY_CONFIG" ? "/functions/v1/a_crud_universal_pg_function_gateway" : "",
    gateway_payload_template: {},
    test_tags: mode === "GATEWAY_CONFIG" ? ["gateway"] : [],
    correction_note: null,
  });
  openTestDrawer();
}

function populateTestEditor(row) {
  const title = $("#selected-test-title");
  const script = $("#selected-test-script");
  const synopsis = $("#selected-test-synopsis");
  const note = $("#test-editor-note");
  const actions = $("#test-editor-actions");
  const form = $("#test-editor-form");
  const canEdit = Boolean(state.auth.isAdmin);
  const mode = row?.execution_mode || state.testEditor.mode || "SQL_SCRIPT";

  state.testEditor.currentId = row?.id ?? null;
  state.testEditor.mode = mode;

  if (title) {
    title.textContent = row?.id
      ? `#${row.id} | ${row.module || "-"} | ${row.functionality_name || "-"}`
      : `New ${mode === "GATEWAY_CONFIG" ? "Gateway" : "SQL"} Test`;
  }
  if (script) {
    script.textContent = row?.test_sql_script || "-- empty script --";
  }
  if (synopsis) {
    synopsis.textContent = row?.synopsis || "No synopsis written for this test case yet.";
  }
  if (note) {
    note.textContent = canEdit
      ? "Admin edit mode. Save writes through RPCs, not direct table access."
      : "Read-only preview. Admin role is required for create, edit, activate, and deactivate.";
  }
  if (actions) actions.classList.toggle("hidden", !canEdit);
  if (form) form.classList.toggle("hidden", !canEdit);

  setInputValue("#tc-id", row?.id ?? "");
  setInputValue("#tc-module", row?.module ?? "");
  setInputValue("#tc-functionality-name", row?.functionality_name ?? "");
  setInputValue("#tc-execution-mode", mode);
  setInputValue("#tc-severity", row?.severity ?? "");
  setInputValue("#tc-is-active", String(Boolean(row?.is_active ?? true)));
  setInputValue("#tc-synopsis", row?.synopsis ?? "");
  setInputValue("#tc-target-config-id", row?.target_config_id ?? "");
  setInputValue("#tc-gateway-endpoint", row?.gateway_endpoint ?? "");
  setInputValue("#tc-test-sql-script", row?.test_sql_script ?? "");
  setInputValue("#tc-expected-result", stringifyJson(row?.expected_result ?? {}));
  setInputValue("#tc-gateway-payload-template", stringifyJson(row?.gateway_payload_template ?? {}));
  setInputValue("#tc-test-tags", stringifyJson(row?.test_tags ?? []));
  setInputValue("#tc-correction-note", row?.correction_note ? stringifyJson(row.correction_note) : "");

  if ($("#btn-toggle-test-case")) {
    $("#btn-toggle-test-case").textContent = Boolean(row?.is_active ?? true) ? "Deactivate" : "Activate";
    $("#btn-toggle-test-case").disabled = !canEdit || !row?.id;
  }

  syncTestEditorMode();
}

function syncTestEditorMode() {
  const mode = ($("#tc-execution-mode")?.value || state.testEditor.mode || "SQL_SCRIPT").trim();
  state.testEditor.mode = mode;

  const scriptLabel = $("#tc-test-sql-script")?.closest("label");
  const severityLabel = $("#tc-severity")?.closest("label");
  const targetConfigLabel = $("#tc-target-config-id")?.closest("label");
  const gatewayEndpointLabel = $("#tc-gateway-endpoint")?.closest("label");
  const payloadLabel = $("#tc-gateway-payload-template")?.closest("label");
  const preview = $("#selected-test-script");

  const isGateway = mode === "GATEWAY_CONFIG";
  if (scriptLabel) scriptLabel.classList.toggle("hidden", isGateway);
  if (severityLabel) severityLabel.classList.toggle("hidden", isGateway);
  if (targetConfigLabel) targetConfigLabel.classList.toggle("hidden", !isGateway);
  if (gatewayEndpointLabel) gatewayEndpointLabel.classList.toggle("hidden", !isGateway);
  if (payloadLabel) payloadLabel.classList.toggle("hidden", !isGateway);
  if (preview && isGateway && !preview.textContent.trim()) {
    preview.textContent = "-- gateway test case --";
  }
}

function setInputValue(selector, value) {
  const el = $(selector);
  if (el) el.value = value;
}

function stringifyJson(value) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return "";
  }
}

function parseOptionalJsonField(selector, fallback = null) {
  const raw = ($(selector)?.value || "").trim();
  if (!raw) return fallback;
  return JSON.parse(raw);
}

async function saveTestCaseFromEditor() {
  const script = $("#selected-test-script");
  try {
    const mode = ($("#tc-execution-mode")?.value || "SQL_SCRIPT").trim();
    const payload = {
      p_id: toNullableNumber($("#tc-id")?.value),
      p_module: ($("#tc-module")?.value || "").trim() || null,
      p_functionality_name: ($("#tc-functionality-name")?.value || "").trim() || null,
      p_execution_mode: mode,
      p_test_sql_script: ($("#tc-test-sql-script")?.value || "").trim() || null,
      p_expected_result: parseOptionalJsonField("#tc-expected-result", mode === "GATEWAY_CONFIG" ? { success: true } : null),
      p_is_active: ($("#tc-is-active")?.value || "true") === "true",
      p_synopsis: ($("#tc-synopsis")?.value || "").trim() || null,
      p_severity: ($("#tc-severity")?.value || "").trim() || null,
      p_target_config_id: ($("#tc-target-config-id")?.value || "").trim() || null,
      p_gateway_endpoint: ($("#tc-gateway-endpoint")?.value || "").trim() || null,
      p_gateway_payload_template: parseOptionalJsonField("#tc-gateway-payload-template", {}),
      p_test_tags: parseOptionalJsonField("#tc-test-tags", []),
      p_correction_note: parseOptionalJsonField("#tc-correction-note", null),
    };
    if (script) script.textContent = "Saving test case...";
    const res = await rpc("rpc_sim_upsert_test_case", payload);
    const row = res?.row || null;
    if (row?.id) {
      await showTestCase(row.id, row.execution_mode);
      await renderView();
      await showTestCase(row.id, row.execution_mode);
      if (script) script.textContent = row.test_sql_script || "-- empty script --";
    } else if (script) {
      script.textContent = JSON.stringify(res, null, 2);
    }
  } catch (e) {
    if (script) script.textContent = `Save failed: ${e.message}`;
  }
}

async function toggleTestCaseFromEditor() {
  const id = toNullableNumber($("#tc-id")?.value);
  const script = $("#selected-test-script");
  if (!id) return;
  try {
    const next = ($("#tc-is-active")?.value || "true") !== "true";
    if (script) script.textContent = `${next ? "Activating" : "Deactivating"} test case...`;
    await rpc("rpc_sim_set_test_case_active", { p_id: id, p_is_active: next });
    await showTestCase(id);
    await renderView();
    await showTestCase(id);
  } catch (e) {
    if (script) script.textContent = `Toggle failed: ${e.message}`;
  }
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function openTestDrawer() {
  const d = $("#test-drawer");
  if (d) d.classList.add("open");
}

function closeTestDrawer() {
  const d = $("#test-drawer");
  if (d) d.classList.remove("open");
}

async function renderDetails() {
  const tpl = $("#details-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);
  $("#detail-page-size").value = String(state.details.pageSize);

  const load = async () => {
    const id = $("#detail-test-id").value.trim();
    const status = $("#detail-status").value;
    state.details.pageSize = Number($("#detail-page-size").value || 10);
    const offset = (state.details.page - 1) * state.details.pageSize;
    const params = {
      select: "test_id,status,queue_status,execution_time_ms,error_message,updated_at",
      order: "updated_at.desc",
      limit: String(state.details.pageSize),
      offset: String(offset),
    };
    if (id) params.test_id = `eq.${id}`;
    if (status) params.status = `eq.${status.trim().toUpperCase()}`;
    const { rows, count } = await restWithCount("sim_run_details", params);
    state.details.rows = rows;
    state.details.total = count;

    renderTable($("#tbl-details"), ["test_id", "status", "queue_status", "execution_time_ms", "error_message", "updated_at"], rows, {
      status: (v) => badge(v || "NA"),
      queue_status: (v) => badge(v || "NA"),
      error_message: (v) => (v ? `<span title="${escapeHtml(v)}">${escapeHtml(v).slice(0, 90)}</span>` : "-"),
    });
    if ($("#details-meta")) {
      $("#details-meta").textContent = `Rows: ${rows.length} (total ${count})`;
    }
    if ($("#details-page-info")) {
      const maxPage = Math.max(1, Math.ceil(count / state.details.pageSize));
      $("#details-page-info").textContent = `Page ${state.details.page} / ${maxPage}`;
    }
    if ($("#details-prev")) $("#details-prev").disabled = state.details.page <= 1;
    if ($("#details-next")) {
      const maxPage = Math.max(1, Math.ceil(count / state.details.pageSize));
      $("#details-next").disabled = state.details.page >= maxPage;
    }
  };

  $("#apply-detail-filter").onclick = () => {
    state.details.page = 1;
    load();
  };
  $("#detail-page-size").onchange = () => {
    state.details.page = 1;
    load();
  };
  $("#details-prev").onclick = () => {
    if (state.details.page > 1) {
      state.details.page -= 1;
      load();
    }
  };
  $("#details-next").onclick = () => {
    state.details.page += 1;
    load();
  };
  load().catch((e) => {
    if ($("#tbl-details")) {
      $("#tbl-details").innerHTML = `<tbody><tr><td>Failed: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
    if ($("#details-meta")) {
      $("#details-meta").textContent = "Failed to load run details.";
    }
  });
}

async function renderGatewayCases() {
  const tpl = $("#gateway-cases-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);
  if ($("#drawer-close")) {
    $("#drawer-close").onclick = closeTestDrawer;
  }
  wireTestEditor();
  if ($("#btn-new-gw-test")) {
    $("#btn-new-gw-test").disabled = !state.auth.isAdmin;
    $("#btn-new-gw-test").onclick = () => openNewTestEditor("GATEWAY_CONFIG");
  }

  const load = async () => {
    const q = $("#gw-case-search").value.trim();
    const active = $("#gw-case-active").value;
    const role = ($("#gw-case-role").value || "").trim();
    const mergedRows = await loadGatewayCaseCatalog();
    const filtered = mergedRows.filter((row) => {
      if (active && String(Boolean(row?.is_active)) !== active) return false;
      if (role && String(row?.role_context || "").trim().toUpperCase() !== role.toUpperCase()) return false;
      if (q) {
        const hay = [
          row?.functionality_name,
          row?.target_config_id,
          row?.module,
          row?.role_context,
          row?.fixture_plan_name,
        ].map((v) => String(v || "").toLowerCase()).join(" ");
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });

    state.gatewayCases.total = filtered.length;
    const offset = (state.gatewayCases.page - 1) * state.gatewayCases.pageSize;
    const rows = filtered.slice(offset, offset + state.gatewayCases.pageSize);
    state.gatewayCases.rows = rows;

    renderTable($("#tbl-gw-cases"), ["id", "module", "functionality_name", "synopsis", "role_context", "fixture_mode", "target_config_id", "is_active", "created_at"], rows, {
      id: (v) => `<span class='mono'>${v}</span>`,
      synopsis: (v) => {
        const text = String(v || "-");
        return `<span title="${escapeHtml(text)}">${escapeHtml(text).slice(0, 120)}${text.length > 120 ? "..." : ""}</span>`;
      },
      role_context: (v) => badge(v || "NA"),
      fixture_mode: (_v, row) => {
        if (row?.fixture_plan_name) {
          return `<span title="${escapeHtml(String(row.fixture_plan_name))}">${badge(row.fixture_mode || "WORKFLOW")}</span>`;
        }
        return badge(row?.fixture_mode || "PLAIN");
      },
      is_active: (v) => (v ? badge("ACTIVE") : badge("INACTIVE")),
      target_config_id: (v) => `<span class='mono'>${escapeHtml(String(v || "-"))}</span>`,
    });

    if ($("#gw-cases-meta")) {
      const workflowBacked = filtered.filter((row) => Boolean(row?.fixture_plan_name)).length;
      const missingRoleRows = filtered.filter((row) => !row?.role_context).length;
      $("#gw-cases-meta").textContent = `Rows: ${rows.length} (total ${filtered.length}) | workflow-backed: ${workflowBacked} | plain: ${Math.max(filtered.length - workflowBacked, 0)} | role metadata unavailable: ${missingRoleRows}`;
    }
    if ($("#gw-cases-page-info")) {
      const maxPage = Math.max(1, Math.ceil(filtered.length / state.gatewayCases.pageSize));
      $("#gw-cases-page-info").textContent = `Page ${state.gatewayCases.page} / ${maxPage}`;
    }
    if ($("#gw-cases-prev")) $("#gw-cases-prev").disabled = state.gatewayCases.page <= 1;
    if ($("#gw-cases-next")) {
      const maxPage = Math.max(1, Math.ceil(filtered.length / state.gatewayCases.pageSize));
      $("#gw-cases-next").disabled = state.gatewayCases.page >= maxPage;
    }

    const bodyRows = document.querySelectorAll("#tbl-gw-cases tbody tr");
    bodyRows.forEach((tr, idx) => {
      tr.style.cursor = "pointer";
      tr.onclick = () => showTestCase(rows[idx]?.id, "GATEWAY_CONFIG");
    });
  };

  $("#apply-gw-case-filter").onclick = () => {
    state.gatewayCases.page = 1;
    load();
  };
  $("#gw-cases-prev").onclick = () => {
    if (state.gatewayCases.page > 1) {
      state.gatewayCases.page -= 1;
      load();
    }
  };
  $("#gw-cases-next").onclick = () => {
    state.gatewayCases.page += 1;
    load();
  };

  load().catch((e) => {
    if ($("#tbl-gw-cases")) {
      $("#tbl-gw-cases").innerHTML = `<tbody><tr><td>Failed: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
    if ($("#gw-cases-meta")) {
      $("#gw-cases-meta").textContent = "Failed to load gateway test cases.";
    }
  });
}

async function renderDocs() {
  const tpl = $("#docs-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);

  const sections = {
    overview: $("#docs-overview"),
    logical: $("#docs-logical"),
    gateway: $("#docs-gateway"),
    fixtures: $("#docs-fixtures"),
    debugging: $("#docs-debugging"),
  };

  const activate = (key) => {
    Object.entries(sections).forEach(([name, el]) => {
      if (!el) return;
      el.classList.toggle("hidden", name !== key);
    });
    document.querySelectorAll(".docs-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.docsTab === key);
    });
  };

  document.querySelectorAll(".docs-tab-btn").forEach((btn) => {
    btn.onclick = () => activate(btn.dataset.docsTab);
  });

  activate("overview");
}

async function renderGatewayRuns() {
  const tpl = $("#gateway-runs-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);
  const detailPanel = $("#gw-job-detail");

  const loadSuiteMetrics = async () => {
    const payload = await rpc("rpc_get_suite_run_metrics_v2", { p_module: getGatewayModuleFilter() });
    return payload?.metrics || {};
  };

  const loadSuiteRows = async () => {
    const payload = await rpc("rpc_list_suite_runs_v2", {
      p_status: null,
      p_module: getGatewayModuleFilter(),
      p_limit: 20,
      p_offset: 0,
    });
    return Array.isArray(payload?.rows) ? payload.rows : [];
  };

  const loadResults = async () => {
    let suiteRunId = ($("#gw-result-run-id").value || "").trim();
    if (!suiteRunId) {
      const latestRuns = await loadSuiteRows();
      suiteRunId = String(latestRuns?.[0]?.id || "");
    }

    if (!suiteRunId) {
      renderTable($("#tbl-gw-results"), ["job_id", "test_case_id", "job_status", "passed", "execution_time_ms", "target_config_id", "error_message", "updated_at"], []);
      if ($("#gw-results-meta")) $("#gw-results-meta").textContent = "No runs available yet.";
      if ($("#gw-results-page-info")) $("#gw-results-page-info").textContent = "Page 0 of 0";
      return;
    }

    const [suiteRows, jobPage] = await Promise.all([
      rest("sim_suite_runs", {
        select: "id,source,module,status,total_jobs,passed_jobs,failed_jobs,pending_jobs,started_at,completed_at,updated_at",
        id: `eq.${suiteRunId}`,
        execution_mode: "eq.GATEWAY_CONFIG",
        limit: "1",
      }),
      restWithCount("sim_test_jobs", {
        select: "id,suite_run_id,test_case_id,status,result_summary,payload,error_message,updated_at,created_at",
        suite_run_id: `eq.${suiteRunId}`,
        ...(buildGatewayResultStatusFilter($("#gw-result-pass-filter").value)),
        order: "created_at.desc",
        limit: String(state.gatewayRuns.resultsPageSize),
        offset: String((state.gatewayRuns.resultsPage - 1) * state.gatewayRuns.resultsPageSize),
      }),
    ]);

    const suite = Array.isArray(suiteRows) ? (suiteRows[0] || {}) : {};
    const jobs = Array.isArray(jobPage?.rows) ? jobPage.rows : [];
    const passFilter = $("#gw-result-pass-filter").value;
    state.gatewayRuns.resultsTotal = Number(jobPage?.count ?? jobs.length);

    const resultRows = await Promise.all(jobs.map(async (job) => {
      try {
        const payload = await rpc("rpc_get_test_job_result_v2", { p_job_id: job.id });
        const result = payload?.result || {};
        return {
          job_id: job.id,
          test_case_id: job.test_case_id,
          job_status: job.status,
          passed: typeof result?.passed === "boolean" ? result.passed : null,
          execution_time_ms: result?.execution_time_ms ?? job?.result_summary?.execution_time_ms ?? null,
          target_config_id: job?.payload?.target_config_id ?? null,
          error_message: result?.error_message ?? job?.error_message ?? null,
          updated_at: result?.updated_at ?? job?.updated_at ?? null,
          _detail: {
            suite,
            job,
            result,
            rawPayload: payload,
          },
        };
      } catch {
        return {
          job_id: job.id,
          test_case_id: job.test_case_id,
          job_status: job.status,
          passed: null,
          execution_time_ms: job?.result_summary?.execution_time_ms ?? null,
          target_config_id: job?.payload?.target_config_id ?? null,
          error_message: job?.error_message ?? "Result lookup failed",
          updated_at: job?.updated_at ?? null,
          _detail: {
            suite,
            job,
            result: {},
            rawPayload: null,
          },
        };
      }
    }));

    const totalPages = Math.max(1, Math.ceil(state.gatewayRuns.resultsTotal / state.gatewayRuns.resultsPageSize));
    if (state.gatewayRuns.resultsPage > totalPages) {
      state.gatewayRuns.resultsPage = totalPages;
      return loadResults();
    }

    renderTable($("#tbl-gw-results"), ["job_id", "test_case_id", "job_status", "passed", "execution_time_ms", "target_config_id", "error_message", "updated_at"], resultRows, {
      job_status: (v) => badge(v || "NA"),
      job_id: (v) => `<span class='mono'>${short(String(v || ""))}</span>`,
      passed: (v) => v === null ? "-" : badge(v ? "PASS" : "FAIL"),
      target_config_id: (v) => `<span class='mono'>${escapeHtml(String(v || "-"))}</span>`,
      error_message: (v) => (v ? `<span title="${escapeHtml(v)}">${escapeHtml(v).slice(0, 96)}</span>` : "-"),
    });
    if ($("#gw-results-meta")) {
      $("#gw-results-meta").textContent = `Suite ${suiteRunId} | Status: ${deriveGatewaySuiteDisplayStatus(suite)} | Jobs: ${state.gatewayRuns.resultsTotal} | source: sim_test_jobs + rpc_get_test_job_result_v2`;
    }
    if ($("#gw-results-page-info")) {
      $("#gw-results-page-info").textContent = `Page ${state.gatewayRuns.resultsPage} of ${totalPages}`;
    }

    if (detailPanel) {
      detailPanel.textContent = resultRows.length
        ? "Click a run-result row to inspect queue-native execution detail."
        : "No gateway jobs matched the current filter.";
    }

    const resultBodyRows = document.querySelectorAll("#tbl-gw-results tbody tr");
    resultBodyRows.forEach((tr, idx) => {
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        const row = resultRows[idx];
        if (!row || !detailPanel) return;
        detailPanel.textContent = JSON.stringify({
          suite: {
            id: row._detail?.suite?.id ?? suiteRunId,
            status: row._detail?.suite?.status ?? null,
            source: row._detail?.suite?.source ?? null,
            module: row._detail?.suite?.module ?? null,
            total_jobs: row._detail?.suite?.total_jobs ?? null,
            passed_jobs: row._detail?.suite?.passed_jobs ?? null,
            failed_jobs: row._detail?.suite?.failed_jobs ?? null,
            pending_jobs: row._detail?.suite?.pending_jobs ?? null,
          },
          job: {
            id: row._detail?.job?.id ?? row.job_id,
            test_case_id: row._detail?.job?.test_case_id ?? row.test_case_id,
            status: row._detail?.job?.status ?? row.job_status,
            execution_mode: row._detail?.job?.execution_mode ?? null,
            module: row._detail?.job?.module ?? null,
            endpoint_key: row._detail?.job?.endpoint_key ?? null,
            priority: row._detail?.job?.priority ?? null,
            attempt_no: row._detail?.job?.attempt_no ?? null,
            max_attempts: row._detail?.job?.max_attempts ?? null,
            correlation_id: row._detail?.job?.correlation_id ?? null,
            worker_id: row._detail?.job?.worker_id ?? null,
            lease_expires_at: row._detail?.job?.lease_expires_at ?? null,
            started_at: row._detail?.job?.started_at ?? null,
            completed_at: row._detail?.job?.completed_at ?? null,
            updated_at: row._detail?.job?.updated_at ?? row.updated_at,
            target_config_id: row._detail?.job?.payload?.target_config_id ?? row.target_config_id,
            gateway_function: row._detail?.job?.payload?.gateway_function ?? null,
            role_context: row._detail?.job?.payload?.role_context ?? null,
            payload: row._detail?.job?.payload ?? null,
            result_summary: row._detail?.job?.result_summary ?? null,
          },
          result: {
            passed: row._detail?.result?.passed ?? row.passed,
            execution_time_ms: row._detail?.result?.execution_time_ms ?? row.execution_time_ms,
            error_message: row._detail?.result?.error_message ?? row.error_message,
            actual: row._detail?.result?.actual ?? null,
            expected: row._detail?.result?.expected ?? null,
            runner_response: row._detail?.result?.runner_response ?? null,
            updated_at: row._detail?.result?.updated_at ?? row.updated_at,
          },
        }, null, 2);
      };
    });

  };

  const loadAll = async () => {
    const [runs, metrics] = await Promise.all([
      loadSuiteRows(),
      loadSuiteMetrics(),
    ]);
    const runIds = runs.map((row) => String(row?.id || "")).filter(Boolean);
    let runningCounts = new Map();
    if (runIds.length) {
      const runningRows = await rest("sim_test_jobs", {
        select: "suite_run_id",
        suite_run_id: `in.(${runIds.join(",")})`,
        status: "eq.RUNNING",
        limit: "500",
      }).catch(() => []);
      runningCounts = (runningRows || []).reduce((acc, row) => {
        const key = String(row?.suite_run_id || "");
        acc.set(key, Number(acc.get(key) || 0) + 1);
        return acc;
      }, new Map());
    }

    const displayRuns = runs.map((row) => ({
      ...row,
      raw_status: row?.status ?? null,
      status: deriveGatewaySuiteDisplayStatus(row, runningCounts.get(String(row?.id || "")) || 0),
    }));
    const latest = runs[0] || {};
    if ($("#gw-kpi-runs")) $("#gw-kpi-runs").textContent = metrics.total_suites ?? runs.length;
    if ($("#gw-kpi-total")) $("#gw-kpi-total").textContent = latest.total_jobs ?? metrics.total_jobs ?? "-";
    if ($("#gw-kpi-passed")) $("#gw-kpi-passed").textContent = latest.passed_jobs ?? metrics.passed_jobs ?? "-";
    if ($("#gw-kpi-failed")) $("#gw-kpi-failed").textContent = latest.failed_jobs ?? metrics.failed_jobs ?? "-";

    renderTable($("#tbl-gw-runs"), ["id", "status", "source", "started_at", "completed_at", "total_jobs", "passed_jobs", "failed_jobs", "pending_jobs"], displayRuns, {
      status: (v) => badge(v || "NA"),
      id: (v) => `<span class='mono'>${short(String(v || ""))}</span>`,
    });

    const bodyRows = document.querySelectorAll("#tbl-gw-runs tbody tr");
    bodyRows.forEach((tr, idx) => {
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        const id = runs[idx]?.id;
        if (!id) return;
        $("#gw-result-run-id").value = String(id);
        loadResults().catch((e) => {
          if ($("#gw-results-meta")) $("#gw-results-meta").textContent = `Failed to load results: ${e.message}`;
        });
      };
    });

    await loadResults();
  };

  $("#reload-gw-runs").onclick = () => {
    loadAll().catch((e) => {
      if ($("#gw-results-meta")) $("#gw-results-meta").textContent = `Reload failed: ${e.message}`;
    });
  };
  $("#apply-gw-result-filter").onclick = () => {
    state.gatewayRuns.resultsPage = 1;
    loadResults().catch((e) => {
      if ($("#gw-results-meta")) $("#gw-results-meta").textContent = `Result load failed: ${e.message}`;
    });
  };
  if ($("#gw-result-page-size")) {
    $("#gw-result-page-size").value = String(state.gatewayRuns.resultsPageSize);
    $("#gw-result-page-size").onchange = () => {
      state.gatewayRuns.resultsPageSize = Number($("#gw-result-page-size").value || 10);
      state.gatewayRuns.resultsPage = 1;
      loadResults().catch((e) => {
        if ($("#gw-results-meta")) $("#gw-results-meta").textContent = `Result load failed: ${e.message}`;
      });
    };
  }
  if ($("#gw-results-prev")) {
    $("#gw-results-prev").onclick = () => {
      if (state.gatewayRuns.resultsPage > 1) {
        state.gatewayRuns.resultsPage -= 1;
        loadResults().catch((e) => {
          if ($("#gw-results-meta")) $("#gw-results-meta").textContent = `Result load failed: ${e.message}`;
        });
      }
    };
  }
  if ($("#gw-results-next")) {
    $("#gw-results-next").onclick = () => {
      const totalPages = Math.max(1, Math.ceil((state.gatewayRuns.resultsTotal || 0) / state.gatewayRuns.resultsPageSize));
      if (state.gatewayRuns.resultsPage < totalPages) {
        state.gatewayRuns.resultsPage += 1;
        loadResults().catch((e) => {
          if ($("#gw-results-meta")) $("#gw-results-meta").textContent = `Result load failed: ${e.message}`;
        });
      }
    };
  }

  loadAll().catch((e) => {
    if ($("#tbl-gw-runs")) {
      $("#tbl-gw-runs").innerHTML = `<tbody><tr><td>Failed: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
    if ($("#gw-results-meta")) {
      $("#gw-results-meta").textContent = "Failed to load gateway runs.";
    }
  });
}

async function renderSettings() {
  const tpl = $("#settings-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);
  hydrateConnectionInputs();
  bindConnection();

  if ($("#gw-runner-module")) $("#gw-runner-module").value = state.gatewayRunner.module;
  if ($("#gw-runner-worker-id")) $("#gw-runner-worker-id").value = state.gatewayRunner.workerId;
  if ($("#btn-gw-runner-clear")) {
    $("#btn-gw-runner-clear").onclick = () => {
      if ($("#gw-runner-output")) $("#gw-runner-output").textContent = "No gateway run started.";
    };
  }
  const gatewayRunnerButtons = [
    "#btn-gw-runner-ensure",
    "#btn-gw-runner-next",
    "#btn-gw-runner-exec",
  ];
  if (!state.auth.isAdmin) {
    gatewayRunnerButtons.forEach((sel) => {
      if ($(sel)) $(sel).disabled = true;
    });
    if ($("#gw-runner-output")) {
      $("#gw-runner-output").textContent = "Admin role required for gateway runner execution.";
    }
  }
  if ($("#btn-gw-runner-ensure")) {
    $("#btn-gw-runner-ensure").onclick = async () => {
      const output = $("#gw-runner-output");
      try {
        const res = await ensureSettingsGatewaySuite();
        if ($("#gw-runner-suite-id") && res?.suite_run_id) {
          $("#gw-runner-suite-id").value = String(res.suite_run_id);
        }
        await refreshOverviewPanels().catch(() => {});
        if (output) output.textContent = JSON.stringify(res, null, 2);
      } catch (e) {
        if (output) output.textContent = `Ensure suite failed: ${e.message}`;
      }
    };
  }
  if ($("#btn-gw-runner-next")) {
    $("#btn-gw-runner-next").onclick = async () => {
      const output = $("#gw-runner-output");
      try {
        const suiteRunId = await resolveSettingsGatewaySuiteId();
        const workerId = getSettingsGatewayWorkerId();
        const res = await rpc("rpc_run_next_gateway_job_for_suite_v2", {
          p_suite_run_id: suiteRunId,
          p_worker_id: workerId,
          p_lease_seconds: 120,
        });
        const snapshot = await loadGatewaySuiteSnapshotById(suiteRunId);
        await refreshOverviewPanels().catch(() => {});
        if (output) output.textContent = formatExecutionSummary("Gateway tests", snapshot, res);
      } catch (e) {
        if (output) output.textContent = `Run next job failed: ${e.message}`;
      }
    };
  }
  if ($("#btn-gw-runner-exec")) {
    $("#btn-gw-runner-exec").onclick = async () => {
      const output = $("#gw-runner-output");
      try {
        const suiteRunId = await resolveSettingsGatewaySuiteId();
        const workerId = getSettingsGatewayWorkerId();
        const maxCycles = 1000;
        let cycles = 0;
        let lastResult = null;
        while (cycles < maxCycles) {
          cycles += 1;
          lastResult = await rpc("rpc_run_next_gateway_job_for_suite_v2", {
            p_suite_run_id: suiteRunId,
            p_worker_id: workerId,
            p_lease_seconds: 120,
          });
          await sleep(1200);
          const snapshot = await loadGatewaySuiteSnapshotById(suiteRunId);
          if (output) output.textContent = formatExecutionSummary("Gateway tests", snapshot, lastResult);
          if (Number(snapshot?.pending_jobs ?? 0) <= 0 && ["SUCCESS", "FAILED", "PARTIAL_FAILURE", "CANCELLED"].includes(String(snapshot?.status || ""))) {
            if (output) output.textContent += "\n\nGateway test run completed.";
            break;
          }
          if (lastResult?.claimed === false && Number(snapshot?.pending_jobs ?? 0) <= 0) {
            if (output) output.textContent += "\n\nNo queued gateway jobs remaining.";
            break;
          }
        }
        await refreshOverviewPanels().catch(() => {});
        if (cycles >= maxCycles && output) {
          output.textContent += "\n\nStopped: max cycles reached.";
        }
      } catch (e) {
        if (output) output.textContent = `Gateway run failed: ${e.message}`;
      }
    };
  }

  const retryBtn = $("#btn-retry-alert");
  const saveRecipientBtn = $("#btn-save-recipient");
  const delRecipientBtn = $("#btn-delete-recipient");
  const forceBtn = $("#btn-force-alert-test");

  if (!state.auth.isAdmin) {
    retryBtn.disabled = true;
    saveRecipientBtn.disabled = true;
    delRecipientBtn.disabled = true;
    forceBtn.disabled = true;
  }

  forceBtn.onclick = async () => {
    if (!state.auth.isAdmin) return;
    const out = $("#alert-force-output");
    try {
      if (out) out.textContent = "Triggering force alert dispatch...";
      const res = await rpc("rpc_sim_force_alert_dispatch", { p_dry_run: false, p_limit: 20 });
      if (out) out.textContent = JSON.stringify(res, null, 2);
      await loadAlerts();
    } catch (e) {
      if (out) out.textContent = `Force alert test failed: ${e.message}`;
    }
  };

  retryBtn.onclick = async () => {
    if (!state.auth.isAdmin) return;
    const id = Number($("#retry-alert-id").value || 0);
    if (!id) return alert("Enter alert queue id");
    try {
      await rpc("rpc_sim_retry_alert", { p_alert_id: id });
      await loadAlerts();
    } catch (e) {
      alert(`Retry failed: ${e.message}`);
    }
  };

  saveRecipientBtn.onclick = async () => {
    if (!state.auth.isAdmin) return;
    const payload = {
      p_name: $("#rcp-name").value.trim(),
      p_email: $("#rcp-email").value.trim(),
      p_severity_min: $("#rcp-severity").value || null,
      p_module_filter: $("#rcp-module").value.trim() || null,
      p_is_active: true,
    };
    if (!payload.p_name || !payload.p_email) return alert("Name and email required");
    try {
      await rpc("rpc_sim_upsert_alert_recipient", payload);
      ["#rcp-name", "#rcp-email", "#rcp-module"].forEach((id) => ($(id).value = ""));
      $("#rcp-severity").value = "";
      await loadRecipients();
    } catch (e) {
      alert(`Save recipient failed: ${e.message}`);
    }
  };

  delRecipientBtn.onclick = async () => {
    if (!state.auth.isAdmin) return;
    const id = Number($("#delete-recipient-id").value || 0);
    if (!id) return alert("Enter recipient id");
    try {
      await rpc("rpc_sim_delete_alert_recipient", { p_recipient_id: id });
      $("#delete-recipient-id").value = "";
      await loadRecipients();
    } catch (e) {
      alert(`Delete recipient failed: ${e.message}`);
    }
  };

  $("#reload-recipients").onclick = loadRecipients;

  async function loadAlerts() {
    try {
      const rows = await rest("sim_failure_alert_queue", {
        select: "id,run_id,test_id,severity,delivery_status,retry_count,last_error,created_at,sent_at",
        order: "created_at.desc",
        limit: "200",
      });
      renderTable($("#tbl-alerts"), ["id", "test_id", "severity", "delivery_status", "retry_count", "last_error", "created_at", "sent_at"], rows, {
        delivery_status: (v) => badge(v || "NA"),
        severity: (v) => badge(v || "NA"),
        last_error: (v) => (v ? escapeHtml(v).slice(0, 80) : "-"),
      });
    } catch (e) {
      $("#tbl-alerts").innerHTML = `<tbody><tr><td>Queue not available: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
  }

  async function loadRecipients() {
    try {
      const rows = await rest("sim_alert_recipients", {
        select: "id,name,email,is_active,severity_min,module_filter,updated_at",
        order: "updated_at.desc",
        limit: "200",
      });
      renderTable($("#tbl-recipients"), ["id", "name", "email", "is_active", "severity_min", "module_filter", "updated_at"], rows, {
        is_active: (v) => badge(v ? "ACTIVE" : "INACTIVE"),
        severity_min: (v) => badge(v || "ALL"),
      });
    } catch (e) {
      $("#tbl-recipients").innerHTML = `<tbody><tr><td>Recipients not available: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
  }

  await loadAlerts();
  await loadRecipients();
  await wireAdminSections();
}

async function wireAdminSections() {
  if (!$("#btn-apply-mute")) return;
  if ($("#cron-schedule")) $("#cron-schedule").value = "*/2 * * * *";
  if (!state.auth.isAdmin) {
    if ($("#admin-output")) $("#admin-output").textContent = "Admin role required.";
    if ($("#maintenance-output")) $("#maintenance-output").textContent = "Admin role required.";
    if ($("#btn-apply-mute")) $("#btn-apply-mute").disabled = true;
    if ($("#btn-maintenance-reload")) $("#btn-maintenance-reload").disabled = true;
    if ($("#btn-requeue-gateway-jobs")) $("#btn-requeue-gateway-jobs").disabled = true;
    if ($("#btn-purge-sim-data")) $("#btn-purge-sim-data").disabled = true;
    if ($("#btn-save-cron")) $("#btn-save-cron").disabled = true;
    if ($("#btn-save-webhook")) $("#btn-save-webhook").disabled = true;
    if ($("#btn-reload-webhook")) $("#btn-reload-webhook").disabled = true;
    if ($("#btn-test-webhook")) $("#btn-test-webhook").disabled = true;
    if ($("#btn-upsert-allow")) $("#btn-upsert-allow").disabled = true;
    if ($("#btn-enable-allow")) $("#btn-enable-allow").disabled = true;
    if ($("#btn-disable-allow")) $("#btn-disable-allow").disabled = true;
    return;
  }

  const btn = $("#btn-apply-mute");
  if ($("#cron-schedule")) $("#cron-schedule").value = "*/2 * * * *";
  btn.onclick = async () => {
    const action = $("#mute-action").value;
    const severity = $("#mute-severity").value;
    const muteUntilRaw = $("#mute-until").value;
    const reason = $("#mute-reason").value.trim() || null;
    const payload = {
      p_action: action,
      p_severity: severity,
      p_mute_until: muteUntilRaw ? new Date(muteUntilRaw).toISOString() : null,
      p_reason: reason,
    };
    try {
      const res = await rpc("rpc_sim_set_alert_mute", payload);
      $("#admin-output").textContent = JSON.stringify(res, null, 2);
      await loadMutes();
    } catch (e) {
      $("#admin-output").textContent = `Mute action failed: ${e.message}`;
    }
  };

  async function loadMutes() {
    try {
      const rows = await rest("sim_alert_mute_rules", {
        select: "id,severity,mute_until,reason,is_active,updated_at",
        order: "updated_at.desc",
        limit: "200",
      });
      renderTable($("#tbl-mutes"), ["id", "severity", "mute_until", "reason", "is_active", "updated_at"], rows, {
        severity: (v) => badge(v || "ALL"),
        is_active: (v) => badge(v ? "ACTIVE" : "INACTIVE"),
      });
    } catch (e) {
      $("#tbl-mutes").innerHTML = `<tbody><tr><td>Mute table not available: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
  }

  async function loadMaintenanceSummary() {
    const output = $("#maintenance-output");
    if (!output) return;
    try {
      const keepDays = Number($("#maintenance-keep-days").value || 1);
      const staleMinutes = Number($("#maintenance-stale-minutes").value || 15);
      const res = await rpc("rpc_sim_get_maintenance_summary", {
        p_keep_days: keepDays,
        p_stale_minutes: staleMinutes,
      });
      output.textContent = JSON.stringify(res, null, 2);
    } catch (e) {
      output.textContent = `Maintenance summary failed: ${e.message}`;
    }
  }

  if ($("#btn-maintenance-reload")) {
    $("#btn-maintenance-reload").onclick = loadMaintenanceSummary;
  }

  if ($("#btn-requeue-gateway-jobs")) {
    $("#btn-requeue-gateway-jobs").onclick = async () => {
      const output = $("#maintenance-output");
      try {
        const staleMinutes = Number($("#maintenance-stale-minutes").value || 15);
        const res = await rpc("rpc_sim_requeue_stuck_gateway_jobs", {
          p_stale_minutes: staleMinutes,
        });
        output.textContent = JSON.stringify(res, null, 2);
        await loadMaintenanceSummary();
      } catch (e) {
        output.textContent = `Gateway recovery failed: ${e.message}`;
      }
    };
  }

  if ($("#btn-purge-sim-data")) {
    $("#btn-purge-sim-data").onclick = async () => {
      const output = $("#maintenance-output");
      try {
        const keepDays = Number($("#maintenance-keep-days").value || 1);
        const res = await rpc("rpc_sim_purge_completed_test_data", {
          p_keep_days: keepDays,
        });
        output.textContent = JSON.stringify(res, null, 2);
        await loadMaintenanceSummary();
      } catch (e) {
        output.textContent = `Purge failed: ${e.message}`;
      }
    };
  }

  $("#btn-save-cron").onclick = async () => {
    try {
      const schedule = ($("#cron-schedule").value || "*/2 * * * *").trim();
      const enabled = ($("#cron-enabled").value || "true") === "true";
      const res = await rpc("rpc_sim_upsert_alert_dispatch_cron", {
        p_schedule: schedule,
        p_enabled: enabled,
      });
      $("#cron-output").textContent = JSON.stringify(res, null, 2);
    } catch (e) {
      $("#cron-output").textContent = `Cron save failed: ${e.message}`;
    }
  };

  async function loadWebhookConfig() {
    if (!$("#webhook-output")) return;
    try {
      const cfg = await rpc("rpc_sim_get_alert_webhook_config", {});
      if (!cfg || typeof cfg !== "object") throw new Error("Empty config response");
      if ($("#webhook-enabled")) $("#webhook-enabled").value = String(Boolean(cfg.is_enabled));
      if ($("#webhook-endpoint")) $("#webhook-endpoint").value = cfg.endpoint_url || "";
      if ($("#webhook-debounce")) $("#webhook-debounce").value = String(cfg.debounce_seconds ?? 20);
      if ($("#webhook-timeout")) $("#webhook-timeout").value = String(cfg.request_timeout_ms ?? 5000);
      if ($("#webhook-batch-size")) $("#webhook-batch-size").value = String(cfg.max_batch_size ?? 100);
      if ($("#webhook-auth-name")) $("#webhook-auth-name").value = cfg.auth_header_name || "";
      if ($("#webhook-last-fired")) $("#webhook-last-fired").value = cfg.last_fired_at || "";
      if ($("#webhook-auth-value") && !cfg.has_auth_header_value) $("#webhook-auth-value").value = "";
      $("#webhook-output").textContent = "Webhook config loaded.";
    } catch (e) {
      $("#webhook-output").textContent = `Webhook config unavailable: ${e.message}`;
    }
  }

  if ($("#btn-save-webhook")) {
    $("#btn-save-webhook").onclick = async () => {
      try {
        const payload = {
          p_is_enabled: ($("#webhook-enabled").value || "false") === "true",
          p_endpoint_url: ($("#webhook-endpoint").value || "").trim(),
          p_auth_header_name: ($("#webhook-auth-name").value || "").trim() || null,
          p_auth_header_value: ($("#webhook-auth-value").value || "").trim() || null,
          p_debounce_seconds: Number($("#webhook-debounce").value || 20),
          p_request_timeout_ms: Number($("#webhook-timeout").value || 5000),
          p_max_batch_size: Number($("#webhook-batch-size").value || 100),
        };
        if (payload.p_is_enabled && !payload.p_endpoint_url) {
          throw new Error("Endpoint URL is required when webhook is enabled");
        }
        const res = await rpc("rpc_sim_upsert_alert_webhook_config", payload);
        $("#webhook-output").textContent = JSON.stringify(res, null, 2);
        await loadWebhookConfig();
      } catch (e) {
        $("#webhook-output").textContent = `Save webhook config failed: ${e.message}`;
      }
    };
  }

  if ($("#btn-reload-webhook")) {
    $("#btn-reload-webhook").onclick = loadWebhookConfig;
  }

  if ($("#btn-test-webhook")) {
    $("#btn-test-webhook").onclick = async () => {
      try {
        const res = await rpc("rpc_sim_force_alert_webhook", { p_force: true, p_source: "ui_manual_test" });
        $("#webhook-output").textContent = JSON.stringify(res, null, 2);
      } catch (e) {
        $("#webhook-output").textContent = `Force webhook failed: ${e.message}`;
      }
    };
  }

  async function loadAllowlist() {
    try {
      const rows = await rpc("rpc_sim_list_signup_allowlist", { p_limit: 300 });
      renderTable($("#tbl-allowlist"), ["id", "email", "full_name", "intended_role", "is_active", "auth_user_id", "consumed_at", "updated_at"], rows || [], {
        intended_role: (v) => badge(v || "developer"),
        is_active: (v) => badge(v ? "ACTIVE" : "INACTIVE"),
      });
    } catch (e) {
      $("#tbl-allowlist").innerHTML = `<tbody><tr><td>Allowlist not available: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
  }

  $("#btn-upsert-allow").onclick = async () => {
    try {
      const payload = {
        p_email: $("#allow-email").value.trim(),
        p_full_name: $("#allow-name").value.trim() || null,
        p_intended_role: $("#allow-role").value,
        p_is_active: $("#allow-active").value === "true",
      };
      if (!payload.p_email) throw new Error("Email is required");
      const res = await rpc("rpc_sim_upsert_signup_allowlist", payload);
      $("#admin-output").textContent = JSON.stringify(res, null, 2);
      await loadAllowlist();
    } catch (e) {
      $("#admin-output").textContent = `Allowlist upsert failed: ${e.message}`;
    }
  };

  $("#btn-enable-allow").onclick = async () => {
    try {
      const id = Number($("#allow-toggle-id").value || 0);
      if (!id) throw new Error("Allowlist ID is required");
      const res = await rpc("rpc_sim_set_signup_allowlist_active", { p_id: id, p_is_active: true });
      $("#admin-output").textContent = JSON.stringify(res, null, 2);
      await loadAllowlist();
    } catch (e) {
      $("#admin-output").textContent = `Enable failed: ${e.message}`;
    }
  };

  $("#btn-disable-allow").onclick = async () => {
    try {
      const id = Number($("#allow-toggle-id").value || 0);
      if (!id) throw new Error("Allowlist ID is required");
      const res = await rpc("rpc_sim_set_signup_allowlist_active", { p_id: id, p_is_active: false });
      $("#admin-output").textContent = JSON.stringify(res, null, 2);
      await loadAllowlist();
    } catch (e) {
      $("#admin-output").textContent = `Disable failed: ${e.message}`;
    }
  };

  $("#btn-reload-allow").onclick = loadAllowlist;

  await loadMutes();
  await loadMaintenanceSummary();
  await loadWebhookConfig();
  await loadAllowlist();
}

function renderTable(el, cols, rows, formatters = {}) {
  if (!el) return;
  const head = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(labelForColumn(c))}</th>`).join("")}</tr></thead>`;
  const body = rows.length
    ? `<tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${formatters[c] ? formatters[c](r[c], r) : escapeHtml(String(r[c] ?? "-"))}</td>`).join("")}</tr>`).join("")}</tbody>`
    : `<tbody><tr><td colspan="${cols.length}">No data</td></tr></tbody>`;
  el.innerHTML = head + body;
}

function badge(v) {
  const clean = escapeHtml(String(v));
  return `<span class="badge ${clean}">${clean}</span>`;
}

async function runRpc(name, body) {
  openRunModal("Execution", `Action: ${name}`, "RUNNING");
  setRunModalOutput(`Running ${name}...`);
  try {
    const result = await rpc(name, body);
    setRunModalOutput(JSON.stringify(result, null, 2));
    completeRunModal("SUCCESS", "Action finished");
    renderView();
  } catch (e) {
    setRunModalOutput(`RPC ${name} failed: ${e.message}`);
    completeRunModal("ERROR", "Action failed");
  }
}

async function loadGatewayWorkflowRows(suiteRunId) {
  const id = String(suiteRunId || "").trim();
  if (!id) return [];
  const rows = await rest("sim_fixture_workflow_runs", {
    select: "id,suite_run_id,module,execution_mode,target_scope,fixture_scope,test_case_id,fixture_run_key,status,planned_test_count,completed_test_count,terminal_test_count,worker_id,seed_started_at,seed_confirmed_at,cleanup_started_at,cleanup_confirmed_at,error_message,metadata,seed_payload,seed_result,cleanup_payload,cleanup_result,fixture_context,updated_at",
    suite_run_id: `eq.${id}`,
    order: "created_at.desc",
  });
  return (rows || []).map((row) => ({
    ...row,
    _detail: row,
  }));
}

async function loadGatewayCaseCatalog() {
  const [queries, workflows] = await Promise.all([
    rest("sim_permanent_queries", {
      select: "id,module,functionality_name,synopsis,execution_mode,is_active,target_config_id,gateway_endpoint,created_at,test_tags",
      execution_mode: "eq.GATEWAY_CONFIG",
      order: "id.asc",
    }).catch(() => []),
    rest("sim_fixture_workflow_definitions", {
      select: "id,module,test_case_id,target_scope,fixture_scope,plan_name,is_active",
      execution_mode: "eq.GATEWAY_CONFIG",
      is_active: "eq.true",
      order: "created_at.desc",
    }).catch(() => []),
  ]);

  const wfMap = new Map((workflows || []).map((row) => [Number(row.test_case_id), row]));

  return (queries || []).map((row) => {
    const workflow = wfMap.get(Number(row.id)) || null;
    return {
      ...row,
      role_context: null,
      gateway_function: null,
      fixture_mode: workflow ? String(workflow.fixture_scope || workflow.target_scope || "WORKFLOW") : "PLAIN",
      fixture_scope: workflow?.fixture_scope || null,
      fixture_target_scope: workflow?.target_scope || null,
      fixture_plan_name: workflow?.plan_name || null,
      workflow_definition_id: workflow?.id || null,
    };
  });
}

async function renderGatewayFixtures() {
  const tpl = $("#gateway-fixtures-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);
  const detailPanel = $("#gw-workflow-detail");
  const tabPlans = $("#gw-fixture-tab-plans");
  const tabRuns = $("#gw-fixture-tab-runs");
  const tabPlansBtn = $("#tab-gw-fixture-plans");
  const tabRunsBtn = $("#tab-gw-fixture-runs");

  const switchTab = (tab) => {
    state.gatewayFixtures.activeTab = tab;
    tabPlans?.classList.toggle("hidden", tab !== "plans");
    tabRuns?.classList.toggle("hidden", tab !== "runs");
    tabPlansBtn?.classList.toggle("active", tab === "plans");
    tabRunsBtn?.classList.toggle("active", tab === "runs");
  };

  tabPlansBtn.onclick = () => switchTab("plans");
  tabRunsBtn.onclick = () => switchTab("runs");
  switchTab(state.gatewayFixtures.activeTab || "plans");

  const loadDefinitions = async () => {
    const offset = (state.gatewayFixtures.plansPage - 1) * state.gatewayFixtures.plansPageSize;
    const [{ rows: defs, count }, queries] = await Promise.all([
      restWithCount("sim_fixture_workflow_definitions", {
        select: "id,module,execution_mode,test_case_id,target_scope,fixture_scope,plan_name,is_active,seed_sql,seed_confirm_sql,cleanup_sql,cleanup_confirm_sql,placeholder_map,terminal_cleanup_policy,timeout_seconds,updated_at",
        execution_mode: "eq.GATEWAY_CONFIG",
        is_active: "eq.true",
        order: "module.asc, test_case_id.asc",
        limit: String(state.gatewayFixtures.plansPageSize),
        offset: String(offset),
      }),
      rest("sim_permanent_queries", {
        select: "id,module,functionality_name,target_config_id,gateway_endpoint,is_active",
        execution_mode: "eq.GATEWAY_CONFIG",
        order: "id.asc",
      }),
    ]);

    state.gatewayFixtures.plansTotal = count;
    const queryMap = new Map((queries || []).map((row) => [Number(row.id), row]));
    return (defs || []).map((row) => {
      const linked = queryMap.get(Number(row.test_case_id)) || {};
      return {
        workflow_id: row.id,
        test_case_id: row.test_case_id,
        config_id: linked.target_config_id || null,
        functionality_name: linked.functionality_name || null,
        fixture_scope: row.fixture_scope,
        plan_name: row.plan_name,
        terminal_cleanup_policy: row.terminal_cleanup_policy,
        timeout_seconds: row.timeout_seconds,
        updated_at: row.updated_at,
        _detail: {
          definition: row,
          linked_case: linked,
        },
      };
    });
  };

  const loadWorkflowRuns = async () => {
    const offset = (state.gatewayFixtures.runsPage - 1) * state.gatewayFixtures.runsPageSize;
    const { rows, count } = await restWithCount("sim_fixture_workflow_runs", {
      select: "id,suite_run_id,module,execution_mode,test_case_id,fixture_run_key,status,fixture_scope,planned_test_count,completed_test_count,terminal_test_count,seed_payload,seed_result,cleanup_payload,cleanup_result,fixture_context,error_message,updated_at",
      execution_mode: "eq.GATEWAY_CONFIG",
      order: "updated_at.desc",
      limit: String(state.gatewayFixtures.runsPageSize),
      offset: String(offset),
    });
    state.gatewayFixtures.runsTotal = count;
    return rows || [];
  };

  const loadAll = async () => {
    const [definitions, workflowRuns] = await Promise.all([
      loadDefinitions(),
      loadWorkflowRuns(),
    ]);

    renderTable($("#tbl-gw-fixture-defs"), ["test_case_id", "config_id", "functionality_name", "fixture_scope", "plan_name", "terminal_cleanup_policy", "timeout_seconds", "updated_at"], definitions, {
      test_case_id: (v) => `<span class='mono'>${escapeHtml(String(v || "-"))}</span>`,
      config_id: (v) => `<span class='mono'>${escapeHtml(String(v || "-"))}</span>`,
      fixture_scope: (v) => badge(v || "NA"),
      plan_name: (v) => `<span class='mono'>${escapeHtml(String(v || "-"))}</span>`,
    });
    if ($("#gw-fixture-defs-meta")) {
      $("#gw-fixture-defs-meta").textContent = `${state.gatewayFixtures.plansTotal} workflow-backed gateway fixture plan(s).`;
    }
    if ($("#gw-fixture-defs-page-info")) {
      const totalPages = Math.max(1, Math.ceil(state.gatewayFixtures.plansTotal / state.gatewayFixtures.plansPageSize));
      $("#gw-fixture-defs-page-info").textContent = `Page ${state.gatewayFixtures.plansPage} of ${totalPages}`;
    }
    if ($("#gw-fixture-defs-prev")) {
      $("#gw-fixture-defs-prev").disabled = state.gatewayFixtures.plansPage <= 1;
    }
    if ($("#gw-fixture-defs-next")) {
      $("#gw-fixture-defs-next").disabled = state.gatewayFixtures.plansPage * state.gatewayFixtures.plansPageSize >= state.gatewayFixtures.plansTotal;
    }

    renderTable($("#tbl-gw-workflows"), ["test_case_id", "status", "fixture_scope", "planned_test_count", "completed_test_count", "terminal_test_count", "updated_at"], workflowRuns, {
      test_case_id: (v) => `<span class='mono'>${escapeHtml(String(v || "-"))}</span>`,
      status: (v) => badge(v || "NA"),
      fixture_scope: (v) => badge(v || "NA"),
    });
    if ($("#gw-workflows-meta")) {
      $("#gw-workflows-meta").textContent = state.gatewayFixtures.runsTotal
        ? `${state.gatewayFixtures.runsTotal} fixture workflow run(s).`
        : "No fixture workflow runs yet.";
    }
    if ($("#gw-workflows-page-info")) {
      const totalPages = Math.max(1, Math.ceil(state.gatewayFixtures.runsTotal / state.gatewayFixtures.runsPageSize));
      $("#gw-workflows-page-info").textContent = `Page ${state.gatewayFixtures.runsPage} of ${totalPages}`;
    }
    if ($("#gw-workflows-prev")) {
      $("#gw-workflows-prev").disabled = state.gatewayFixtures.runsPage <= 1;
    }
    if ($("#gw-workflows-next")) {
      $("#gw-workflows-next").disabled = state.gatewayFixtures.runsPage * state.gatewayFixtures.runsPageSize >= state.gatewayFixtures.runsTotal;
    }

    if (detailPanel) {
      detailPanel.textContent = definitions.length || workflowRuns.length
        ? "Click a fixture plan or fixture run row to inspect the seeded data flow."
        : "No fixture selected.";
    }

    const defRows = document.querySelectorAll("#tbl-gw-fixture-defs tbody tr");
    defRows.forEach((tr, idx) => {
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        const row = definitions[idx];
        if (!row || !detailPanel) return;
        detailPanel.textContent = JSON.stringify({
          type: "definition",
          config_id: row.config_id,
          test_case_id: row.test_case_id,
          functionality_name: row.functionality_name,
          fixture_scope: row.fixture_scope,
          plan_name: row.plan_name,
          terminal_cleanup_policy: row.terminal_cleanup_policy,
          timeout_seconds: row.timeout_seconds,
          seed_sql: row._detail?.definition?.seed_sql ?? null,
          seed_confirm_sql: row._detail?.definition?.seed_confirm_sql ?? null,
          cleanup_sql: row._detail?.definition?.cleanup_sql ?? null,
          cleanup_confirm_sql: row._detail?.definition?.cleanup_confirm_sql ?? null,
          placeholder_map: row._detail?.definition?.placeholder_map ?? null,
        }, null, 2);
      };
    });

    const workflowRows = document.querySelectorAll("#tbl-gw-workflows tbody tr");
    workflowRows.forEach((tr, idx) => {
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        const row = workflowRuns[idx];
        if (!row || !detailPanel) return;
        detailPanel.textContent = JSON.stringify({
          type: "runtime",
          test_case_id: row.test_case_id,
          fixture_run_key: row.fixture_run_key,
          status: row.status,
          fixture_scope: row.fixture_scope,
          planned_test_count: row.planned_test_count,
          completed_test_count: row.completed_test_count,
          terminal_test_count: row.terminal_test_count,
          fixture_context: row.fixture_context,
          seed_payload: row.seed_payload,
          seed_result: row.seed_result,
          cleanup_payload: row.cleanup_payload,
          cleanup_result: row.cleanup_result,
          error_message: row.error_message,
          updated_at: row.updated_at,
        }, null, 2);
      };
    });
  };

  $("#reload-gw-fixtures").onclick = () => {
    loadAll().catch((e) => {
      if (detailPanel) detailPanel.textContent = `Reload failed: ${e.message}`;
    });
  };

  $("#gw-fixture-defs-prev").onclick = () => {
    if (state.gatewayFixtures.plansPage <= 1) return;
    state.gatewayFixtures.plansPage -= 1;
    loadAll().catch((e) => {
      if (detailPanel) detailPanel.textContent = `Reload failed: ${e.message}`;
    });
  };
  $("#gw-fixture-defs-next").onclick = () => {
    if (state.gatewayFixtures.plansPage * state.gatewayFixtures.plansPageSize >= state.gatewayFixtures.plansTotal) return;
    state.gatewayFixtures.plansPage += 1;
    loadAll().catch((e) => {
      if (detailPanel) detailPanel.textContent = `Reload failed: ${e.message}`;
    });
  };
  $("#gw-workflows-prev").onclick = () => {
    if (state.gatewayFixtures.runsPage <= 1) return;
    state.gatewayFixtures.runsPage -= 1;
    loadAll().catch((e) => {
      if (detailPanel) detailPanel.textContent = `Reload failed: ${e.message}`;
    });
  };
  $("#gw-workflows-next").onclick = () => {
    if (state.gatewayFixtures.runsPage * state.gatewayFixtures.runsPageSize >= state.gatewayFixtures.runsTotal) return;
    state.gatewayFixtures.runsPage += 1;
    loadAll().catch((e) => {
      if (detailPanel) detailPanel.textContent = `Reload failed: ${e.message}`;
    });
  };

  loadAll().catch((e) => {
    if ($("#tbl-gw-fixture-defs")) {
      $("#tbl-gw-fixture-defs").innerHTML = `<tbody><tr><td>Failed: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
    if (detailPanel) {
      detailPanel.textContent = `Failed to load gateway fixtures: ${e.message}`;
    }
  });
}

async function renderDevopsGate() {
  const tpl = $("#devops-gate-template").content.cloneNode(true);
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(tpl);

  const outputEl = $("#devops-output");
  const detailEl = $("#devops-gate-detail");

  const setOutput = (value) => {
    if (!outputEl) return;
    outputEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  };

  const toInt = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  };

  const toNumeric = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const parseJsonField = (selector, fallback) => {
    try {
      return parseOptionalJsonField(selector, fallback);
    } catch (e) {
      throw new Error(`Invalid JSON in ${selector}: ${e.message}`);
    }
  };

  const setSelectedKpis = (gateRun = {}) => {
    const status = String(gateRun?.status || "-");
    const passRateRaw = gateRun?.pass_rate_pct;
    const passRate = Number.isFinite(Number(passRateRaw)) ? `${Number(passRateRaw).toFixed(2)}%` : "-";
    const failedJobs = Number(gateRun?.failed_jobs ?? 0);
    const deadJobs = Number(gateRun?.dead_jobs ?? 0);
    const pendingJobs = Number(gateRun?.pending_jobs ?? 0);

    if ($("#devops-kpi-status")) {
      const el = $("#devops-kpi-status");
      el.textContent = humanizeStatus(status);
      el.classList.toggle("status-running-pulse", status === "RUNNING");
      el.classList.toggle("status-failed-text", status === "FAILED" || status === "ERROR" || status === "CANCELLED");
      el.classList.toggle("status-passed-text", status === "PASSED");
    }
    if ($("#devops-kpi-pass-rate")) $("#devops-kpi-pass-rate").textContent = passRate;
    if ($("#devops-kpi-failed-dead")) $("#devops-kpi-failed-dead").textContent = `${failedJobs} / ${deadJobs}`;
    if ($("#devops-kpi-pending")) $("#devops-kpi-pending").textContent = String(pendingJobs);
  };

  const applyPolicyToForm = (policy = {}) => {
    setInputValue("#devops-policy-mode", policy.execution_mode ?? "GATEWAY_CONFIG");
    setInputValue("#devops-policy-pass-rate", String(policy.min_pass_rate_pct ?? 100));
    setInputValue("#devops-policy-max-failed", String(policy.max_failed_jobs ?? 0));
    setInputValue("#devops-policy-max-dead", String(policy.max_dead_jobs ?? 0));
    setInputValue("#devops-policy-runtime", String(policy.max_suite_runtime_seconds ?? 3600));
    setInputValue("#devops-policy-stale-minutes", String(policy.stale_job_minutes ?? 15));
    setInputValue("#devops-policy-zero-pending", String(Boolean(policy.require_zero_pending)));
    setInputValue("#devops-policy-auto-requeue", String(Boolean(policy.auto_requeue_stale_jobs)));
    setInputValue("#devops-policy-auto-purge", String(Boolean(policy.auto_purge_completed)));
    setInputValue("#devops-policy-keep-days", String(policy.keep_days ?? 1));
    setInputValue("#devops-policy-metadata", stringifyJson(policy.metadata ?? {}));
  };

  const readPolicyPayload = () => ({
    p_execution_mode: ($("#devops-policy-mode")?.value || "GATEWAY_CONFIG").trim(),
    p_min_pass_rate_pct: toNumeric($("#devops-policy-pass-rate")?.value, 100),
    p_max_failed_jobs: toInt($("#devops-policy-max-failed")?.value, 0),
    p_max_dead_jobs: toInt($("#devops-policy-max-dead")?.value, 0),
    p_require_zero_pending: ($("#devops-policy-zero-pending")?.value || "true") === "true",
    p_max_suite_runtime_seconds: toInt($("#devops-policy-runtime")?.value, 3600),
    p_auto_requeue_stale_jobs: ($("#devops-policy-auto-requeue")?.value || "true") === "true",
    p_stale_job_minutes: toInt($("#devops-policy-stale-minutes")?.value, 15),
    p_auto_purge_completed: ($("#devops-policy-auto-purge")?.value || "false") === "true",
    p_keep_days: toInt($("#devops-policy-keep-days")?.value, 1),
    p_metadata: parseJsonField("#devops-policy-metadata", {}),
  });

  const loadPolicy = async () => {
    const policyRes = await rpc("rpc_sim_devops_get_gate_policy", {});
    if (policyRes?.success === false) {
      throw new Error(policyRes?.error || "Failed to load gate policy");
    }
    const policy = policyRes?.policy || {};
    applyPolicyToForm(policy);
    return policyRes;
  };

  const loadSelectedGateRun = async (refreshFirst = false) => {
    const selectedId = ($("#devops-selected-gate-id")?.value || state.devopsGate.selectedGateRunId || "").trim();
    if (!selectedId) {
      if (detailEl) detailEl.textContent = "No gate run selected.";
      setSelectedKpis({});
      return null;
    }

    state.devopsGate.selectedGateRunId = selectedId;
    if ($("#devops-selected-gate-id")) $("#devops-selected-gate-id").value = selectedId;

    if (refreshFirst) {
      const refreshRes = await rpc("rpc_sim_devops_refresh_gate_run", { p_gate_run_id: selectedId });
      if (refreshRes?.success === false) {
        throw new Error(refreshRes?.error || "Failed to refresh gate run");
      }
      setOutput(refreshRes);
    }

    const getRes = await rpc("rpc_sim_devops_get_gate_run", { p_gate_run_id: selectedId });
    if (getRes?.success === false) {
      throw new Error(getRes?.error || "Failed to fetch gate run detail");
    }
    const gateRun = getRes?.gate_run || {};
    setSelectedKpis(gateRun);
    if (detailEl) detailEl.textContent = JSON.stringify(getRes, null, 2);
    return getRes;
  };

  const loadGateRuns = async () => {
    const statusFilter = ($("#devops-filter-status")?.value || "").trim();
    const moduleFilter = ($("#devops-filter-module")?.value || "").trim();
    const payload = await rpc("rpc_sim_devops_list_gate_runs", {
      p_status: statusFilter || null,
      p_module: moduleFilter || null,
      p_limit: state.devopsGate.runsPageSize,
      p_offset: (state.devopsGate.runsPage - 1) * state.devopsGate.runsPageSize,
    });
    if (payload?.success === false) {
      throw new Error(payload?.error || "Failed to list gate runs");
    }

    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    state.devopsGate.runsTotal = Number(payload?.total ?? rows.length);
    const totalPages = Math.max(1, Math.ceil(state.devopsGate.runsTotal / state.devopsGate.runsPageSize));
    if (state.devopsGate.runsPage > totalPages) {
      state.devopsGate.runsPage = totalPages;
      return loadGateRuns();
    }

    renderTable($("#tbl-devops-runs"), [
      "id",
      "status",
      "module",
      "execution_mode",
      "release_ref",
      "started_at",
      "completed_at",
      "total_jobs",
      "passed_jobs",
      "failed_jobs",
      "dead_jobs",
      "pending_jobs",
      "pass_rate_pct",
      "gate_reason",
    ], rows, {
      id: (v) => `<span class='mono'>${short(String(v || ""))}</span>`,
      status: (v) => badge(v || "NA"),
      release_ref: (v) => `<span class='mono'>${escapeHtml(String(v || "-"))}</span>`,
      pass_rate_pct: (v) => Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : "-",
      gate_reason: (v) => v ? `<span title="${escapeHtml(String(v))}">${escapeHtml(String(v)).slice(0, 96)}</span>` : "-",
    });

    if ($("#devops-runs-meta")) {
      $("#devops-runs-meta").textContent = `Rows: ${rows.length} (total ${state.devopsGate.runsTotal}) | Source: rpc_sim_devops_list_gate_runs`;
    }
    if ($("#devops-runs-page-info")) {
      $("#devops-runs-page-info").textContent = `Page ${state.devopsGate.runsPage} of ${totalPages}`;
    }
    if ($("#devops-runs-prev")) $("#devops-runs-prev").disabled = state.devopsGate.runsPage <= 1;
    if ($("#devops-runs-next")) {
      $("#devops-runs-next").disabled = state.devopsGate.runsPage * state.devopsGate.runsPageSize >= state.devopsGate.runsTotal;
    }

    const bodyRows = document.querySelectorAll("#tbl-devops-runs tbody tr");
    bodyRows.forEach((tr, idx) => {
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        const id = String(rows[idx]?.id || "");
        if (!id) return;
        state.devopsGate.selectedGateRunId = id;
        if ($("#devops-selected-gate-id")) $("#devops-selected-gate-id").value = id;
        loadSelectedGateRun(false).catch((e) => {
          if (detailEl) detailEl.textContent = `Failed to load selected gate run: ${e.message}`;
        });
      };
    });

    if (!state.devopsGate.selectedGateRunId && rows[0]?.id) {
      state.devopsGate.selectedGateRunId = String(rows[0].id);
      if ($("#devops-selected-gate-id")) $("#devops-selected-gate-id").value = state.devopsGate.selectedGateRunId;
      await loadSelectedGateRun(false);
    }
  };

  if ($("#devops-run-source")) {
    $("#devops-run-source").value = `${state.conn.source || "UI_SIMULATOR"}__devops_gate`;
  }
  if ($("#devops-runs-page-size")) {
    $("#devops-runs-page-size").value = String(state.devopsGate.runsPageSize);
  }

  if (!state.auth.isAdmin) {
    ["#devops-save-policy", "#devops-start-run", "#devops-refresh-selected"].forEach((selector) => {
      if ($(selector)) $(selector).disabled = true;
    });
    setOutput("Admin role required for DevOps gate policy updates and run execution.");
  }

  $("#devops-reload-policy").onclick = async () => {
    try {
      const res = await loadPolicy();
      setOutput(res);
    } catch (e) {
      setOutput(`Policy reload failed: ${e.message}`);
    }
  };

  $("#devops-save-policy").onclick = async () => {
    if (!state.auth.isAdmin) return;
    try {
      const payload = readPolicyPayload();
      const res = await rpc("rpc_sim_devops_upsert_gate_policy", payload);
      if (res?.success === false) throw new Error(res?.error || "Policy save failed");
      setOutput(res);
      applyPolicyToForm(res?.policy || {});
    } catch (e) {
      setOutput(`Policy save failed: ${e.message}`);
    }
  };

  $("#devops-start-run").onclick = async () => {
    if (!state.auth.isAdmin) return;
    try {
      const payload = {
        p_source: ($("#devops-run-source")?.value || "UI_SIMULATOR").trim() || "UI_SIMULATOR",
        p_module: ($("#devops-run-module")?.value || "").trim() || null,
        p_execution_mode: ($("#devops-run-mode")?.value || "").trim() || null,
        p_release_ref: ($("#devops-run-release-ref")?.value || "").trim() || null,
        p_metadata: parseJsonField("#devops-run-metadata", {}),
      };
      const res = await rpc("rpc_sim_devops_start_gate_run", payload);
      if (res?.success === false) throw new Error(res?.error || "Gate run start failed");
      state.devopsGate.selectedGateRunId = String(res?.gate_run_id || "");
      if ($("#devops-selected-gate-id")) $("#devops-selected-gate-id").value = state.devopsGate.selectedGateRunId;
      setOutput(res);
      await loadGateRuns();
      await loadSelectedGateRun(false);
    } catch (e) {
      setOutput(`Start run failed: ${e.message}`);
    }
  };

  $("#devops-load-selected").onclick = () => {
    loadSelectedGateRun(false).catch((e) => setOutput(`Load selected failed: ${e.message}`));
  };

  $("#devops-refresh-selected").onclick = async () => {
    if (!state.auth.isAdmin) return;
    try {
      await loadSelectedGateRun(true);
      await loadGateRuns();
    } catch (e) {
      setOutput(`Refresh selected failed: ${e.message}`);
    }
  };

  $("#devops-apply-filter").onclick = () => {
    state.devopsGate.runsPage = 1;
    loadGateRuns().catch((e) => setOutput(`Run filter failed: ${e.message}`));
  };

  $("#devops-reload-runs").onclick = () => {
    loadGateRuns().catch((e) => setOutput(`Run reload failed: ${e.message}`));
  };

  $("#devops-runs-prev").onclick = () => {
    if (state.devopsGate.runsPage <= 1) return;
    state.devopsGate.runsPage -= 1;
    loadGateRuns().catch((e) => setOutput(`Run pagination failed: ${e.message}`));
  };

  $("#devops-runs-next").onclick = () => {
    if (state.devopsGate.runsPage * state.devopsGate.runsPageSize >= state.devopsGate.runsTotal) return;
    state.devopsGate.runsPage += 1;
    loadGateRuns().catch((e) => setOutput(`Run pagination failed: ${e.message}`));
  };

  $("#devops-runs-page-size").onchange = () => {
    state.devopsGate.runsPageSize = Number($("#devops-runs-page-size").value || 10);
    state.devopsGate.runsPage = 1;
    loadGateRuns().catch((e) => setOutput(`Run page-size update failed: ${e.message}`));
  };

  try {
    await loadPolicy();
    await loadGateRuns();
    if (state.devopsGate.selectedGateRunId) {
      await loadSelectedGateRun(false);
    }
  } catch (e) {
    if ($("#tbl-devops-runs")) {
      $("#tbl-devops-runs").innerHTML = `<tbody><tr><td>Failed: ${escapeHtml(e.message)}</td></tr></tbody>`;
    }
    if (detailEl) {
      detailEl.textContent = `Failed to load DevOps gate dashboard: ${e.message}`;
    }
    setOutput(`Load failed: ${e.message}`);
  }
}

function buildGatewayResultStatusFilter(passFilter) {
  if (passFilter === "true") {
    return { status: "eq.PASS" };
  }
  if (passFilter === "false") {
    return { status: "in.(FAIL,ERROR,TIMEOUT,DEAD)" };
  }
  return {};
}

function getSettingsGatewaySource() {
  return `${state.conn.source}__gateway_settings`;
}

function getSettingsGatewayWorkerId() {
  const raw = ($("#gw-runner-worker-id")?.value || "").trim() || state.gatewayRunner.workerId || "ui:settings:gateway";
  state.gatewayRunner.workerId = raw;
  localStorage.setItem("sim.gw.workerId", raw);
  return raw;
}

function handleUnauthorized() {
  if (!state.supabase) return;
  state.auth.session = null;
  window.location.href = "auth.html";
}

async function ensureSettingsGatewaySuite() {
  const module = ($("#gw-runner-module")?.value || "").trim();
  state.gatewayRunner.module = module;
  localStorage.setItem("sim.gw.module", module);
  return rpc("rpc_ensure_gateway_suite_v2", {
    p_source: getSettingsGatewaySource(),
    p_module: module || null,
  });
}

async function resolveSettingsGatewaySuiteId() {
  const existing = ($("#gw-runner-suite-id")?.value || "").trim();
  if (existing) return existing;
  const ensured = await ensureSettingsGatewaySuite();
  const suiteRunId = ensured?.suite_run_id || ensured?.payload?.suite_run_id;
  if (!suiteRunId) throw new Error("Unable to create or reuse a gateway suite.");
  if ($("#gw-runner-suite-id")) $("#gw-runner-suite-id").value = String(suiteRunId);
  return String(suiteRunId);
}

async function rest(table, params = {}) {
  assertConn();
  const qs = new URLSearchParams(params).toString();
  const url = `${state.conn.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: headers(false) });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Redirecting to login.");
  }
  if (!res.ok) throw new Error(await readErr(res));
  return res.json();
}

async function restWithCount(table, params = {}) {
  assertConn();
  const qs = new URLSearchParams(params).toString();
  const url = `${state.conn.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { ...headers(false), Prefer: "count=exact" } });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Redirecting to login.");
  }
  if (!res.ok) throw new Error(await readErr(res));
  const rows = await res.json();
  const range = res.headers.get("content-range") || "";
  const tail = range.split("/")[1];
  const count = tail && tail !== "*" ? Number(tail) : rows.length;
  return { rows, count: Number.isFinite(count) ? count : rows.length };
}

async function rpc(name, body = {}) {
  assertConn();
  const url = `${state.conn.url}/rest/v1/rpc/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Redirecting to login.");
  }
  if (!res.ok) throw new Error(await readErr(res));
  return res.json();
}

function headers(withJson) {
  const token = state.auth.session?.access_token || state.conn.key;
  return {
    apikey: state.conn.key,
    Authorization: `Bearer ${token}`,
    ...(withJson ? { "Content-Type": "application/json" } : {}),
  };
}

function assertConn() {
  if (!state.conn.url || !state.conn.key) {
    throw new Error("Set Supabase URL and key, then click Save Connection.");
  }
}

async function readErr(res) {
  try {
    const json = await res.json();
    return `${res.status} ${json.message || JSON.stringify(json)}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

function short(v = "") {
  return v.length > 12 ? `${v.slice(0, 12)}...` : v;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
