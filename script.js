
"use strict";

/* ========================================
   STUDYSYNC 2.0 — TASK MANAGER + AUTH
======================================== */

const LEGACY = {
  tasks: "studysync2_tasks_v1",
  settings: "studysync2_reminder_settings_v1",
  notified: "studysync2_notified_reminders_v1"
};

const USERS_KEY = "studysync2_demo_users_v1";
const SESSION_KEY = "studysync2_demo_session_v1";
const MIGRATION_KEY = "studysync2_demo_migration_v1";

let STORAGE_KEY = LEGACY.tasks;
let SETTINGS_KEY = LEGACY.settings;
let NOTIFIED_KEY = LEGACY.notified;

let currentUsername = "";
let tasks = [];
let settings = { leadDays: 1, remindersEnabled: true };
let notified = {};
let calendarDate = new Date();
let selectedDate = dateKey(new Date());
let currentView = "dashboard";
let toastTimer = null;

const $ = id => document.getElementById(id);

/* DATE HELPERS */

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  if (!value) return new Date(NaN);
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(value) {
  if (!value) return "No deadline";
  return parseDate(value).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric"
  });
}

function dayDifference(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  })[c]);
}

function createId() {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = String(value);
}

function setValue(id, value) {
  const el = $(id);
  if (el) el.value = value;
}

function normalizePriority(value) {
  value = String(value || "medium").toLowerCase();
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function isCompleted(task) {
  return task.status === "completed";
}

function isOverdue(task) {
  return !isCompleted(task) && task.deadline < dateKey(new Date());
}

function priorityRank(value) {
  return { high: 0, medium: 1, low: 2 }[normalizePriority(value)];
}

/* ACCOUNT STORAGE */

function loadUsers() {
  try {
    const value = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.error("Could not load accounts:", error);
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function accountStorageKey(base, username) {
  return `${base}_account_${encodeURIComponent(username.toLowerCase())}`;
}

function setAccountStorageKeys(username) {
  STORAGE_KEY = accountStorageKey(LEGACY.tasks, username);
  SETTINGS_KEY = accountStorageKey(LEGACY.settings, username);
  NOTIFIED_KEY = accountStorageKey(LEGACY.notified, username);
}

function migrateOldDataIfNeeded() {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  const pairs = [
    [LEGACY.tasks, STORAGE_KEY],
    [LEGACY.settings, SETTINGS_KEY],
    [LEGACY.notified, NOTIFIED_KEY]
  ];

  pairs.forEach(([oldKey, newKey]) => {
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, oldValue);
    }
  });

  // Preserve the original data; don't delete the old keys.
  localStorage.setItem(MIGRATION_KEY, "true");
}

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];

    return saved.filter(t => t && t.title && t.deadline).map(t => ({
      ...t,
      id: String(t.id || createId()),
      title: String(t.title),
      subject: t.subject || "",
      description: t.description || "",
      priority: normalizePriority(t.priority),
      status: t.status === "completed" ? "completed" : "pending",
      createdAt: t.createdAt || new Date().toISOString()
    }));
  } catch (error) {
    console.error("Could not load tasks:", error);
    return [];
  }
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const days = Number(saved.leadDays);

    return {
      leadDays: Number.isFinite(days) ? Math.max(0, Math.min(7, days)) : 1,
      remindersEnabled: saved.remindersEnabled !== false
    };
  } catch {
    return { leadDays: 1, remindersEnabled: true };
  }
}

