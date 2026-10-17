
"use strict";

/* ==========================================
   STUDYSYNC 2.0
   Browser-based student planner
   ========================================== */

const STORAGE = {
  users: "studysync2_demo_users_v1",
  session: "studysync2_demo_session_v1",
  tasks: "studysync2_tasks_v1",
  reminders: "studysync2_reminder_settings_v1",
  notified: "studysync2_notified_reminders_v1",
  migration: "studysync2_demo_migration_v1"
};

let currentUsername = "";
let tasks = [];
let activeView = "dashboard";
let activeFilter = "all";
let calendarDate = new Date();
let selectedCalendarDate = dateKey(new Date());
let toastTimeout = null;
let reminderInterval = null;

/* ==========================================
   ELEMENT HELPERS
   ========================================== */

const $ = (selector) => document.querySelector(selector);

function getElement(id) {
  return document.getElementById(id);
}

function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.error("Could not read browser data:", error);
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save browser data:", error);
    showToast("Unable to save. Check your browser storage.");
    return false;
  }
}

function accountKey(base, username = currentUsername) {
  return `${base}_account_${encodeURIComponent(username.toLowerCase())}`;
}

function getUsers() {
  const users = safeRead(STORAGE.users, []);
  return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
  return safeWrite(STORAGE.users, users);
}

function getReminderEnabled() {
  return safeRead(accountKey(STORAGE.reminders), true) !== false;
}

function saveReminderEnabled(enabled) {
  return safeWrite(accountKey(STORAGE.reminders), enabled);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  if (!value) return null;

  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;

  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatDate(value, options = {}) {
  const date = parseDate(value);
  if (!date) return "No deadline";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: options.year ? "numeric" : undefined
  });
}

function sameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

function todayKey() {
  return dateKey(new Date());
}

function isOverdue(task) {
  return Boolean(
    task.deadline &&
    task.deadline < todayKey() &&
    task.status !== "completed"
  );
}

