
"use strict";

/* STUDYSYNC 2.0 — DASHBOARD COLORS & EFFECTS */

(() => {
  const style = document.createElement("style");

  style.textContent = `
    :root {
      --ss-green: #238653;
      --ss-green-light: #e5f5e9;
      --ss-blue: #3974d5;
      --ss-orange: #b76a13;
      --ss-purple: #8752c7;
      --ss-red: #c74747;
    }

    .task-item {
      transition: background-color .25s ease,
                  border-color .25s ease,
                  box-shadow .25s ease,
                  transform .25s ease;
    }

    .task-item.completed {
      background: var(--ss-green-light);
      border-color: #a9d9b8;
      box-shadow: inset 4px 0 0 var(--ss-green);
    }

    .task-item.completed .item-title {
      color: #216440;
      text-decoration: line-through;
      text-decoration-color: #69a982;
    }

    .task-item.overdue {
      background: #ffe8e8;
      border-color: #efb5b5;
      box-shadow: inset 4px 0 0 var(--ss-red);
    }

    .priority.high {
      background: #ffe2e2;
      color: #b52f39;
      border: 1px solid #f3b6bb;
    }

    .priority.medium {
      background: #fff0d8;
      color: #95540d;
      border: 1px solid #f1d19b;
    }

    .priority.low {
      background: #e5f5e9;
      color: #216440;
      border: 1px solid #b8dec3;
    }

    .calendar-task.done {
      background: #d9f1e1;
      color: #216440;
      border-left: 3px solid var(--ss-green);
    }

    .calendar-task.overdue {
      background: #ffe0e0;
      color: #a73535;
      border-left: 3px solid var(--ss-red);
    }

    .stat-card {
      transition: transform .25s ease,
                  box-shadow .25s ease;
    }

    .stat-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 22px rgba(42, 83, 59, .12);
    }

    .stat-card:nth-child(1) {
      border-top: 3px solid var(--ss-blue);
    }

    .stat-card:nth-child(2) {
      border-top: 3px solid var(--ss-orange);
    }

    .stat-card:nth-child(3) {
      border-top: 3px solid var(--ss-green);
    }

    .stat-card:nth-child(4) {
      border-top: 3px solid var(--ss-purple);
    }

    #progress-bar-large {
      transition: width .65s ease;
    }

    #progress-percent,
    #progress-completed {
      color: var(--ss-green);
      font-weight: 800;
    }

    #progress-pending {
      color: var(--ss-blue);
      font-weight: 800;
    }

    #progress-overdue {
      color: var(--ss-red);
      font-weight: 800;
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
      }
    }
  `;

  document.head.appendChild(style);

  function updateProgressAccessibility() {
    const bar = document.getElementById("progress-bar-large");
    const label = document.getElementById("progress-percent");

    if (!bar) return;

    const raw = label?.textContent?.trim() || "0";
    const percent = Math.max(
      0,
      Math.min(100, Number.parseInt(raw, 10) || 0)
    );

    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Task completion progress");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(percent));
  }

  updateProgressAccessibility();

  const observer = new MutationObserver(updateProgressAccessibility);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