function loadNotified() {
  try {
    const value = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value : {};
  } catch {
    return {};
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function saveNotified() {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
}

function loadAccountData(username) {
  setAccountStorageKeys(username);
  migrateOldDataIfNeeded();
  tasks = loadTasks();
  settings = loadSettings();
  notified = loadNotified();
}

/* AUTHENTICATION SCREENS */

function showAuthScreen(mode = "login") {
  const auth = $("auth-screen");
  const app = document.querySelector(".app-shell");

  if (auth) auth.hidden = false;
  if (app) app.hidden = true;

  const isSignup = mode === "signup";
  if ($("login-form")) $("login-form").hidden = isSignup;
  if ($("signup-form")) $("signup-form").hidden = !isSignup;

  setText("auth-title", isSignup ? "Create your account" : "Welcome back!");
  setText(
    "auth-subtitle",
    isSignup
      ? "Start organizing your study journey."
      : "Sign in to continue your study journey."
  );

  setText("login-error", "");
  setText("signup-error", "");

  $("login-error")?.classList.remove("success");
  $("signup-error")?.classList.remove("success");
}

function showPlanner() {
  if ($("auth-screen")) $("auth-screen").hidden = true;
  const app = document.querySelector(".app-shell");
  if (app) app.hidden = false;

  setText("current-account-label", currentUsername);
}

function login(username, password) {
  const normalized = username.trim().toLowerCase();
  const user = loadUsers().find(account =>
    account.username.toLowerCase() === normalized
  );

  if (!user || user.password !== password) {
    setText("login-error", "Incorrect username or password.");
    $("login-error")?.classList.remove("success");
    return;
  }

  currentUsername = user.username;
  localStorage.setItem(SESSION_KEY, currentUsername);

  loadAccountData(currentUsername);
  showPlanner();
  setView("dashboard");

  updateStatus("In-app reminders are active. Enable browser notifications for pop-up alerts.");
  checkReminders();
}

function signup(username, password, confirmPassword) {
  const cleanUsername = username.trim();
  const normalized = cleanUsername.toLowerCase();

  if (!/^[A-Za-z0-9_-]{3,30}$/.test(cleanUsername)) {
    setText("signup-error", "Use 3–30 letters, numbers, underscores, or hyphens.");
    return;
  }

  if (password.length < 8) {
    setText("signup-error", "Your password must be at least 8 characters.");
    return;
  }

  if (password !== confirmPassword) {
    setText("signup-error", "Your passwords do not match.");
    return;
  }

  const users = loadUsers();

  if (users.some(account => account.username.toLowerCase() === normalized)) {
    setText("signup-error", "That username is already taken.");
    return;
  }

  users.push({
    username: cleanUsername,
    password,
    createdAt: new Date().toISOString()
  });

  saveUsers(users);

  /*
    IMPORTANT:
    Registration does NOT log the user in.
    Return to login and ask them to sign in.
  */
  currentUsername = "";
  localStorage.removeItem(SESSION_KEY);

  $("signup-form")?.reset();
  $("login-form")?.reset();

  showAuthScreen("login");
  setValue("login-username", cleanUsername);
  setText("login-error", "Account created successfully! Please sign in.");
  $("login-error")?.classList.add("success");
}

function logout() {
  closeModal();
  currentUsername = "";
  localStorage.removeItem(SESSION_KEY);

  tasks = [];
  settings = { leadDays: 1, remindersEnabled: true };
  notified = {};

  $("login-form")?.reset();
  $("signup-form")?.reset();

  showAuthScreen("login");
}

$("show-signup")?.addEventListener("click", () => {
  $("signup-form")?.reset();
  showAuthScreen("signup");
});

$("show-login")?.addEventListener("click", () => {
  $("login-form")?.reset();
  showAuthScreen("login");
});

$("login-form")?.addEventListener("submit", event => {
  event.preventDefault();
  login($("login-username")?.value || "", $("login-password")?.value || "");
});

$("signup-form")?.addEventListener("submit", event => {
  event.preventDefault();
  signup(
    $("signup-username")?.value || "",
    $("signup-password")?.value || "",
    $("signup-confirm-password")?.value || ""
  );
});

$("logout-btn")?.addEventListener("click", logout);

/* TOASTS AND NOTIFICATION STATUS */

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function updateStatus(message, error = false) {
  const status = $("notification-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error", error);
}

/* NAVIGATION */

function setView(view) {
  const views = ["dashboard", "tasks", "deadlines", "calendar", "progress"];
  if (!views.includes(view)) view = "dashboard";

  currentView = view;

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  const titles = {
    dashboard: "Welcome back, learner ✦",
    tasks: "My Tasks",
    deadlines: "Deadlines",
    calendar: "Study Calendar",
    progress: "My Progress"
  };

  setText("page-title", titles[view]);

  views.forEach(name => {
    const page = $(`page-${name}`);
    if (!page) return;
    page.hidden = name !== view;
    page.classList.toggle("hidden", name !== view);
  });

  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* TASK MODAL */

function openModal(task = null) {
  if (!currentUsername) return;

  const form = $("task-form");
  const modal = $("task-modal");
  if (!form || !modal) return;

  form.reset();

  setValue("task-id", task?.id || "");
  setText("modal-heading", task ? "Edit Task" : "Add a new task");
  setValue("task-title", task?.title || "");
  setValue("task-subject", task?.subject || "");
  setValue("task-description", task?.description || "");
  setValue("task-deadline", task?.deadline || dateKey(new Date()));
  setValue("task-priority", normalizePriority(task?.priority));
  setValue("task-status", task?.status || "pending");

  modal.hidden = false;
  modal.classList.remove("hidden");
  modal.classList.add("open");
  $("task-title")?.focus();
}

function closeModal() {
  const modal = $("task-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.classList.add("hidden");
  modal.classList.remove("open");
}

/* CREATE, EDIT, DELETE, COMPLETE TASKS */

function saveTask(event) {
  event.preventDefault();
  if (!currentUsername) return;

  const title = $("task-title")?.value.trim() || "";
  const subject = $("task-subject")?.value.trim() || "";
  const description = $("task-description")?.value.trim() || "";
  const deadline = $("task-deadline")?.value || "";
  const id = $("task-id")?.value || "";
  const oldTask = tasks.find(task => task.id === id);

  if (!title || !deadline) {
    showToast("Please enter a title and deadline.");
    return;
  }

  const task = {
    id: id || createId(),
    title, subject, description, deadline,
    priority: normalizePriority($("task-priority")?.value),
    status: $("task-status")?.value === "completed" ? "completed" : "pending",
    createdAt: oldTask?.createdAt || new Date().toISOString()
  };

  if (oldTask) {
    tasks = tasks.map(item => item.id === id ? task : item);
    showToast("Task updated successfully.");
  } else {
    tasks.push(task);
    showToast("Task added successfully.");
  }

  Object.keys(notified).forEach(key => {
    if (key.startsWith(`${task.id}:`)) delete notified[key];
  });

  saveTasks();
  saveNotified();
  closeModal();
  renderAll();
  checkReminders();
}

function deleteTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task || !currentUsername) return;
  if (!confirm(`Delete "${task.title}"?`)) return;

  tasks = tasks.filter(item => item.id !== id);

  Object.keys(notified).forEach(key => {
    if (key.startsWith(`${id}:`)) delete notified[key];
  });

  saveTasks();
  saveNotified();
  renderAll();
  showToast("Task deleted.");
}

function toggleTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task || !currentUsername) return;

  task.status = isCompleted(task) ? "pending" : "completed";
  saveTasks();
  renderAll();

  showToast(isCompleted(task)
    ? "Task completed! Great job."
    : "Task marked as pending.");
}