function getTaskStatus(task) {
  if (task.status === "completed") return "completed";
  if (isOverdue(task)) return "overdue";
  return "pending";
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ==========================================
   AUTHENTICATION
   ========================================== */

function showAuthScreen(mode = "login") {
  const isSignup = mode === "signup";

  getElement("auth-screen").hidden = false;
  $(".app-shell").hidden = true;

  getElement("login-form").hidden = isSignup;
  getElement("signup-form").hidden = !isSignup;

  getElement("show-signup").hidden = isSignup;
  getElement("show-login").hidden = !isSignup;

  getElement("auth-title").textContent = isSignup
    ? "Create your account."
    : "Welcome back.";

  getElement("auth-subtitle").textContent = isSignup
    ? "Make a little space for your goals."
    : "A little progress every day goes a long way.";

  getElement("auth-switch-text").textContent = isSignup
    ? "Already have an account?"
    : "Don't have an account?";

  getElement("login-error").hidden = true;
  getElement("signup-error").hidden = true;

  if (isSignup) {
    getElement("signup-username").focus();
  } else {
    getElement("login-username").focus();
  }
}

function showPlanner() {
  getElement("auth-screen").hidden = true;
  $(".app-shell").hidden = false;

  getElement("sidebar-username").textContent = currentUsername;
  getElement("sidebar-avatar").textContent =
    currentUsername.charAt(0).toUpperCase() || "S";

  getElement("welcome-title").textContent =
    `Let's make today count, ${currentUsername}.`;

  updateDateLabels();
}

function showFormError(id, message) {
  const element = getElement(id);
  element.textContent = message;
  element.hidden = false;
}

function login(username, password) {
  const cleanUsername = username.trim();
  const users = getUsers();

  const user = users.find((item) =>
    item.username.toLowerCase() === cleanUsername.toLowerCase()
  );

  if (!user || user.password !== password) {
    showFormError("login-error", "Incorrect username or password.");
    return;
  }

  currentUsername = user.username;

  if (!safeWrite(STORAGE.session, { username: user.username })) {
    currentUsername = "";
    showFormError(
      "login-error",
      "Your browser could not save the session. Check browser storage settings."
    );
    return;
  }

  loadAccountData();
  showPlanner();
  setView("dashboard");
  renderAll();
  syncReminderControls();
  checkReminders();
  showToast(`Welcome back, ${currentUsername}!`);
}

function signup(username, password, confirmPassword) {
  const cleanUsername = username.trim();

  if (!/^[A-Za-z0-9_-]{3,30}$/.test(cleanUsername)) {
    showFormError(
      "signup-error",
      "Use 3–30 letters, numbers, underscores, or hyphens."
    );
    return;
  }

  if (password.length < 8) {
    showFormError(
      "signup-error",
      "Your password must contain at least 8 characters."
    );
    return;
  }

  if (password !== confirmPassword) {
    showFormError("signup-error", "Your passwords do not match.");
    return;
  }

  const users = getUsers();

  if (users.some((user) =>
    user.username.toLowerCase() === cleanUsername.toLowerCase()
  )) {
    showFormError("signup-error", "That username is already taken.");
    return;
  }

  /*
   * DEMO ONLY:
   * Passwords are stored in localStorage and are not encrypted.
   * Do not use this authentication design for a public production app.
   */
  users.push({
    username: cleanUsername,
    password,
    createdAt: new Date().toISOString()
  });

  if (!saveUsers(users)) {
    showFormError(
      "signup-error",
      "Could not save your account. Check browser storage."
    );
    return;
  }

  getElement("signup-form").reset();
  showAuthScreen("login");
  getElement("login-username").value = cleanUsername;

  showFormError(
    "login-error",
    "Account created! Log in using your new username and password."
  );
}

function logout() {
  if (!safeWrite(STORAGE.session, null)) return;

  currentUsername = "";
  tasks = [];
  closeTaskModal();
  getElement("reminder-panel").hidden = true;
  showAuthScreen("login");
  showToast("You have logged out.");
}

/* ==========================================
   ACCOUNT-SPECIFIC DATA
   ========================================== */

function loadAccountData() {
  const storedTasks = safeRead(accountKey(STORAGE.tasks), null);

  if (Array.isArray(storedTasks)) {
    tasks = storedTasks
      .filter((task) => task && typeof task === "object")
      .map((task) => ({
        id: String(task.id || makeId()),
        title: String(task.title || "Untitled task"),
        subject: String(task.subject || ""),
        description: String(task.description || ""),
        deadline: String(task.deadline || ""),
        priority: ["low", "medium", "high"].includes(task.priority)
          ? task.priority
          : "medium",
        status: task.status === "completed" ? "completed" : "pending",
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
      }));
  } else {
    tasks = [];
  }

  // Read the older global task key only if this account has no saved task list.
  // Do not automatically copy global data to every account.
  if (
    storedTasks === null &&
    safeRead(STORAGE.migration, false) !== true
  ) {
    const oldTasks = safeRead(STORAGE.tasks, null);

    if (
      Array.isArray(oldTasks) &&
      oldTasks.length > 0 &&
      getUsers().length === 1
    ) {
      tasks = oldTasks.map((task) => ({
        id: String(task.id || makeId()),
        title: String(task.title || "Untitled task"),
        subject: String(task.subject || ""),
        description: String(task.description || ""),
        deadline: String(task.deadline || ""),
        priority: ["low", "medium", "high"].includes(task.priority)
          ? task.priority
          : "medium",
        status: task.status === "completed" ? "completed" : "pending",
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
      }));

      safeWrite(accountKey(STORAGE.tasks), tasks);
    }

    safeWrite(STORAGE.migration, true);
  }
}

function saveTasks() {
  return safeWrite(accountKey(STORAGE.tasks), tasks);
}

/* ==========================================
   NAVIGATION
   ========================================== */

const viewTitles = {
  dashboard: "Dashboard",
  tasks: "My Tasks",
  deadlines: "Deadlines",
  calendar: "Calendar",
  progress: "My Progress"
};

function setView(view) {
  if (!viewTitles[view]) return;

  activeView = view;

  document.querySelectorAll(".page-section").forEach((section) => {
    section.hidden = section.id !== `page-${view}`;
  });

  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  getElement("page-title").textContent = viewTitles[view];

  renderAll();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateDateLabels() {
  const now = new Date();

  getElement("today-label").textContent =
    now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase();

  getElement("topbar-date").textContent =
    now.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
}

/* ==========================================
   TASK CREATION / EDITING
   ========================================== */

function openTaskModal(taskId = "") {
  const form = getElement("task-form");
  form.reset();

  getElement("task-id").value = "";
  getElement("task-priority").value = "medium";
  getElement("task-status").value = "pending";
  getElement("task-form-error").hidden = true;

  if (taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    getElement("task-id").value = task.id;
    getElement("task-title").value = task.title;
    getElement("task-subject").value = task.subject;
    getElement("task-description").value = task.description;
    getElement("task-deadline").value = task.deadline;
    getElement("task-priority").value = task.priority;
    getElement("task-status").value = task.status;

    getElement("modal-title").textContent = "Edit task";
    getElement("save-task-btn").textContent = "Save changes";
  } else {
    getElement("modal-title").textContent = "Create a task";
    getElement("save-task-btn").textContent = "Save task";
  }

  getElement("task-modal").hidden = false;
  document.body.style.overflow = "hidden";
  getElement("task-title").focus();
}

function closeTaskModal() {
  getElement("task-modal").hidden = true;
  document.body.style.overflow = "";
}

function saveTaskFromForm(event) {
  event.preventDefault();

  const title = getElement("task-title").value.trim();

  if (!title) {
    showFormError("task-form-error", "Please enter a task title.");
    return;
  }

  const id = getElement("task-id").value;
  const existingTask = id ? tasks.find((task) => task.id === id) : null;

  const task = {
    id: id || makeId(),
    title,
    subject: getElement("task-subject").value.trim(),
    description: getElement("task-description").value.trim(),
    deadline: getElement("task-deadline").value,
    priority: getElement("task-priority").value,
    status: getElement("task-status").value,
    createdAt: existingTask?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingTask) {
    tasks = tasks.map((item) => item.id === id ? task : item);
  } else {
    tasks.unshift(task);
  }

  if (!saveTasks()) {
    loadAccountData();
    renderAll();
    return;
  }

  closeTaskModal();
  renderAll();
  showToast(existingTask ? "Task updated!" : "Task created!");
}

function toggleTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  task.status = task.status === "completed" ? "pending" : "completed";
  task.updatedAt = new Date().toISOString();

  if (!saveTasks()) {
    loadAccountData();
    renderAll();
    return;
  }

  renderAll();
  showToast(
    task.status === "completed" ? "Task completed. Great job!" : "Task marked pending."
  );
}

function deleteTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;

  const confirmed = window.confirm(`Delete "${task.title}"?`);
  if (!confirmed) return;

  const oldTasks = tasks;
  tasks = tasks.filter((item) => item.id !== taskId);

  if (!saveTasks()) {
    tasks = oldTasks;
    renderAll();
    return;
  }

  renderAll();
  showToast("Task deleted.");
}

