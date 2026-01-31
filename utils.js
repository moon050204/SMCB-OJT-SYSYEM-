// utils.js — shared helpers used across pages

// Simple alert toast
function showAlert(message, type = "info", timeout = 3000) {
  try {
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.position = "fixed";
    alertDiv.style.top = "20px";
    alertDiv.style.right = "20px";
    alertDiv.style.zIndex = "10000";
    alertDiv.style.minWidth = "300px";
    alertDiv.innerHTML = `<span>${
      type === "success" ? "✅" : type === "danger" ? "❌" : "ℹ️"
    }</span><div>${message}</div>`;
    document.body.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), timeout);
  } catch (err) {
    console.warn("showAlert error:", err);
  }
}

// Tab navigation used across dashboards
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    // avoid reattaching listeners
    if (btn._tabInitialized) return;
    btn._tabInitialized = true;

    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((tab) => tab.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");

      // trigger coordinator submissions load if needed
      if (btn.dataset.tab === "coord-submissions" || btn.dataset.tab === "submissions") {
        if (typeof loadCoordinatorSubmissions === "function") loadCoordinatorSubmissions();
      }
    });
  });
}

// expose
window.showAlert = showAlert;
window.setupTabNavigation = setupTabNavigation;