/* FILTERING AND TASK CARDS */

function sortTasks(list, mode = "deadline") {
  const result = [...list];

  if (mode === "priority") {
    return result.sort((a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority) ||
      a.deadline.localeCompare(b.deadline)
    );
  }

  if (mode === "created") {
    return result.sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );
  }

  return result.sort((a, b) => a.deadline.localeCompare(b.deadline));
}

function getFilteredTasks(searchId, filterId, sortId, forcedFilter = null) {
  const search = $(searchId)?.value.trim().toLowerCase() || "";
  const filter = forcedFilter || $(filterId)?.value || "all";
  const sort = $(sortId)?.value || "deadline";

  let list = [...tasks];

  if (filter === "pending") list = list.filter(t => !isCompleted(t));
  if (filter === "completed") list = list.filter(isCompleted);
  if (filter === "overdue") list = list.filter(isOverdue);

  if (search) {
    list = list.filter(task =>
      [task.title, task.subject, task.description, task.priority]
        .some(value => String(value || "").toLowerCase().includes(search))
    );
  }

  return sortTasks(list, sort);
}

function taskCard(task) {
  const done = isCompleted(task);
  const overdue = isOverdue(task);
  const priority = normalizePriority(task.priority);
  const days = dayDifference(dateKey(new Date()), task.deadline);

  let deadlineText = formatDate(task.deadline);

  if (!done && days < 0) deadlineText += ` · ${Math.abs(days)} day(s) overdue`;
  else if (!done && days === 0) deadlineText += " · Due today";
  else if (!done && days === 1) deadlineText += " · Due tomorrow";

  return `
    <article class="task-item ${done ? "completed" : ""} ${overdue ? "overdue" : ""}">
      <div class="item-main">
        <div class="item-title">${escapeHTML(task.title)}</div>
        <div class="item-meta">
          ${escapeHTML(task.subject || "General")} · ${escapeHTML(deadlineText)}
          ${task.description ? `<br>${escapeHTML(task.description)}` : ""}
        </div>
      </div>
      <span class="priority ${priority}">${priority[0].toUpperCase() + priority.slice(1)}</span>
      <div class="item-actions">
        <button type="button" class="small-btn" data-action="toggle" data-id="${escapeHTML(task.id)}">${done ? "Reopen" : "Complete"}</button>
        <button type="button" class="small-btn" data-action="edit" data-id="${escapeHTML(task.id)}">Edit</button>
        <button type="button" class="small-btn danger" data-action="delete" data-id="${escapeHTML(task.id)}">Delete</button>
      </div>
    </article>
  `;
}