/* ==========================================
   TASK RENDERING
   ========================================== */

function taskCardHTML(task) {
  const status = getTaskStatus(task);

  const statusLabel = {
    pending: "Pending",
    completed: "Completed",
    overdue: "Overdue"
  }[status];

  const priorityLabel =
    task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

  const deadlineClass = isOverdue(task) ? "deadline-overdue" : "";

  return `
    <article class="task-card ${status === "completed" ? "completed" : ""}">
      <button
        class="task-check"
        type="button"
        data-action="toggle"
        data-id="${escapeHTML(task.id)}"
        aria-label="${status === "completed" ? "Mark pending" : "Mark completed"}"
        title="${status === "completed" ? "Mark pending" : "Mark completed"}"
      >${status === "completed" ? "✓" : ""}</button>

      <div class="task-card-body">
        <div class="task-title-row">
          <h3 class="task-title">${escapeHTML(task.title)}</h3>
          <span class="status-badge status-${status}">${statusLabel}</span>
        </div>

        ${task.description
          ? `<p class="task-description">${escapeHTML(task.description)}</p>`
          : ""}

        <div class="task-meta">
          ${task.subject
            ? `<span class="task-subject">${escapeHTML(task.subject)}</span>`
            : ""}

          <span class="priority priority-${escapeHTML(task.priority)}">
            ${priorityLabel} priority
          </span>

          ${task.deadline
            ? `<span class="task-deadline ${deadlineClass}">
                ◷ ${escapeHTML(formatDate(task.deadline, { year: true }))}
              </span>`
            : ""}
        </div>
      </div>

      <div class="task-actions">
        <button class="task-action" type="button"
          data-action="edit" data-id="${escapeHTML(task.id)}"
          aria-label="Edit task" title="Edit task">✎</button>
        <button class="task-action delete-action" type="button"
          data-action="delete" data-id="${escapeHTML(task.id)}"
          aria-label="Delete task" title="Delete task">×</button>
      </div>
    </article>
  `;
}

