/* =========================
   System Habit Tracker
   - localStorage persistence
   - tick + numeric habits
   - charts per habit
========================= */

const STORE_KEY = "solo_habits_v1";

const els = {
  todayText: document.getElementById("todayText"),
  resetBtn: document.getElementById("resetBtn"),

  habitForm: document.getElementById("habitForm"),
  habitName: document.getElementById("habitName"),
  habitType: document.getElementById("habitType"),
  habitUnit: document.getElementById("habitUnit"),
  habitTarget: document.getElementById("habitTarget"),
  habitRank: document.getElementById("habitRank"),
  unitWrap: document.getElementById("unitWrap"),

  habitList: document.getElementById("habitList"),

  logDate: document.getElementById("logDate"),
  selectedHabitArea: document.getElementById("selectedHabitArea"),
  streakText: document.getElementById("streakText"),

  chartMain: document.getElementById("chartMain"),
  chartSecondary: document.getElementById("chartSecondary"),
  chartSub2: document.getElementById("chartSub2"),
};

let state = loadState();
let selectedHabitId = null;

let chartA = null;
let chartB = null;

/* ---------- Utilities ---------- */

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function prettyDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clampNumber(n) {
  if (Number.isNaN(n) || n === null || n === undefined) return null;
  return Number(n);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return { habits: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.habits)) return { habits: [] };
    return parsed;
  } catch {
    return { habits: [] };
  }
}

/* ---------- Data Model ----------
habit = {
  id, name, type: "tick"|"numeric",
  unit, target, rank,
  createdAt,
  logs: { "YYYY-MM-DD": true | number }
}
-------------------------------- */

function addHabit({ name, type, unit, target, rank }) {
  const habit = {
    id: uid(),
    name: name.trim(),
    type,
    unit: unit?.trim() || "",
    target: target ?? null,
    rank,
    createdAt: Date.now(),
    logs: {},
  };
  state.habits.unshift(habit);
  saveState();
  renderAll();
}

function deleteHabit(id) {
  state.habits = state.habits.filter(h => h.id !== id);
  if (selectedHabitId === id) selectedHabitId = null;
  saveState();
  renderAll();
}

function getHabit(id) {
  return state.habits.find(h => h.id === id) || null;
}

function setLog(id, dateISO, value) {
  const h = getHabit(id);
  if (!h) return;

  // delete log if empty
  if (value === null || value === "" || value === undefined) {
    delete h.logs[dateISO];
  } else {
    h.logs[dateISO] = value;
  }
  saveState();
}

/* ---------- Streaks ---------- */

function computeTickStreak(habit) {
  // streak of consecutive "true" ending at chosen date
  const endISO = els.logDate.value || isoToday();
  let streak = 0;

  for (let i = 0; i < 3650; i++) { // up to ~10 years, safe bound
    const d = new Date(endISO + "T00:00:00");
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const v = habit.logs[iso];
    if (v === true) streak++;
    else break;
  }
  return streak;
}

function computeNumericStreak(habit) {
  // streak of consecutive days meeting/exceeding target if target exists, otherwise any positive number counts
  const endISO = els.logDate.value || isoToday();
  let streak = 0;
  const hasTarget = typeof habit.target === "number" && !Number.isNaN(habit.target);

  for (let i = 0; i < 3650; i++) {
    const d = new Date(endISO + "T00:00:00");
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const v = habit.logs[iso];

    const ok = hasTarget ? (typeof v === "number" && v >= habit.target) : (typeof v === "number" && v > 0);
    if (ok) streak++;
    else break;
  }
  return streak;
}

/* ---------- Charts ---------- */

function destroyCharts() {
  if (chartA) { chartA.destroy(); chartA = null; }
  if (chartB) { chartB.destroy(); chartB = null; }
}

function lastNDays(n, endISO) {
  const out = [];
  const end = new Date(endISO + "T00:00:00");
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function buildTickCharts(habit) {
  const logs = habit.logs || {};
  const dates = Object.keys(logs);

  let done = 0;
  let missed = 0;

  // consider only dates that exist in logs
  for (const dt of dates) {
    if (logs[dt] === true) done++;
    else missed++;
  }

  // Pie: Done vs Missed
  chartA = new Chart(els.chartMain, {
    type: "pie",
    data: {
      labels: ["Done", "Missed"],
      datasets: [{ data: [done, missed] }],
    },
    options: {
      plugins: {
        legend: { labels: { color: "rgba(235,245,255,0.75)" } },
        tooltip: { enabled: true },
      }
    }
  });

  // Last 7 days: bar of 1/0
  const endISO = els.logDate.value || isoToday();
  const days = lastNDays(7, endISO);
  const vals = days.map(d => (logs[d] === true ? 1 : 0));

  els.chartSub2.textContent = `Last 7 days ending ${prettyDate(endISO)} (1=Done, 0=Not done)`;

  chartB = new Chart(els.chartSecondary, {
    type: "bar",
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{ label: "Done", data: vals }],
    },
    options: {
      scales: {
        x: { ticks: { color: "rgba(235,245,255,0.65)" }, grid: { color: "rgba(120,170,255,0.10)" } },
        y: { ticks: { color: "rgba(235,245,255,0.65)", stepSize: 1 }, grid: { color: "rgba(120,170,255,0.10)" }, suggestedMax: 1 }
      },
      plugins: {
        legend: { labels: { color: "rgba(235,245,255,0.75)" } }
      }
    }
  });
}