function renderContainer(id, list, emptyMessage) {
  const container = $(id);
  if (!container) return;

  container.innerHTML = list.length
    ? list.map(taskCard).join("")
    : `<div class="empty-state">${escapeHTML(emptyMessage)}</div>`;
}

function renderTasks() {
  const dashboardTasks = getFilteredTasks(
    "search-input", "status-filter", "sort-filter"
  );

  const allTasks = getFilteredTasks(
    "tasks-search-input", "tasks-status-filter", "tasks-sort-filter"
  );

  renderContainer("task-list", dashboardTasks,
    "Your study table is clear. Add a task to get started!");

  renderContainer("all-task-list", allTasks,
    "No tasks found. Try changing your filters or adding a task.");

  renderContainer("deadline-list",
    sortTasks(tasks.filter(task => !isCompleted(task))),
    "No upcoming deadlines. Enjoy your free time!");

  const hint = $("task-empty-hint");
  if (hint) hint.hidden = dashboardTasks.length > 0;
}

/* DASHBOARD STATS AND PROGRESS */

function renderStats() {
  const total = tasks.length;
  const completed = tasks.filter(isCompleted).length;
  const pending = tasks.filter(task => !isCompleted(task)).length;
  const overdue = tasks.filter(isOverdue).length;
  const percent = total ? Math.round(completed / total * 100) : 0;

  setText("total-tasks", total);
  setText("pending-tasks", pending);
  setText("completed-tasks", completed);
  setText("completion-rate", `${percent}%`);
  setText("progress-percent", `${percent}%`);
  setText("progress-details",
    `${completed} completed · ${pending} remaining · ${overdue} overdue`);
  setText("progress-completed", completed);
  setText("progress-pending", pending);
  setText("progress-overdue", overdue);

  const bar = $("progress-bar-large");
  if (bar) bar.style.width = `${percent}%`;
}

function renderTodayLabel() {
  setText("today-label", new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  }));
}

/* REMINDERS */