function renderTaskList(containerId, list) {
  const container = getElement(containerId);
  if (!container) return;

  container.innerHTML = list.map(taskCardHTML).join("");
}

function sortTasksByDeadline(list) {
  return [...list].sort((a, b) => {
    if (!a.deadline && !b.deadline) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }

    if (!a.deadline) return 1;
    if (!b.deadline) return -1;

    return a.deadline.localeCompare(b.deadline);
  });
}

function renderDashboardTasks() {
  const list = sortTasksByDeadline(
    tasks.filter((task) => task.status !== "completed")
  ).slice(0, 5);

  renderTaskList("dashboard-task-list", list);
  getElement("dashboard-empty").hidden = list.length > 0;
}

function renderAllTasks() {
  let list = [...tasks];

  if (activeFilter === "pending") {
    list = list.filter((task) => task.status !== "completed" && !isOverdue(task));
  } else if (activeFilter === "completed") {
    list = list.filter((task) => task.status === "completed");
  } else if (activeFilter === "overdue") {
    list = list.filter(isOverdue);
  }

  list = sortTasksByDeadline(list);
  renderTaskList("all-task-list", list);
  getElement("tasks-empty").hidden = list.length > 0;

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === activeFilter);
  });
}

function renderDeadlines() {
  const today = todayKey();
  const todayDate = parseDate(today);
  const weekEnd = new Date(todayDate);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndKey = dateKey(weekEnd);

  const unfinished = tasks.filter((task) => task.status !== "completed");
  const dueToday = unfinished.filter((task) => task.deadline === today);
  const dueWeek = unfinished.filter((task) =>
    task.deadline && task.deadline >= today && task.deadline <= weekEndKey
  );
  const overdue = unfinished.filter(isOverdue);

  getElement("due-today-count").textContent = dueToday.length;
  getElement("due-week-count").textContent = dueWeek.length;
  getElement("deadline-overdue-count").textContent = overdue.length;

  const list = sortTasksByDeadline(
    tasks.filter((task) => Boolean(task.deadline))
  );

  renderTaskList("deadline-list", list);
  getElement("deadlines-empty").hidden = list.length > 0;
}

/* ==========================================
   STATS AND PROGRESS
   ========================================== */

function renderStats() {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const overdue = tasks.filter(isOverdue).length;
  const pending = total - completed;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  getElement("stat-total").textContent = total;
  getElement("stat-pending").textContent = pending;
  getElement("stat-completed").textContent = completed;
  getElement("stat-rate").textContent = `${percent}%`;
  getElement("nav-task-count").textContent = pending;

  getElement("progress-percent").textContent = `${percent}%`;
  getElement("progress-completed").textContent = completed;
  getElement("progress-pending").textContent = pending;
  getElement("progress-overdue").textContent = overdue;

  getElement("progress-ring").style.background =
    `conic-gradient(var(--green) ${percent}%, #edf1e8 ${percent}%)`;

  getElement("progress-message").textContent =
    total === 0 ? "Add a task to start tracking your progress."
    : percent === 100 ? "Amazing work! You've completed every task."
    : percent >= 70 ? "You're doing great. Keep it up!"
    : percent >= 35 ? "You're making progress. Keep going!"
    : "Every small step counts.";

  getElement("progress-bar-large").style.width = `${percent}%`;
  getElement("progress-large-percent").textContent = `${percent}%`;
  getElement("progress-bar-label").textContent =
    `${completed} of ${total} tasks completed`;

  getElement("progress-heading").textContent =
    percent === 100 && total > 0
      ? "You did it. Every task is complete!"
      : "You're building good habits.";

  getElement("progress-description").textContent =
    total === 0
      ? "Create your first task to begin tracking your progress."
      : `${pending} task${pending === 1 ? "" : "s"} still to work on. Take it one step at a time.`;

  getElement("progress-page-completed").textContent = completed;
  getElement("progress-page-pending").textContent = pending;
  getElement("progress-page-overdue").textContent = overdue;
  getElement("progress-page-total").textContent = total;

  const recentlyCompleted = tasks
    .filter((task) => task.status === "completed")
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5);

  renderTaskList("completed-task-list", recentlyCompleted);
  getElement("completed-empty").hidden = recentlyCompleted.length > 0;
}

