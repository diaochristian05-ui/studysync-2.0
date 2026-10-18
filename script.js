
  "use strict";

  /* ==========================================
    STUDYSYNC 2.0 — COMPLETE APPLICATION
    ========================================== */

  const STORAGE = {
    users: "studysync2_demo_users_v1",
    session: "studysync2_demo_session_v1",
    tasks: "studysync2_tasks_v1",
    reminders: "studysync2_reminder_settings_v1",
    notified: "studysync2_notified_reminders_v1",
    theme: "studysync2_theme"
  };

  let currentUsername = "";
  let tasks = [];
  let activeView = "dashboard";
  let activeFilter = "all";
  let calendarDate = new Date();
  let selectedCalendarDate = dateKey(new Date());
  let toastTimeout = null;
  let reminderInterval = null;

  const $ = (selector) => document.querySelector(selector);
  const getElement = (id) => document.getElementById(id);

  function safeRead(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn("Could not read saved data:", error);
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Could not save data:", error);
      showToast("Could not save your changes. Check browser storage.");
      return false;
    }
  }

  function accountKey(base) {
    return `${base}_account_${encodeURIComponent(currentUsername.toLowerCase())}`;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function makeId() {
    return window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function dateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) return null;

    return date;
  }

  function formatDate(value, includeYear = false) {
    const date = parseDate(value);
    if (!date) return "No deadline";

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(includeYear ? { year: "numeric" } : {})
    });
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

  /* ==========================================
    DARK MODE
    ========================================== */

  function applyTheme(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";

    const themeButtons = [
      {
        button: getElement("theme-toggle"),
        icon: getElement("theme-icon"),
        label: getElement("theme-label")
      },
      {
        button: getElement("auth-theme-toggle"),
        icon: getElement("auth-theme-icon"),
        label: getElement("auth-theme-label")
      }
    ];

    themeButtons.forEach(({ button, icon, label }) => {
      if (icon) icon.textContent = isDark ? "☀️" : "🌙";
      if (label) label.textContent = isDark ? "Light Mode" : "Dark Mode";

      if (button) {
        button.setAttribute("aria-pressed", String(isDark));
        button.setAttribute(
          "aria-label",
          isDark ? "Switch to light mode" : "Switch to dark mode"
        );
      }
    });
  }

  function initializeTheme() {
    let savedTheme = "light";

    try {
      savedTheme = localStorage.getItem(STORAGE.theme) || "light";
    } catch (error) {
      console.warn("Could not read theme preference:", error);
    }

    applyTheme(savedTheme === "dark");

    function toggleTheme() {
      const isDark = !document.body.classList.contains("dark-mode");
      applyTheme(isDark);

      try {
        localStorage.setItem(STORAGE.theme, isDark ? "dark" : "light");
      } catch (error) {
        console.warn("Could not save theme preference:", error);
      }
    }

    getElement("theme-toggle").addEventListener("click", toggleTheme);
    getElement("auth-theme-toggle").addEventListener("click", toggleTheme);
  }

  /* ==========================================
    AUTHENTICATION
    ========================================== */

  function getUsers() {
    const users = safeRead(STORAGE.users, []);
    return Array.isArray(users) ? users : [];
  }

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

    getElement("login-error").hidden = true;
    getElement("signup-error").hidden = true;

    (isSignup
      ? getElement("signup-username")
      : getElement("login-username")).focus();
  }

  function showFormError(id, message) {
    const element = getElement(id);
    element.textContent = message;
    element.hidden = false;
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

  function login(username, password) {
    const cleanUsername = username.trim();

    const user = getUsers().find((item) =>
      item.username.toLowerCase() === cleanUsername.toLowerCase()
    );

    if (!user || user.password !== password) {
      showFormError("login-error", "Incorrect username or password.");
      return;
    }

    if (!safeWrite(STORAGE.session, { username: user.username })) {
      showFormError("login-error", "Could not save your session in this browser.");
      return;
    }

    currentUsername = user.username;
    loadAccountData();
    showPlanner();
    setView("dashboard");
    syncReminderControls();
    checkReminders();
    showToast(`Welcome back, ${currentUsername}!`);
    startReminderChecks();
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
    * This browser-only demo stores passwords in localStorage.
    * It is not secure authentication for a public production website.
    */
    users.push({
      username: cleanUsername,
      password,
      createdAt: new Date().toISOString()
    });

    if (!safeWrite(STORAGE.users, users)) return;

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

    if (reminderInterval) {
      clearInterval(reminderInterval);
      reminderInterval = null;
    }

    closeTaskModal();
    getElement("reminder-panel").hidden = true;
    showAuthScreen("login");
    showToast("You have logged out.");
  }

  /* ==========================================
    ACCOUNT DATA AND TASK STORAGE
    ========================================== */

  function loadAccountData() {
    const storedTasks = safeRead(accountKey(STORAGE.tasks), []);

    tasks = Array.isArray(storedTasks)
      ? storedTasks
          .filter((task) => task && typeof task === "object")
          .map((task) => ({
            id: String(task.id || makeId()),
            title: String(task.title || "Untitled task"),
            subject: String(task.subject || ""),
            description: String(task.description || ""),
            deadline: parseDate(task.deadline) ? task.deadline : "",
            priority: ["low", "medium", "high"].includes(task.priority)
              ? task.priority
              : "medium",
            status: task.status === "completed" ? "completed" : "pending",
            createdAt: task.createdAt || new Date().toISOString(),
            updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
          }))
      : [];
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
    progress: "My Progress",
    members: "Group 2 PR2 Members"
  };

  function setView(view) {
    if (!viewTitles[view]) return;

    activeView = view;

    document.querySelectorAll(".page-section").forEach((section) => {
      section.hidden = section.id !== `page-${view}`;
    });

    document.querySelectorAll(".nav-link").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);

      if (button.dataset.view === view) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    getElement("page-title").textContent = viewTitles[view];

    if (view !== "members") {
      renderAll();
    }

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
    TASK MODAL
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

  /* ==========================================
    IMPROVED ADD AND EDIT TASK SYSTEM
    ========================================== */

  function saveTaskFromForm(event) {
    event.preventDefault();

    const title = getElement("task-title").value.trim();
    const subject = getElement("task-subject").value.trim();
    const description = getElement("task-description").value.trim();
    const deadline = getElement("task-deadline").value;

    const priorityValue = getElement("task-priority").value;
    const statusValue = getElement("task-status").value;

    if (!title) {
      showFormError("task-form-error", "Please enter a task title.");
      getElement("task-title").focus();
      return;
    }

    if (deadline && !parseDate(deadline)) {
      showFormError("task-form-error", "Please select a valid deadline.");
      getElement("task-deadline").focus();
      return;
    }

    const priority = ["low", "medium", "high"].includes(priorityValue)
      ? priorityValue
      : "medium";

    const status = ["pending", "completed"].includes(statusValue)
      ? statusValue
      : "pending";

    const id = getElement("task-id").value;
    const existingTask = id
      ? tasks.find((task) => task.id === id)
      : null;

    if (id && !existingTask) {
      showFormError(
        "task-form-error",
        "Task not found. Please close the form and try again."
      );
      return;
    }

    const now = new Date().toISOString();

    const task = {
      id: existingTask ? existingTask.id : makeId(),
      title,
      subject,
      description,
      deadline,
      priority,
      status,
      createdAt: existingTask?.createdAt || now,
      updatedAt: now
    };

    const previousTasks = tasks;

    tasks = existingTask
      ? tasks.map((item) => item.id === id ? task : item)
      : [task, ...tasks];

    if (!saveTasks()) {
      tasks = previousTasks;
      renderAll();
      return;
    }

    closeTaskModal();
    renderAll();
    checkReminders();

    showToast(
      existingTask
        ? "Changes saved successfully!"
        : "Task added successfully!"
    );

    getElement("task-form").reset();
  }

  /* ==========================================
    IMPROVED COMPLETE AND REOPEN TASK SYSTEM
    ========================================== */

  function toggleTask(taskId) {
    const task = tasks.find((item) => item.id === taskId);

    if (!task) {
      showToast("Task not found.");
      return;
    }

    const newStatus =
      task.status === "completed" ? "pending" : "completed";

    const previousTasks = tasks;

    tasks = tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            status: newStatus,
            updatedAt: new Date().toISOString()
          }
        : item
    );

    if (!saveTasks()) {
      tasks = previousTasks;
      renderAll();
      return;
    }

    renderAll();

    showToast(
      newStatus === "completed"
        ? "✓ Task completed! Great job!"
        : "Task reopened. You can finish it later!"
    );
  }

  /* ==========================================
    DELETE TASK
    ========================================== */

  function deleteTask(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    if (!window.confirm(`Delete "${task.title}"?`)) return;

    const previousTasks = tasks;
    tasks = tasks.filter((item) => item.id !== taskId);

    if (!saveTasks()) {
      tasks = previousTasks;
      renderAll();
      return;
    }

    renderAll();
    showToast("Task deleted.");
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

  /* ==========================================
    TASK CARD RENDERING
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

    return `
      <article class="task-card ${status === "completed" ? "completed" : ""}">
        <button class="task-check" type="button"
          data-action="toggle" data-id="${escapeHTML(task.id)}"
          aria-label="${status === "completed" ? "Mark pending" : "Mark completed"}"
          aria-pressed="${status === "completed"}"
          title="${status === "completed" ? "Reopen task" : "Complete task"}">
          ${status === "completed" ? "✓" : ""}
        </button>

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
              ? `<span class="task-deadline ${isOverdue(task) ? "deadline-overdue" : ""}">
                  ◷ ${escapeHTML(formatDate(task.deadline, true))}
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
    if (container) container.innerHTML = list.map(taskCardHTML).join("");
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
      list = list.filter((task) =>
        task.status !== "completed" && !isOverdue(task)
      );
    } else if (activeFilter === "completed") {
      list = list.filter((task) => task.status === "completed");
    } else if (activeFilter === "overdue") {
      list = list.filter(isOverdue);
    }

    list = sortTasksByDeadline(list);

    renderTaskList("all-task-list", list);
    getElement("tasks-empty").hidden = list.length > 0;

    document.querySelectorAll(".filter-button").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.filter === activeFilter
      );
    });
  }

  function renderDeadlines() {
    const today = todayKey();
    const weekEnd = parseDate(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndKey = dateKey(weekEnd);

    const unfinished = tasks.filter((task) => task.status !== "completed");
    const dueToday = unfinished.filter((task) => task.deadline === today);

    const dueWeek = unfinished.filter((task) =>
      task.deadline &&
      task.deadline >= today &&
      task.deadline <= weekEndKey
    );

    const overdue = unfinished.filter(isOverdue);

    getElement("due-today-count").textContent = dueToday.length;
    getElement("due-week-count").textContent = dueWeek.length;
    getElement("deadline-overdue-count").textContent = overdue.length;

    const list = sortTasksByDeadline(
      tasks.filter((task) => task.deadline)
    );

    renderTaskList("deadline-list", list);
    getElement("deadlines-empty").hidden = list.length > 0;
  }

  /* ==========================================
    STATS AND PROGRESS
    ========================================== */

  function renderStats() {
    const total = tasks.length;
    const completed = tasks.filter(
      (task) => task.status === "completed"
    ).length;

    const overdue = tasks.filter(isOverdue).length;
    const pending = total - completed;
    const percent = total === 0
      ? 0
      : Math.round((completed / total) * 100);

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
      `conic-gradient(var(--green) ${percent}%, var(--border) ${percent}%)`;

    getElement("progress-message").textContent =
      total === 0
        ? "Add a task to start tracking your progress."
        : percent === 100
          ? "Amazing work! You've completed every task."
          : percent >= 70
            ? "You're doing great. Keep it up!"
            : percent >= 35
              ? "You're making progress. Keep going!"
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

    const totalCells =
      Math.ceil((startWeekday + daysInMonth) / 7) * 7;

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

      const todayClass = key === todayKey() ? "today" : "";
      const selectedClass =
        selectedCalendarDate === key ? "selected" : "";

      const otherClass = otherMonth ? "other-month" : "";

      const dots = dayTasks.slice(0, compact ? 3 : 5).map((task) => {
        let dotClass = "";

        if (task.status === "completed") {
          dotClass = "dot-done";
        } else if (task.priority === "high" || isOverdue(task)) {
          dotClass = "dot-high";
        }

        return `<span class="calendar-dot ${dotClass}"></span>`;
      }).join("");

      html += `
        <button class="calendar-day ${todayClass} ${selectedClass} ${otherClass}"
          type="button" data-calendar-date="${key}"
          aria-label="${escapeHTML(formatDate(key, true))}, ${dayTasks.length} tasks">
          <span class="calendar-day-number">${dayNumber}</span>
          ${dayTasks.length
            ? `<span class="calendar-dots">${dots}</span>`
            : ""}
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
    const title = calendarDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });

    getElement("calendar-month-title").textContent = title;
    getElement("calendar-month-title-page").textContent = title;

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

  function getReminderEnabled() {
    return safeRead(accountKey(STORAGE.reminders), true) !== false;
  }

  function syncReminderControls() {
    getElement("reminder-toggle").checked = getReminderEnabled();
  }

  function handleReminderChange() {
    const enabled = getElement("reminder-toggle").checked;

    if (!safeWrite(accountKey(STORAGE.reminders), enabled)) {
      syncReminderControls();
      return;
    }

    showToast(
      enabled
        ? "Deadline reminders enabled."
        : "Deadline reminders disabled."
    );

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

    if (changed) safeWrite(notifiedKey, updatedNotified);
  }

  function startReminderChecks() {
    if (reminderInterval) clearInterval(reminderInterval);

    reminderInterval = window.setInterval(() => {
      if (currentUsername) checkReminders();
    }, 60000);
  }

  /* ==========================================
    TOAST AND RENDERING
    ========================================== */

  function showToast(message) {
    const toast = getElement("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    if (toastTimeout) clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

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

  getElement("show-signup").addEventListener("click", () =>
    showAuthScreen("signup")
  );

  getElement("show-login").addEventListener("click", () =>
    showAuthScreen("login")
  );

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

  getElement("task-form").addEventListener("submit", saveTaskFromForm);
  getElement("close-modal-btn").addEventListener("click", closeTaskModal);
  getElement("cancel-task-btn").addEventListener("click", closeTaskModal);

  getElement("task-modal").addEventListener("click", (event) => {
    if (event.target === getElement("task-modal")) {
      closeTaskModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!getElement("task-modal").hidden) {
        closeTaskModal();
      }

      getElement("reminder-panel").hidden = true;
    }
  });

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      renderAllTasks();
    });
  });

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
        calendarDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          1
        );
      }

      renderCalendar();
    }
  });

  getElement("calendar-prev").addEventListener("click", () =>
    changeCalendarMonth(-1)
  );

  getElement("calendar-next").addEventListener("click", () =>
    changeCalendarMonth(1)
  );

  getElement("calendar-prev-page").addEventListener("click", () =>
    changeCalendarMonth(-1)
  );

  getElement("calendar-next-page").addEventListener("click", () =>
    changeCalendarMonth(1)
  );

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

  getElement("reminder-toggle").addEventListener(
    "change",
    handleReminderChange
  );

  /* ==========================================
    GROUP 2 PR2 MEMBERS PAGE
    ========================================== */

  (() => {
    const leader = "Anefe Abadies";
    const assistantLeader = "Kobe Gonzales";

    const members = [
      "Bles Alferez",
      "Cassandra Fabro",
      "Christin Panganiban",
      "Danicah Dote",
      "Jayce Corre",
      "John Gerona Dagundon",
      "John lawrence Ferrer",
      "Kurt Samarita",
      "Lexter Buenaobra",
      "Mikhail Marcelino",
      "Rafha Mikhael Oba"
    ];

    const nav = document.querySelector(".sidebar-nav");
    const main = document.querySelector(".main-content");

    if (!nav || !main) {
      console.error("StudySync: Could not initialize the PR2 Members page.");
      return;
    }

    // Create the sidebar button.
    const navButton = document.createElement("button");
    navButton.type = "button";
    navButton.className = "nav-link";
    navButton.dataset.view = "members";
    navButton.innerHTML =
      '<span class="nav-icon" aria-hidden="true">👥</span> Group 2 PR2 Members';

    nav.appendChild(navButton);

    // Create the members page.
    const page = document.createElement("section");
    page.id = "page-members";
    page.className = "page-section";
    page.hidden = true;

    page.innerHTML = `
      <div class="page-intro">
        <div>
          <p class="eyebrow">OUR RESEARCH TEAM</p>
          <h1>Group 2 PR2 Members</h1>
          <p>Meet the people behind StudySync 2.0.</p>
        </div>
      </div>

      <div class="members-summary">
        <span class="members-summary-icon" aria-hidden="true">👥</span>
        <div>
          <h3>13 Team Members</h3>
          <p>1 Leader · 1 Assistant Leader · 11 Members</p>
        </div>
      </div>

      <h2 class="members-heading">Group Leadership</h2>
      <div id="pr2-leader-card" class="members-grid"></div>

      <h2 class="members-heading">Group Members</h2>
      <div id="pr2-members-grid" class="members-grid"></div>
    `;

    const footer = main.querySelector(".app-footer");

    if (footer) {
      main.insertBefore(page, footer);
    } else {
      main.appendChild(page);
    }

    function createCard(name, role, isLeader = false) {
      const card = document.createElement("article");
      card.className = "member-card";

      if (isLeader) {
        card.classList.add("leader-member-card");
      }

      const avatar = document.createElement("div");
      avatar.className = "member-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = isLeader ? "👑" : "👤";

      const info = document.createElement("div");
      info.className = "member-info";

      const nameElement = document.createElement("h3");
      nameElement.textContent = name;

      const roleElement = document.createElement("p");
      roleElement.className = "member-role";
      roleElement.textContent = role;

      info.append(nameElement, roleElement);
      card.append(avatar, info);

      if (isLeader) {
        const badge = document.createElement("span");
        badge.className = "leader-badge";
        badge.textContent = "LEADER";
        card.appendChild(badge);
      } else if (role === "Assistant Leader") {
        const badge = document.createElement("span");
        badge.className = "leader-badge";
        badge.textContent = "ASSISTANT";
        card.appendChild(badge);
      }

      return card;
    }

    const leaderContainer = getElement("pr2-leader-card");
    const membersContainer = getElement("pr2-members-grid");

    if (!leaderContainer || !membersContainer) {
      console.error("StudySync: Member containers were not found.");
      page.remove();
      navButton.remove();
      return;
    }

    leaderContainer.appendChild(
      createCard(leader, "Group Leader", true)
    );

    leaderContainer.appendChild(
      createCard(assistantLeader, "Assistant Leader")
    );

    members.forEach((name) => {
      membersContainer.appendChild(
        createCard(name, "Group Member")
      );
    });

    navButton.addEventListener("click", () => {
      setView("members");
    });
  })();

  /* ==========================================
    STARTUP
    ========================================== */

  function startStudySync() {
    initializeTheme();

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
        startReminderChecks();
        return;
      }

      safeWrite(STORAGE.session, null);
    }

    showAuthScreen("login");
  }

  startStudySync();