function renderReminders() {
  const today = dateKey(new Date());

  const upcoming = sortTasks(tasks.filter(task =>
    !isCompleted(task) &&
    dayDifference(today, task.deadline) <= settings.leadDays
  ));

  const area = $("upcoming-reminders");
  if (area) {
    area.innerHTML = upcoming.length
      ? upcoming.map(taskCard).join("")
      : `<div class="empty-state">You're all caught up! No urgent deadlines right now. ☕</div>`;
  }

  if ($("reminder-toggle")) $("reminder-toggle").checked = settings.remindersEnabled;
  if ($("reminder-days")) $("reminder-days").value = String(settings.leadDays);
  if ($("deadline-reminder-settings")) {
    $("deadline-reminder-settings").checked = settings.remindersEnabled;
  }
}

function checkReminders() {
  if (!currentUsername) return;
  renderReminders();
  if (!settings.remindersEnabled) return;

  const today = dateKey(new Date());

  tasks.forEach(task => {
    if (isCompleted(task)) return;

    const days = dayDifference(today, task.deadline);
    let kind = "";
    let message = "";

    if (days < 0) {
      kind = "overdue";
      message = `${task.title} is overdue.`;
    } else if (days === 0) {
      kind = "due";
      message = `${task.title} is due today.`;
    } else if (settings.leadDays > 0 && days === settings.leadDays) {
      kind = "upcoming";
      message = `${task.title} is due in ${days} day(s).`;
    }

    if (!kind) return;

    const key = `${task.id}:${task.deadline}:${kind}:${today}`;
    if (notified[key]) return;
    notified[key] = true;

    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("StudySync 2.0 — Deadline Reminder", { body: message });
      } catch (error) {
        console.warn("Notification could not be displayed:", error);
      }
    }
  });

  saveNotified();
}

function saveReminderPreferences() {
  if (!currentUsername) return;

  const days = Number($("reminder-days")?.value ?? settings.leadDays);
  settings.leadDays = Number.isFinite(days) ? Math.max(0, Math.min(7, days)) : 1;

  const toggle = $("reminder-toggle");
  const deadlineToggle = $("deadline-reminder-settings");

  if (toggle) settings.remindersEnabled = toggle.checked;
  if (deadlineToggle) settings.remindersEnabled = deadlineToggle.checked;

  saveSettings();
  renderAll();
  checkReminders();
  showToast("Reminder settings saved.");
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    updateStatus("Your browser does not support notifications.", true);
    return;
  }

  if (Notification.permission === "granted") {
    updateStatus("Browser notifications are already enabled.");
    showToast("Notifications are already enabled.");
    return;
  }

  if (Notification.permission === "denied") {
    updateStatus("Notifications are blocked. Check your browser site permissions.", true);
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      updateStatus("Browser notifications enabled!");
      showToast("Notifications enabled!");
      checkReminders();
    } else {
      updateStatus("Permission was not granted. In-app reminders are still available.");
    }
  } catch {
    updateStatus("Use localhost or HTTPS to enable browser notifications.", true);
  }
}

/* CALENDAR */

function renderCalendarGrid(gridId, monthId) {
  const grid = $(gridId);
  if (!grid) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  setText(monthId, calendarDate.toLocaleDateString(undefined, {
    month: "long", year: "numeric"
  }));

  const firstDay = new Date(year, month, 1).getDay();
  const startDate = new Date(year, month, 1 - firstDay);
  const today = dateKey(new Date());
  let html = "";

  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const key = dateKey(date);
    const dayTasks = sortTasks(tasks.filter(task => task.deadline === key));

    const classes = [
      "calendar-day",
      date.getMonth() !== month ? "outside" : "",
      key === selectedDate ? "selected" : "",
      key === today ? "today" : ""
    ].filter(Boolean).join(" ");

    html += `
      <button type="button" class="${classes}" data-date="${key}"
        aria-label="${formatDate(key)}, ${dayTasks.length} task(s)">
        <span class="day-number">${date.getDate()}</span>
        ${dayTasks.slice(0, 3).map(task => `
          <span class="calendar-task ${isOverdue(task) ? "overdue" : ""} ${isCompleted(task) ? "done" : ""}">
            ${escapeHTML(task.title)}
          </span>`).join("")}
        ${dayTasks.length > 3
          ? `<span class="calendar-task">+${dayTasks.length - 3} more</span>`
          : ""}
      </button>`;
  }

  grid.innerHTML = html;
}