/* ==========================================
   CALENDAR
   ========================================== */

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function renderCalendarGrid(containerId, compact = false) {
  const container = getElement(containerId);
  if (!container) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();

  let html = weekdayLabels.map((day) =>
    `<div class="calendar-weekday">${day}</div>`
  ).join("");

  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  for (let cell = 0; cell < totalCells; cell++) {
    let dayNumber;
    let cellDate;
    let otherMonth = false;

    if (cell < startWeekday) {
      dayNumber = daysInPreviousMonth - startWeekday + cell + 1;
      cellDate = new Date(year, month - 1, dayNumber);
      otherMonth = true;
    } else if (cell >= startWeekday + daysInMonth) {
      dayNumber = cell - startWeekday - daysInMonth + 1;
      cellDate = new Date(year, month + 1, dayNumber);
      otherMonth = true;
    } else {
      dayNumber = cell - startWeekday + 1;
      cellDate = new Date(year, month, dayNumber);
    }

    const key = dateKey(cellDate);
    const dayTasks = tasks.filter((task) => task.deadline === key);
    const todayClass = sameDay(cellDate, new Date()) ? "today" : "";
    const selectedClass = selectedCalendarDate === key ? "selected" : "";
    const otherClass = otherMonth ? "other-month" : "";

    const dots = dayTasks.slice(0, compact ? 3 : 5).map((task) => {
      let dotClass = "";
      if (task.status === "completed") dotClass = "dot-done";
      else if (task.priority === "high" || isOverdue(task)) dotClass = "dot-high";

      return `<span class="calendar-dot ${dotClass}"></span>`;
    }).join("");

    html += `
      <button class="calendar-day ${todayClass} ${selectedClass} ${otherClass}"
        type="button" data-calendar-date="${key}"
        aria-label="${escapeHTML(formatDate(key, { year: true }))}, ${dayTasks.length} tasks">
        <span class="calendar-day-number">${dayNumber}</span>
        ${dayTasks.length ? `<span class="calendar-dots">${dots}</span>` : ""}
      </button>
    `;
  }

  container.innerHTML = html;
}

function renderSelectedDateTasks() {
  const selectedDate = parseDate(selectedCalendarDate);

  getElement("selected-date-title").textContent = selectedDate
    ? `Tasks for ${selectedDate.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric"
      })}`
    : "Tasks for this day";

  const list = sortTasksByDeadline(
    tasks.filter((task) => task.deadline === selectedCalendarDate)
  );

  renderTaskList("selected-date-tasks", list);
  getElement("selected-date-empty").hidden = list.length > 0;
}

function renderCalendar() {
  getElement("calendar-month-title").textContent =
    calendarDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });

  renderCalendarGrid("calendar-grid", true);
  renderCalendarGrid("calendar-grid-page", false);
  renderSelectedDateTasks();
}

function changeCalendarMonth(amount) {
  calendarDate = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth() + amount,
    1
  );

  renderCalendar();
}

/* ==========================================
   REMINDERS
   ========================================== */

function syncReminderControls() {
  const enabled = getReminderEnabled();
  getElement("reminder-toggle").checked = enabled;
}

function handleReminderChange(event) {
  const enabled = event.target.checked;

  if (!saveReminderEnabled(enabled)) {
    syncReminderControls();
    return;
  }

  syncReminderControls();
  showToast(enabled ? "Deadline reminders enabled." : "Deadline reminders disabled.");

  if (enabled) checkReminders();
}

function checkReminders() {
  if (!currentUsername || !getReminderEnabled()) return;

  const today = todayKey();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);

  const notifiedKey = accountKey(STORAGE.notified);
  const notified = safeRead(notifiedKey, {});
  const updatedNotified = { ...notified };
  let changed = false;

  tasks.forEach((task) => {
    if (!task.deadline || task.status === "completed") return;

    let message = "";

    if (task.deadline < today) {
      message = `Overdue: ${task.title}`;
    } else if (task.deadline === today) {
      message = `Due today: ${task.title}`;
    } else if (task.deadline === tomorrow) {
      message = `Due tomorrow: ${task.title}`;
    }

    if (!message) return;

    const reminderId = `${task.id}:${task.deadline}:${today}`;

    if (updatedNotified[reminderId]) return;

    updatedNotified[reminderId] = true;
    changed = true;
    showToast(message);
  });

  if (changed) {
    safeWrite(notifiedKey, updatedNotified);
  }
}