function buildNumericCharts(habit) {
  const logs = habit.logs || {};
  const endISO = els.logDate.value || isoToday();
  const days = lastNDays(7, endISO);
  const vals = days.map(d => (typeof logs[d] === "number" ? logs[d] : 0));

  const unit = habit.unit ? ` ${habit.unit}` : "";
  const total = Object.values(logs).filter(v => typeof v === "number").reduce((a,b)=>a+b,0);
  const count = Object.values(logs).filter(v => typeof v === "number").length;
  const avg = count ? (total / count) : 0;

  // Main: Bar for last 7 days
  chartA = new Chart(els.chartMain, {
    type: "bar",
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{ label: `Value${unit}`, data: vals }],
    },
    options: {
      scales: {
        x: { ticks: { color: "rgba(235,245,255,0.65)" }, grid: { color: "rgba(120,170,255,0.10)" } },
        y: { ticks: { color: "rgba(235,245,255,0.65)" }, grid: { color: "rgba(120,170,255,0.10)" } }
      },
      plugins: {
        legend: { labels: { color: "rgba(235,245,255,0.75)" } }
      }
    }
  });

  // Secondary: Pie showing days logged vs not logged (in last 7)
  const loggedDays = days.filter(d => typeof logs[d] === "number").length;
  const notLogged = 7 - loggedDays;

  els.chartSub2.textContent = `Total: ${total}${unit} • Avg (logged days): ${avg.toFixed(2)}${unit} • Target: ${habit.target ?? "—"}`;

  chartB = new Chart(els.chartSecondary, {
    type: "pie",
    data: {
      labels: ["Logged", "Not Logged (0)"],
      datasets: [{ data: [loggedDays, notLogged] }],
    },
    options: {
      plugins: {
        legend: { labels: { color: "rgba(235,245,255,0.75)" } },
      }
    }
  });
}

/* ---------- UI Render ---------- */

function rankColor(rank){
  // purely label; we don't force colors via CSS here, but you can extend later
  return rank;
}

function renderHabitList() {
  els.habitList.innerHTML = "";

  if (state.habits.length === 0) {
    els.habitList.innerHTML = `<div class="hint">No habits yet. Create one above.</div>`;
    return;
  }

  for (const h of state.habits) {
    const item = document.createElement("div");
    item.className = "habit-item";
    item.dataset.id = h.id;

    const meta = [];
    meta.push(`<span class="badge rank">Rank ${rankColor(h.rank)}</span>`);
    meta.push(`<span class="badge">${h.type === "tick" ? "Tick" : "Numeric"}</span>`);
    if (h.type === "numeric" && h.target != null) meta.push(`<span class="badge">Target ${h.target}${h.unit ? " " + h.unit : ""}</span>`);
    if (h.unit) meta.push(`<span class="badge">Unit ${h.unit}</span>`);

    item.innerHTML = `
      <div class="habit-left">
        <div class="habit-name">${escapeHtml(h.name)}</div>
        <div class="habit-meta">${meta.join("")}</div>
      </div>
      <button class="btn delete" data-del="1" title="Delete habit">Delete</button>
    `;

    item.addEventListener("click", (e) => {
      const del = e.target?.dataset?.del;
      if (del) return; // delete handled separately
      selectedHabitId = h.id;
      renderAll();
    });

    item.querySelector("[data-del='1']").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteHabit(h.id);
    });

    els.habitList.appendChild(item);
  }
}