function renderSelectedDateTasks() {
  setText("selected-date-title", `Tasks for ${formatDate(selectedDate)}`);
  renderContainer("selected-date-tasks",
    sortTasks(tasks.filter(task => task.deadline === selectedDate)),
    "No tasks due on this date.");
}

function renderCalendar() {
  renderCalendarGrid("calendar-grid", "calendar-month");
  renderCalendarGrid("calendar-grid-page", "calendar-month-page");
  renderSelectedDateTasks();
}

function changeMonth(amount) {
  calendarDate = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth() + amount,
    1
  );
  renderCalendar();
}

function selectCalendarDate(key) {
  selectedDate = key;
  const date = parseDate(key);
  calendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar();
}

/* RENDER EVERYTHING */

function renderAll() {
  if (!currentUsername) return;
  renderTodayLabel();
  renderStats();
  renderTasks();
  renderReminders();
  renderCalendar();
}

/* EVENT LISTENERS */

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    if (currentUsername) setView(button.dataset.go);
  });
});

$("add-task-btn")?.addEventListener("click", () => openModal());
$("close-modal")?.addEventListener("click", closeModal);
$("cancel-modal")?.addEventListener("click", closeModal);
$("task-form")?.addEventListener("submit", saveTask);

$("task-modal")?.addEventListener("click", event => {
  if (event.target === $("task-modal")) closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

document.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");

  if (button && currentUsername) {
    const { action, id } = button.dataset;

    if (action === "toggle") toggleTask(id);
    if (action === "edit") {
      const task = tasks.find(item => item.id === id);
      if (task) openModal(task);
    }
    if (action === "delete") deleteTask(id);
  }

  const dateButton = event.target.closest("button[data-date]");
  if (dateButton && currentUsername) selectCalendarDate(dateButton.dataset.date);
});

[
  "search-input", "status-filter", "sort-filter",
  "tasks-search-input", "tasks-status-filter", "tasks-sort-filter"
].forEach(id => {
  $(id)?.addEventListener("input", renderTasks);
  $(id)?.addEventListener("change", renderTasks);
});

$("prev-month")?.addEventListener("click", () => changeMonth(-1));
$("next-month")?.addEventListener("click", () => changeMonth(1));
$("prev-month-page")?.addEventListener("click", () => changeMonth(-1));
$("next-month-page")?.addEventListener("click", () => changeMonth(1));

$("reminder-toggle")?.addEventListener("change", saveReminderPreferences);
$("reminder-days")?.addEventListener("change", saveReminderPreferences);
$("deadline-reminder-settings")?.addEventListener("change", saveReminderPreferences);

$("enable-notifications")?.addEventListener("click", enableNotifications);
$("deadlines-notification-btn")?.addEventListener("click", enableNotifications);

$("notification-shortcut")?.addEventListener("click", () => {
  if (!currentUsername) return;
  setView("deadlines");
  enableNotifications();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && currentUsername) {
    renderAll();
    checkReminders();
  }
});

window.addEventListener("storage", event => {
  if (!currentUsername) return;

  if (event.key === STORAGE_KEY) tasks = loadTasks();
  if (event.key === SETTINGS_KEY) settings = loadSettings();
  if (event.key === NOTIFIED_KEY) notified = loadNotified();

  renderAll();
});

/* STARTUP */

function startStudySync() {
  const savedUsername = localStorage.getItem(SESSION_KEY);
  const users = loadUsers();

  const savedUser = users.find(account =>
    account.username === savedUsername
  );

  if (savedUser) {
    currentUsername = savedUser.username;
    loadAccountData(currentUsername);
    showPlanner();
    setView("dashboard");

    updateStatus("In-app reminders are active. Enable browser notifications for pop-up alerts.");
    checkReminders();
  } else {
    currentUsername = "";
    localStorage.removeItem(SESSION_KEY);
    showAuthScreen("login");
  }
}

startStudySync();

setInterval(() => {
  if (currentUsername) checkReminders();
}, 60000);