/* ==========================================
   TOAST
   ========================================== */

function showToast(message) {
  const toast = getElement("toast");
  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimeout) clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

/* ==========================================
   RENDER EVERYTHING
   ========================================== */

function renderAll() {
  if (!currentUsername) return;

  updateDateLabels();
  renderStats();
  renderDashboardTasks();
  renderAllTasks();
  renderDeadlines();
  renderCalendar();
}

/* ==========================================
   EVENT LISTENERS
   ========================================== */

getElement("login-form").addEventListener("submit", (event) => {
  event.preventDefault();

  login(
    getElement("login-username").value,
    getElement("login-password").value
  );
});

getElement("signup-form").addEventListener("submit", (event) => {
  event.preventDefault();

  signup(
    getElement("signup-username").value,
    getElement("signup-password").value,
    getElement("signup-confirm").value
  );
});

getElement("show-signup").addEventListener("click", () => {
  showAuthScreen("signup");
});

getElement("show-login").addEventListener("click", () => {
  showAuthScreen("login");
});

getElement("logout-btn").addEventListener("click", logout);

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.go));
});

document.querySelectorAll("[data-add-task]").forEach((button) => {
  button.addEventListener("click", () => openTaskModal());
});

getElement("add-task-btn").addEventListener("click", () => openTaskModal());

getElement("task-form").addEventListener("submit", saveTaskFromForm);

getElement("close-modal-btn").addEventListener("click", closeTaskModal);
getElement("cancel-task-btn").addEventListener("click", closeTaskModal);

getElement("task-modal").addEventListener("click", (event) => {
  if (event.target === getElement("task-modal")) closeTaskModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!getElement("task-modal").hidden) closeTaskModal();
    if (!getElement("reminder-panel").hidden) {
      getElement("reminder-panel").hidden = true;
    }
  }
});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    renderAllTasks();
  });
});

// Event delegation allows task controls to work after every re-render.
document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");

  if (actionButton) {
    const taskId = actionButton.dataset.id;
    const action = actionButton.dataset.action;

    if (action === "toggle") toggleTask(taskId);
    if (action === "edit") openTaskModal(taskId);
    if (action === "delete") deleteTask(taskId);

    return;
  }

  const calendarButton = event.target.closest("[data-calendar-date]");

  if (calendarButton) {
    selectedCalendarDate = calendarButton.dataset.calendarDate;

    const date = parseDate(selectedCalendarDate);
    if (date) {
      calendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
    }

    renderCalendar();
  }
});

getElement("calendar-prev").addEventListener("click", () => {
  changeCalendarMonth(-1);
});

getElement("calendar-next").addEventListener("click", () => {
  changeCalendarMonth(1);
});

getElement("calendar-today").addEventListener("click", () => {
  calendarDate = new Date();
  selectedCalendarDate = todayKey();
  renderCalendar();
});

getElement("notification-shortcut").addEventListener("click", () => {
  const panel = getElement("reminder-panel");
  panel.hidden = !panel.hidden;
});

getElement("close-reminder-panel").addEventListener("click", () => {
  getElement("reminder-panel").hidden = true;
});

getElement("reminder-toggle").addEventListener("change", handleReminderChange);

/* ==========================================
   STARTUP
   ========================================== */

function startStudySync() {
  // Hide the main app immediately; login is the initial screen.
  getElement("auth-screen").hidden = false;
  $(".app-shell").hidden = true;

  const session = safeRead(STORAGE.session, null);

  if (session && typeof session.username === "string") {
    const user = getUsers().find((item) =>
      item.username.toLowerCase() === session.username.toLowerCase()
    );

    if (user) {
      currentUsername = user.username;
      loadAccountData();
      showPlanner();
      setView("dashboard");
      syncReminderControls();
      checkReminders();

      reminderInterval = window.setInterval(() => {
        if (currentUsername) checkReminders();
      }, 60000);

      return;
    }

    safeWrite(STORAGE.session, null);
  }

  showAuthScreen("login");
}

startStudySync();
