const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const storageKey = "api-checkpoint-state";
let state = JSON.parse(localStorage.getItem(storageKey) || "null") || {
  requests: [{ id: crypto.randomUUID(), name: "Sample users", method: "GET", url: "https://jsonplaceholder.typicode.com/users", headers: [], body: "", bodyType: "json", checks: [{ type: "status", value: "200" }] }],
  activeId: null,
  runs: []
};
state.activeId ||= state.requests[0]?.id;
let latestRun = null;

function save() { localStorage.setItem(storageKey, JSON.stringify(state)); $("#saveStatus").textContent = "Saved locally"; }
function active() { return state.requests.find((request) => request.id === state.activeId); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function renderList() {
  $("#requestList").innerHTML = state.requests.map((request) => `<button class="request-item ${request.id === state.activeId ? "active" : ""}" data-id="${request.id}"><span class="method-pill">${request.method}</span><span>${escapeHtml(request.name || "Untitled request")}</span></button>`).join("");
  $("#requestCount").textContent = `${state.requests.length} request${state.requests.length === 1 ? "" : "s"}`;
}
function addHeader(data = { key: "", value: "" }) { const row = $("#headerTemplate").content.firstElementChild.cloneNode(true); const inputs = row.querySelectorAll("input"); inputs[0].value = data.key; inputs[1].value = data.value; row.querySelector("button").onclick = () => row.remove(); $("#headersRows").append(row); }
function addCheck(data = { type: "status", value: "200" }) { const row = $("#checkTemplate").content.firstElementChild.cloneNode(true); row.querySelector("select").value = data.type; row.querySelector("input").value = data.value; row.querySelector("button").onclick = () => row.remove(); $("#checkRows").append(row); }
function renderEditor() {
  const request = active(); if (!request) return;
  $("#requestName").value = request.name; $("#method").value = request.method; $("#url").value = request.url; $("#body").value = request.body; $("#bodyType").value = request.bodyType;
  $("#headersRows").innerHTML = ""; request.headers.forEach(addHeader); $("#checkRows").innerHTML = ""; request.checks.forEach(addCheck);
  updateCounts(); renderList();
}
function collectEditor() {
  const request = active(); if (!request) return;
  request.name = $("#requestName").value.trim() || "Untitled request"; request.method = $("#method").value; request.url = $("#url").value.trim(); request.body = $("#body").value; request.bodyType = $("#bodyType").value;
  request.headers = $$(".header-row").map((row) => ({ key: row.querySelectorAll("input")[0].value.trim(), value: row.querySelectorAll("input")[1].value.trim() })).filter((header) => header.key);
  request.checks = $$(".check-row").map((row) => ({ type: row.querySelector("select").value, value: row.querySelector("input").value.trim() })).filter((check) => check.value);
  updateCounts(); save(); renderList();
}
function updateCounts() { $("#headerCount").textContent = $$(".header-row").length; $("#checkCount").textContent = $$(".check-row").length; }
function jsonPath(object, path) { return path.replace(/^\$\.?/, "").split(".").filter(Boolean).reduce((value, key) => value?.[key], object); }
function evaluateChecks(checks, response, text, elapsed) {
  let json; try { json = JSON.parse(text); } catch { /* Plain text responses do not have JSON paths. */ }
  return checks.map((check) => {
    let pass, detail;
    if (check.type === "status") { pass = String(response.status) === check.value; detail = `Status is ${check.value}`; }
    if (check.type === "contains") { pass = text.includes(check.value); detail = `Response contains “${check.value}”`; }
    if (check.type === "json") { const [path, expected = ""] = check.value.split("="); const actual = jsonPath(json, path.trim()); pass = String(actual) === expected.trim(); detail = `${path.trim()} equals ${expected.trim()}`; }
    if (check.type === "time") { pass = elapsed < Number(check.value); detail = `Response time under ${check.value}ms`; }
    return { ...check, pass, detail };
  });
}
function renderRun(run) {
  latestRun = run; const passed = run.checks.every((check) => check.pass); const success = run.ok && passed;
  $("#resultTitle").textContent = success ? "All checks passed" : run.error ? "Request could not run" : "Review needed";
  const badge = $("#resultStatus"); badge.textContent = success ? "PASS" : "FAIL"; badge.className = `status-dot ${success ? "good" : "bad"}`;
  $("#metricStatus").textContent = run.status ? `${run.status} ${run.statusText}` : "Error"; $("#metricTime").textContent = `${run.elapsed} ms`; $("#metricSize").textContent = `${new Blob([run.response]).size} B`;
  $("#checksResult").textContent = `${run.checks.filter((check) => check.pass).length}/${run.checks.length} passed`;
  $("#checkResults").className = "check-results"; $("#checkResults").innerHTML = run.checks.length ? run.checks.map((check) => `<div class="check-result ${check.pass ? "pass" : "fail"}"><b>${check.pass ? "✓" : "×"}</b><span>${escapeHtml(check.detail)}</span></div>`).join("") : "<div class=\"check-result pass\"><b>✓</b><span>No assertions configured</span></div>";
  $("#responseBody").textContent = run.response || run.error || "(empty response)";
}
async function runRequest() {
  collectEditor(); const request = active(); if (!request.url) return alert("Enter an API URL before running the test.");
  const button = $("#sendRequest"); button.disabled = true; button.querySelector("span").textContent = "Running…"; $("#runBadge").textContent = "Running";
  const started = performance.now();
  try {
    const headers = Object.fromEntries(request.headers.map((header) => [header.key, header.value]));
    if (request.body && request.bodyType === "json" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const options = { method: request.method, headers }; if (request.body && !["GET", "HEAD"].includes(request.method)) options.body = request.body;
    const response = await fetch(request.url, options); const text = await response.text(); const elapsed = Math.round(performance.now() - started);
    const run = { requestName: request.name, url: request.url, method: request.method, timestamp: new Date().toISOString(), status: response.status, statusText: response.statusText, ok: response.ok, elapsed, response: text, checks: evaluateChecks(request.checks, response, text, elapsed) };
    state.runs.unshift(run); save(); renderRun(run); $("#runBadge").textContent = run.checks.every((check) => check.pass) && response.ok ? "Passed" : "Failed";
  } catch (error) {
    const elapsed = Math.round(performance.now() - started); const run = { requestName: request.name, url: request.url, method: request.method, timestamp: new Date().toISOString(), status: 0, statusText: "", ok: false, elapsed, response: "", error: `${error.name}: ${error.message}`, checks: [] };
    state.runs.unshift(run); save(); renderRun(run); $("#runBadge").textContent = "Failed";
  } finally { button.disabled = false; button.querySelector("span").textContent = "Run test"; }
}
function download(name, type, content) { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function exportRuns(kind) {
  if (!state.runs.length) return alert("Run a test before exporting a report.");
  const date = new Date().toISOString().slice(0, 10);
  if (kind === "json") download(`api-checkpoint-${date}.json`, "application/json", JSON.stringify(state.runs, null, 2));
  if (kind === "csv") { const rows = [["Time", "Request", "Method", "URL", "Status", "Time (ms)", "Checks passed"]].concat(state.runs.map((run) => [run.timestamp, run.requestName, run.method, run.url, run.status, run.elapsed, `${run.checks.filter((check) => check.pass).length}/${run.checks.length}`])); download(`api-checkpoint-${date}.csv`, "text/csv", rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n")); }
  if (kind === "html") { const items = state.runs.map((run) => `<tr><td>${escapeHtml(run.timestamp)}</td><td>${escapeHtml(run.requestName)}</td><td>${run.status}</td><td>${run.elapsed} ms</td><td>${run.checks.filter((check) => check.pass).length}/${run.checks.length}</td></tr>`).join(""); download(`api-checkpoint-report-${date}.html`, "text/html", `<!doctype html><title>API Checkpoint report</title><style>body{font:14px system-ui;margin:40px;color:#17212b}table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}th{color:#0c8b80}</style><h1>API Checkpoint report</h1><p>Generated ${new Date().toLocaleString()}</p><table><thead><tr><th>Time</th><th>Request</th><th>Status</th><th>Duration</th><th>Checks</th></tr></thead><tbody>${items}</tbody></table>`); }
}
$("#addHeader").onclick = () => { addHeader(); updateCounts(); }; $("#addCheck").onclick = () => { addCheck(); updateCounts(); };
$("#addRequest").onclick = $("#newRequest").onclick = () => { const request = { id: crypto.randomUUID(), name: "Untitled request", method: "GET", url: "", headers: [], body: "", bodyType: "json", checks: [] }; state.requests.push(request); state.activeId = request.id; save(); renderEditor(); };
$("#requestList").onclick = (event) => { const item = event.target.closest("[data-id]"); if (item) { collectEditor(); state.activeId = item.dataset.id; renderEditor(); } };
$("#sendRequest").onclick = runRequest; document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runRequest(); });
$$(".tab").forEach((tab) => tab.onclick = () => { $$(".tab").forEach((item) => item.classList.toggle("active", item === tab)); ["headers", "body", "checks"].forEach((name) => $(`#${name}Panel`).classList.toggle("hidden", name !== tab.dataset.tab)); });
$("#copyResponse").onclick = async () => { if (latestRun) { await navigator.clipboard.writeText(latestRun.response || latestRun.error || ""); $("#copyResponse").textContent = "Copied"; setTimeout(() => $("#copyResponse").textContent = "Copy", 1200); } };
$("#exportJson").onclick = () => exportRuns("json"); $("#exportCsv").onclick = () => exportRuns("csv"); $("#exportHtml").onclick = () => exportRuns("html");
$("#clearHistory").onclick = () => { state.runs = []; latestRun = null; save(); $("#resultTitle").textContent = "Waiting to run"; $("#resultStatus").className = "status-dot neutral"; $("#resultStatus").textContent = "—"; };
renderEditor();
