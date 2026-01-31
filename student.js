/*
 student.js – multi-session time logging + document upload with Drive links
*/
(function () {
  // Helper to safely parse Firestore timestamp-like values to Date
  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    if (typeof ts === "number") return new Date(ts);
    return new Date(ts);
  }

  async function initStudentUI() {
    const timeInBtn = document.getElementById("timeInBtn");
    const timeOutBtn = document.getElementById("timeOutBtn");
    const currentTimeDisplay = document.getElementById("currentTime");
    const timeStatus = document.getElementById("timeStatus");

    // live clock
    setInterval(() => {
      const now = new Date();
      if (currentTimeDisplay) currentTimeDisplay.textContent = now.toLocaleTimeString();
    }, 1000);

    // Find active (in-progress) session if any – WITHOUT orderBy (no index needed)
    async function findActiveSessionRef() {
      const user = auth.currentUser;
      if (!user) return null;
      try {
        const q = await db
          .collection("timeLogs")
          .doc(user.uid)
          .collection("logs")
          .where("status", "==", "In Progress")
          .get();

        if (q.empty) return null;

        // pick latest by timeIn in JS
        let latestDoc = null;
        q.forEach((doc) => {
          if (!latestDoc) {
            latestDoc = doc;
          } else {
            const prev = toDate(latestDoc.data().timeIn);
            const curr = toDate(doc.data().timeIn);
            if (curr && (!prev || curr > prev)) {
              latestDoc = doc;
            }
          }
        });

        return latestDoc ? { ref: latestDoc.ref, data: latestDoc.data(), id: latestDoc.id } : null;
      } catch (err) {
        console.error("findActiveSessionRef error:", err);
        return null;
      }
    }

    async function hydrateState() {
      const user = auth.currentUser;
      if (!user || !timeStatus) return;
      try {
        const active = await findActiveSessionRef();
        if (active) {
          timeStatus.textContent = "Clocked In";
          timeStatus.className = "time-status in";
          if (timeInBtn) timeInBtn.disabled = true;
          if (timeOutBtn) timeOutBtn.disabled = false;
        } else {
          timeStatus.textContent = "Not Clocked In";
          timeStatus.className = "time-status out";
          if (timeInBtn) timeInBtn.disabled = false;
          if (timeOutBtn) timeOutBtn.disabled = true;
        }
      } catch (err) {
        console.error("hydrateState error:", err);
      }
    }

    // Time In
    if (timeInBtn && !timeInBtn._attached) {
      timeInBtn._attached = true;
      timeInBtn.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) return;
        try {
          const active = await findActiveSessionRef();
          if (active) {
            showAlert("You are already clocked in. Please clock out first.", "danger");
            return;
          }

          const id = Date.now().toString();
          const today = new Date().toISOString().split("T")[0];
          const docRef = db.collection("timeLogs").doc(user.uid).collection("logs").doc(id);

          await docRef.set({
            date: today,
            timeIn: firebase.firestore.FieldValue.serverTimestamp(),
            timeOut: null,
            hours: 0,
            status: "In Progress",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });

          showAlert("✅ You clocked in successfully!", "success");
          await hydrateState();
          await Promise.all([
            loadStudentHistory(),
            loadStudentStats(),
            loadRecentActivity(),
            loadTodayLog(),
          ]);
        } catch (err) {
          console.error("Time In error:", err);
          showAlert("❌ Error while clocking in.", "danger");
        }
      });
    }

    // Time Out
    if (timeOutBtn && !timeOutBtn._attached) {
      timeOutBtn._attached = true;
      timeOutBtn.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) return;
        try {
          const active = await findActiveSessionRef();
          if (!active) {
            showAlert("No active session found. Please clock in first.", "danger");
            return;
          }

          const docRef = active.ref;
          const docSnap = await docRef.get();
          if (!docSnap.exists) {
            showAlert("Active session not found. It may have been removed.", "danger");
            await hydrateState();
            return;
          }
          const data = docSnap.data();

          const timeInDate = toDate(data.timeIn);
          if (!timeInDate) {
            showAlert("Invalid time in data. Contact admin.", "danger");
            return;
          }

          const timeOutDate = new Date();
          let hours = parseFloat(((timeOutDate - timeInDate) / (1000 * 60 * 60)).toFixed(2));
          if (hours < 0 || hours > 24) {
            showAlert("Invalid time calculation. Please try again or contact admin.", "danger");
            return;
          }

          await docRef.update({
            timeOut: firebase.firestore.FieldValue.serverTimestamp(),
            hours: hours,
            status: "Completed",
          });

          showAlert(`✅ You clocked out successfully! Total: ${hours.toFixed(2)} hours`, "success");
          await hydrateState();
          await Promise.all([
            loadStudentHistory(),
            loadStudentStats(),
            loadRecentActivity(),
            loadTodayLog(),
          ]);
        } catch (err) {
          console.error("Time Out error:", err);
          showAlert("❌ Error while clocking out.", "danger");
        }
      });
    }

    // Initial hydration and loads
    await hydrateState();
    setupDocumentUpload();
    await Promise.all([
      loadStudentHistory(),
      loadStudentDocuments(),
      loadStudentStats(),
      loadRecentActivity(),
      loadTodayLog(),
    ]);
  }

  // History
  async function loadStudentHistory() {
    const user = auth.currentUser;
    const tbody = document.getElementById("historyTable");
    if (!user || !tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

    try {
      const logsSnap = await db
        .collection("timeLogs")
        .doc(user.uid)
        .collection("logs")
        .orderBy("timeIn", "desc")
        .get();

      if (logsSnap.empty) {
        tbody.innerHTML =
          "<tr><td colspan='5' style='text-align:center;'>No logs found.</td></tr>";
        return;
      }

      tbody.innerHTML = "";
      logsSnap.forEach((doc) => {
        const log = doc.data();
        const timeIn = log.timeIn ? toDate(log.timeIn).toLocaleTimeString() : "—";
        const timeOut = log.timeOut ? toDate(log.timeOut).toLocaleTimeString() : "—";
        const date = log.date || "—";
        const hours = log.hours || 0;
        const status = log.status || "—";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${date}</td><td>${timeIn}</td><td>${timeOut}</td><td>${hours}</td><td>${status}</td>`;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error("loadStudentHistory error:", err);
      tbody.innerHTML =
        "<tr><td colspan='5' style='text-align:center;color:red;'>Error loading history.</td></tr>";
    }
  }

  // Documents (unchanged except for index-safe sort)
  async function loadStudentDocuments() {
    const user = auth.currentUser;
    const listDiv = document.getElementById("documentsList");
    if (!user || !listDiv) return;
    listDiv.innerHTML = "<p>Loading...</p>";
    try {
      const docs = await db
        .collection("documents")
        .doc(user.uid)
        .collection("uploads")
        .get();
      if (docs.empty) {
        listDiv.innerHTML =
          "<p style='text-align:center;color:#6b7280;'>No documents yet.</p>";
        return;
      }
      const sortedDocs = docs.docs.sort(
        (a, b) =>
          (b.data().uploadedAt && b.data().uploadedAt.seconds
            ? b.data().uploadedAt.seconds
            : 0) -
          (a.data().uploadedAt && a.data().uploadedAt.seconds
            ? a.data().uploadedAt.seconds
            : 0)
      );
      listDiv.innerHTML = "";
      sortedDocs.forEach((doc) => {
        const d = doc.data();
        const date = d.uploadedAt
          ? new Date(d.uploadedAt.seconds * 1000).toLocaleDateString()
          : "—";
        const div = document.createElement("div");
        div.className = "document-item";
        const viewBtn = d.link
          ? `<a class="btn btn-secondary" href="${d.link}" target="_blank" rel="noopener">View</a>`
          : "";
        div.innerHTML = `
          <div class="document-info">
            <span>📄</span>
            <div>
              <strong>${d.title}</strong>
              <p>${d.type} — ${d.description || ""}</p>
              <p style="font-size:0.8rem;color:#9ca3af;">Uploaded: ${date}</p>
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            ${viewBtn}
            <button class="delete-btn" title="Delete document">🗑️</button>
          </div>
        `;
        const deleteBtn = div.querySelector(".delete-btn");
        deleteBtn.addEventListener("click", async () => {
          const confirmDelete = confirm(
            `Are you sure you want to delete "${d.title}"?`
          );
          if (!confirmDelete) return;
          try {
            await db
              .collection("documents")
              .doc(user.uid)
              .collection("uploads")
              .doc(doc.id)
              .delete();
            showAlert("Document deleted successfully.", "success");
            await Promise.all([
              loadStudentDocuments(),
              loadStudentStats(),
              loadRecentActivity(),
            ]);
          } catch (error) {
            console.error("Error deleting document:", error);
            showAlert("Failed to delete document.", "danger");
          }
        });
        listDiv.appendChild(div);
      });
    } catch (err) {
      console.error("Error loading documents:", err);
      listDiv.innerHTML =
        "<p style='color:red;text-align:center;'>Error loading documents.</p>";
    }
  }

  // Stats (unchanged)
  async function loadStudentStats() {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const logsSnap = await db
        .collection("timeLogs")
        .doc(user.uid)
        .collection("logs")
        .get();
      const docsSnap = await db
        .collection("documents")
        .doc(user.uid)
        .collection("uploads")
        .get();
      let totalHours = 0;
      logsSnap.forEach((d) => (totalHours += parseFloat(d.data().hours || 0)));
      const totalHoursEl = document.getElementById("totalHours");
      const daysLoggedEl = document.getElementById("daysLogged");
      const docsUploadedEl = document.getElementById("docsUploaded");
      const progressPercentEl = document.getElementById("progressPercent");
      if (totalHoursEl) totalHoursEl.textContent = totalHours.toFixed(2);
      if (daysLoggedEl) {
        const dates = new Set();
        logsSnap.forEach((d) => {
          if (d.data().date) dates.add(d.data().date);
        });
        daysLoggedEl.textContent = dates.size;
      }
      if (docsUploadedEl) docsUploadedEl.textContent = docsSnap.size;
      if (progressPercentEl)
        progressPercentEl.textContent =
          Math.min((totalHours / 486) * 100, 100).toFixed(1) + "%";
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  }

  // Recent activity (unchanged)
  async function loadRecentActivity() {
    const user = auth.currentUser;
    const activityFeed = document.getElementById("activityFeed");
    if (!user || !activityFeed) return;
    activityFeed.innerHTML =
      "<p style='color: #6b7280; text-align: center; padding: 2rem;'>Loading...</p>";
    let activities = [];
    try {
      const logsRef = db.collection("timeLogs").doc(user.uid).collection("logs");
      const logsSnap = await logsRef.get();
      logsSnap.forEach((doc) => {
        const data = doc.data();
        let ts = Date.now() / 1000;
        if (data.timeIn) {
          if (data.timeIn.toDate) ts = data.timeIn.toDate().getTime() / 1000;
          else if (data.timeIn.seconds) ts = data.timeIn.seconds;
          else if (typeof data.timeIn === "number") ts = data.timeIn;
        }
        activities.push({
          type: "timeLog",
          date: data.date || "N/A",
          timestamp: ts,
          hours: parseFloat(data.hours) || 0,
          status: data.status || "Unknown",
        });
      });
    } catch (err) {
      console.error("Error loading time logs:", err);
    }

    try {
      const docsRef = db
        .collection("documents")
        .doc(user.uid)
        .collection("uploads");
      const docsSnap = await docsRef.get();
      docsSnap.forEach((doc) => {
        const data = doc.data();
        let ts = Date.now() / 1000;
        if (data.uploadedAt) {
          if (data.uploadedAt.toDate) ts = data.uploadedAt.toDate().getTime() / 1000;
          else if (data.uploadedAt.seconds) ts = data.uploadedAt.seconds;
          else if (typeof data.uploadedAt === "number") ts = data.uploadedAt;
        }
        activities.push({
          type: "document",
          title: data.title || "Untitled",
          docType: data.type || "Document",
          timestamp: ts,
        });
      });
    } catch (err) {
      console.error("Error loading documents for activity:", err);
    }

    if (activities.length === 0) {
      activityFeed.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: #6b7280;">
          <p style="font-size: 2rem; margin-bottom: 1rem;">📋</p>
          <p style="font-weight: 600; margin-bottom: 0.5rem;">No recent activity yet</p>
          <p style="font-size: 0.9rem; color: #94a3b8;">Start by clocking in or uploading a document!</p>
        </div>`;
      return;
    }

    activities.sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    activities = activities.slice(0, 8);

    let html =
      '<div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem;">';
    activities.forEach((act) => {
      try {
        const date = new Date((act.timestamp || Date.now() / 1000) * 1000)
          .toLocaleDateString();
        const time = new Date((act.timestamp || Date.now() / 1000) * 1000)
          .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (act.type === "timeLog") {
          html += `<div style="display:flex;align-items:start;gap:1rem;padding:0.75rem;background:rgba(37,99,235,0.05);border-left:3px solid #3b82f6;border-radius:0.5rem;">
            <span style="font-size:1.5rem;">⏱️</span>
            <div style="flex:1;">
              <div style="font-weight:600;color:#f1f5f9;">Time Log - ${act.date}</div>
              <div style="font-size:0.9rem;color:#94a3b8;margin-top:0.25rem;">${act.hours.toFixed(
                2
              )} hours • ${act.status}</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:0.25rem;">${date} at ${time}</div>
            </div>
          </div>`;
        } else if (act.type === "document") {
          html += `<div style="display:flex;align-items:start;gap:1rem;padding:0.75rem;background:rgba(34,197,94,0.05);border-left:3px solid #22c55e;border-radius:0.5rem;">
            <span style="font-size:1.5rem;">📄</span>
            <div style="flex:1;">
              <div style="font-weight:600;color:#f1f5f9;">Document Uploaded</div>
              <div style="font-size:0.9rem;color:#94a3b8;margin-top:0.25rem;">${act.title} • ${act.docType}</div>
              <div style="font-size:0.8rem;color:#64748b;margin-top:0.25rem;">${date} at ${time}</div>
            </div>
          </div>`;
        }
      } catch (renderErr) {
        console.warn("rendering activity failed:", renderErr);
      }
    });
    html += "</div>";
    activityFeed.innerHTML = html;
  }

  // Today log with index-safe queries
  async function loadTodayLog() {
    const user = auth.currentUser;
    const todayLogDiv = document.getElementById("todayLog");
    if (!user || !todayLogDiv) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const logsRef = db.collection("timeLogs").doc(user.uid).collection("logs");
      const logsSnap = await logsRef.where("date", "==", today).get();

      if (logsSnap.empty) {
        todayLogDiv.innerHTML = `<div style="text-align:center;color:#6b7280;padding:2rem;">No time logs for today.</div>`;
        return;
      }

      const sessions = [];
      let totalHours = 0;
      logsSnap.forEach((doc) => {
        const d = doc.data();
        const timeIn = d.timeIn ? toDate(d.timeIn).toLocaleTimeString() : "—";
        const timeOut = d.timeOut ? toDate(d.timeOut).toLocaleTimeString() : "—";
        const hours = d.hours || 0;
        const status = d.status || "—";
        const ts = d.timeIn ? (toDate(d.timeIn).getTime() || 0) : 0;
        if (status === "Completed") totalHours += parseFloat(hours || 0);
        sessions.push({ timeIn, timeOut, hours, status, ts });
      });

      sessions.sort((a, b) => b.ts - a.ts);

      let rows = "";
      sessions.forEach((s) => {
        rows += `<div style="padding:0.5rem 0;"><strong>${s.timeIn}</strong> → <strong>${s.timeOut}</strong> • ${s.hours} hrs • ${s.status}</div>`;
      });

      // active session (latest "In Progress") without orderBy
      const active = await (async () => {
        const q = await db
          .collection("timeLogs")
          .doc(user.uid)
          .collection("logs")
          .where("status", "==", "In Progress")
          .get();
        if (q.empty) return null;
        let latest = null;
        q.forEach((doc) => {
          const data = doc.data();
          if (!latest) {
            latest = data;
          } else {
            const prev = toDate(latest.timeIn);
            const curr = toDate(data.timeIn);
            if (curr && (!prev || curr > prev)) {
              latest = data;
            }
          }
        });
        return latest;
      })();

      const activeLine = active
        ? `<div style="margin-bottom:0.5rem;color:#84cc16;font-weight:700;">Active session started at ${toDate(
            active.timeIn
          ).toLocaleTimeString()}</div>`
        : "";

      todayLogDiv.innerHTML = `
        <div style="padding:1rem;">
          ${activeLine}
          <div style="margin-bottom:0.5rem;">Today's Total (completed sessions): <strong>${totalHours.toFixed(
            2
          )} hrs</strong></div>
          <div>${rows}</div>
        </div>
      `;
    } catch (err) {
      console.error("loadTodayLog error:", err);
      todayLogDiv.innerHTML =
        "<p style='color: #ef4444; text-align: center; padding: 2rem;'>Error loading today's log.</p>";
    }
  }

  // Document upload (unchanged)
  function setupDocumentUpload() {
    const uploadForm = document.getElementById("uploadForm");
    if (!uploadForm) return;
    if (uploadForm._uploadAttached) return;
    uploadForm._uploadAttached = true;

    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const user = auth.currentUser;
      if (!user) {
        showAlert("You must be logged in to upload documents.", "danger");
        return;
      }

      const titleInput = document.getElementById("docTitle");
      const typeInput = document.getElementById("docType");
      const descInput = document.getElementById("docDescription");
      const linkInput = document.getElementById("docLink");

      const title = titleInput?.value.trim() || "";
      const type = typeInput?.value || "";
      const description = descInput?.value.trim() || "";
      const link = linkInput?.value.trim() || "";

      if (!title) {
        showAlert("Please enter a document title.", "danger");
        titleInput?.focus();
        return;
      }
      if (!type) {
        showAlert("Please select a document type.", "danger");
        typeInput?.focus();
        return;
      }
      if (!link) {
        showAlert("Please provide a Google Drive link.", "danger");
        linkInput?.focus();
        return;
      }

      try {
        const url = new URL(link);
        if (
          !url.hostname.includes("drive.google.com") &&
          !url.hostname.includes("docs.google.com")
        ) {
          const confirmNonDrive = confirm(
            "This doesn't appear to be a Google Drive link. Do you want to proceed anyway?"
          );
          if (!confirmNonDrive) {
            linkInput?.focus();
            return;
          }
        }
      } catch (err) {
        showAlert("Please enter a valid URL.", "danger");
        linkInput?.focus();
        return;
      }

      const submitBtn = uploadForm.querySelector("button[type='submit']");
      const originalText = submitBtn?.innerText || "Submit Document";

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerText = "Uploading...";
        }

        await db
          .collection("documents")
          .doc(user.uid)
          .collection("uploads")
          .add({
            title: title,
            type: type,
            description: description,
            link: link,
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });

        showAlert(`✅ Document "${title}" uploaded successfully!`, "success");
        uploadForm.reset();

        await Promise.all([
          loadStudentDocuments(),
          loadStudentStats(),
          loadRecentActivity(),
        ]);
      } catch (error) {
        console.error("Document upload error:", error);
        showAlert("❌ Failed to upload document. Please try again.", "danger");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = originalText;
        }
      }
    });
  }

  // Expose
  window.initStudentUI = initStudentUI;
  window.loadStudentHistory = loadStudentHistory;
  window.loadStudentDocuments = loadStudentDocuments;
  window.loadStudentStats = loadStudentStats;
  window.loadRecentActivity = loadRecentActivity;
  window.loadTodayLog = loadTodayLog;
  window.setupDocumentUpload = setupDocumentUpload;
})();