function renderSelectedHabit() {
  const h = selectedHabitId ? getHabit(selectedHabitId) : null;

  if (!h) {
    els.selectedHabitArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">No habit selected</div>
        <div class="empty-sub">Choose a habit from the left panel to log and view charts.</div>
      </div>
    `;
    els.streakText.textContent = "Select a habit to view streak.";
    destroyCharts();
    return;
  }

  const dateISO = els.logDate.value || isoToday();
  const existing = h.logs[dateISO];

  // streak display
  let streak = 0;
  if (h.type === "tick") streak = computeTickStreak(h);
  else streak = computeNumericStreak(h);

  els.streakText.textContent = `Current streak: ${streak} day(s) • Habit: ${h.name}`;

  if (h.type === "tick") {
    const checked = existing === true ? "checked" : "";
    els.selectedHabitArea.innerHTML = `
      <div class="log-row">
        <div>
          <div class="big">${escapeHtml(h.name)}</div>
          <div class="muted" style="margin-top:6px;">
            Mark done for <b>${prettyDate(dateISO)}</b>. Stored locally.
          </div>
        </div>
        <div>
          <label class="label">
            Done?
            <div style="display:flex; gap:10px; align-items:center;">
              <input id="tickInput" type="checkbox" ${checked} style="transform:scale(1.4); accent-color: #63a7ff;" />
              <button id="clearLogBtn" class="btn ghost" type="button">Clear</button>
            </div>
          </label>
        </div>
      </div>
    `;

    const tick = document.getElementById("tickInput");
    const clearBtn = document.getElementById("clearLogBtn");

    tick.addEventListener("change", () => {
      setLog(h.id, dateISO, tick.checked ? true : false);
      renderAll();
    });

    clearBtn.addEventListener("click", () => {
      setLog(h.id, dateISO, null);
      renderAll();
    });

    destroyCharts();
    buildTickCharts(h);
  } else {
    const unit = h.unit ? ` (${h.unit})` : "";
    const val = (typeof existing === "number") ? existing : "";

    els.selectedHabitArea.innerHTML = `
      <div class="log-row">
        <div>
          <div class="big">${escapeHtml(h.name)}</div>
          <div class="muted" style="margin-top:6px;">
            Enter value for <b>${prettyDate(dateISO)}</b>${h.target != null ? ` • Target: <b>${h.target}${h.unit ? " " + h.unit : ""}</b>` : ""}.
          </div>
        </div>
        <div>
          <label class="label">
            Value${unit}
            <div style="display:flex; gap:10px;">
              <input id="numInput" class="input" type="number" step="1" placeholder="0" value="${val}" />
              <button id="saveNumBtn" class="btn primary" type="button">Save</button>
              <button id="clearLogBtn" class="btn ghost" type="button">Clear</button>
            </div>
          </label>
        </div>
      </div>
    `;

    const numInput = document.getElementById("numInput");
    const saveBtn = document.getElementById("saveNumBtn");
    const clearBtn = document.getElementById("clearLogBtn");

    saveBtn.addEventListener("click", () => {
      const n = clampNumber(Number(numInput.value));
      if (numInput.value === "") setLog(h.id, dateISO, null);
      else setLog(h.id, dateISO, n);
      renderAll();
    });

    clearBtn.addEventListener("click", () => {
      setLog(h.id, dateISO, null);
      renderAll();
    });

    destroyCharts();
    buildNumericCharts(h);
  }
}

function renderAll() {
  renderHabitList();
  renderSelectedHabit();
}

/* ---------- Safety: escape HTML ---------- */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- Events ---------- */

function syncTypeUI() {
  const t = els.habitType.value;
  els.unitWrap.style.display = (t === "numeric") ? "block" : "none";
  els.habitUnit.disabled = (t !== "numeric");
  els.habitTarget.disabled = (t !== "numeric");
  if (t !== "numeric") {
    els.habitUnit.value = "";
    els.habitTarget.value = "";
  }
}

els.habitType.addEventListener("change", syncTypeUI);

els.habitForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.habitName.value.trim();
  const type = els.habitType.value;
  const unit = els.habitUnit.value.trim();
  const targetRaw = els.habitTarget.value;
  const target = targetRaw === "" ? null : clampNumber(Number(targetRaw));
  const rank = els.habitRank.value;

  if (!name) return;

  addHabit({ name, type, unit, target, rank });
  els.habitName.value = "";
  els.habitTarget.value = "";
  els.habitUnit.value = "";
  syncTypeUI();
});

els.logDate.addEventListener("change", () => {
  // date change affects streak and charts
  renderAll();
});

els.resetBtn.addEventListener("click", () => {
  const ok = confirm("Reset all habits and logs from this browser? This cannot be undone.");
  if (!ok) return;
  localStorage.removeItem(STORE_KEY);
  state = { habits: [] };
  selectedHabitId = null;
  destroyCharts();
  renderAll();
});

/* ---------- Init ---------- */
(function init(){
  const today = isoToday();
  els.todayText.textContent = prettyDate(today);
  els.logDate.value = today;
  syncTypeUI();

  // auto-select first habit if exists
  if (state.habits.length > 0) selectedHabitId = state.habits[0].id;

  renderAll();
})();
