// coordinator.js – coordinator functions with course filtering + DEBUG
(function () {
  // Add helper for permission errors
  function handleFirestoreErrorCoordinator(err, where) {
    // safe logging
    try { console.error(where + ' - Firestore error:', err); } catch(e){ console.error(where + ' - Firestore error (logging failed)'); }
    try { console.log('Firebase config:', firebase.app().options); } catch(e){/*ignore*/ }
    try { console.log('Current uid:', firebase.auth().currentUser && firebase.auth().currentUser.uid); } catch(e){/*ignore*/ }
    // show details
    const code = err && err.code ? err.code : 'unknown';
    const msg = err && err.message ? err.message : String(err);
    const isPerm = code === 'permission-denied' || /Missing or insufficient permissions/i.test(msg);
    const userMsg = isPerm
      ? 'Missing or insufficient Firestore permissions. Verify you are using the project whose rules you edited and that the account has required claims, or temporarily relax rules for testing.'
      : 'Firestore error: ' + msg;
    if (typeof showAlert === 'function') showAlert(userMsg, 'danger');
    else alert(userMsg);
  }

  async function loadCoordinatorOverview() {
    try {
      const coordinatorCourse = window.coordinatorCourse || null;
      
      console.log("🔍 DEBUG: Coordinator Course:", coordinatorCourse);
      
      if (!coordinatorCourse) {
        console.warn("⚠️ Coordinator has no course assigned!");
        return;
      }
      
      // Filter students by course
      const studentsSnap = await db.collection("users")
        .where("role", "==", "student")
        .where("course", "==", coordinatorCourse)
        .get();
      
      console.log("📊 DEBUG: Found", studentsSnap.size, "students in", coordinatorCourse);
      
      const totalStudents = studentsSnap.size;
      
      // Get documents only from students in this course
      let totalDocs = 0;
      for (const studentDoc of studentsSnap.docs) {
        const docsSnap = await db.collection("documents").doc(studentDoc.id).collection("uploads").get();
        totalDocs += docsSnap.size;
      }
      
      let totalHours = 0;
      const promises = studentsSnap.docs.map(s => db.collection("timeLogs").doc(s.id).collection("logs").get());
      const logsResults = await Promise.all(promises);
      logsResults.forEach(r => r.forEach(l => totalHours += parseFloat(l.data().hours || 0)));

      const avgHours = totalStudents ? (totalHours / totalStudents).toFixed(1) : 0;
      const elTotal = document.getElementById("coordTotalStudents");
      if (elTotal) elTotal.innerText = totalStudents;
      const elDocs = document.getElementById("coordPendingDocs");
      if (elDocs) elDocs.innerText = totalDocs;
      const elAvg = document.getElementById("coordAvgHours");
      if (elAvg) elAvg.innerText = avgHours;
      const elActive = document.getElementById("coordActiveToday");
      if (elActive) elActive.innerText = totalDocs;
    } catch (err) {
      handleFirestoreErrorCoordinator(err, 'loadCoordinatorOverview');
    }
  }

  async function loadCoordinatorStudents() {
    const tbody = document.getElementById("coordStudentTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    try {
      const coordinatorCourse = window.coordinatorCourse || null;
      
      console.log("🔍 DEBUG: Loading students for course:", coordinatorCourse);
      
      if (!coordinatorCourse) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:#ef4444;'>Your account has no course assigned. Please contact admin.</td></tr>";
        return;
      }
      
      // First, let's check ALL students to debug
      const allStudents = await db.collection("users").where("role", "==", "student").get();
      console.log("📊 DEBUG: Total students in database:", allStudents.size);
      
      allStudents.forEach(doc => {
        const data = doc.data();
        console.log("👤 Student:", data.name, "| Course:", data.course || "NO COURSE");
      });
      
      // Now filter by course
      const studentsSnap = await db.collection("users")
        .where("role", "==", "student")
        .where("course", "==", coordinatorCourse)
        .get();
      
      console.log("✅ DEBUG: Filtered students:", studentsSnap.size, "for course:", coordinatorCourse);
      
      if (studentsSnap.empty) {
        tbody.innerHTML = `<tr><td colspan='5' style='text-align:center;'>No students found in ${coordinatorCourse} course. Check console for debug info.</td></tr>`;
        return;
      }

      const promises = studentsSnap.docs.map(async (s) => {
        const uid = s.id;
        const data = s.data();
        const logsSnap = await db.collection("timeLogs").doc(uid).collection("logs").get();
        let totalHours = 0;
        logsSnap.forEach(l => totalHours += parseFloat(l.data().hours || 0));
        const daysLogged = logsSnap.size;
        const docsSnap = await db.collection("documents").doc(uid).collection("uploads").get();
        const docCount = docsSnap.size;
        const progress = ((totalHours / 486) * 100).toFixed(1);
        return { name: data.name, uid, totalHours, daysLogged, docCount, progress };
      });

      const results = await Promise.all(promises);
      results.forEach(r => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.innerHTML = `<td>${r.name}</td><td>${r.totalHours.toFixed(1)}</td><td>${r.daysLogged}</td><td>${r.docCount}</td><td>${r.progress}%</td>`;
        tr.addEventListener("click", () => openStudentModal(r.uid, r.name));
        tbody.appendChild(tr);
      });
    } catch (err) {
      handleFirestoreErrorCoordinator(err, 'loadCoordinatorStudents');
    }
  }

  async function loadCoordinatorSubmissions() {
    const container = document.getElementById("submissionsContainer");
    if (!container) return;
    container.innerHTML = "<p>Loading...</p>";
    try {
      const coordinatorCourse = window.coordinatorCourse || null;
      
      console.log("🔍 DEBUG: Loading submissions for course:", coordinatorCourse);
      
      if (!coordinatorCourse) {
        container.innerHTML = "<p style='text-align:center;color:#ef4444;'>Your account has no course assigned. Please contact admin.</p>";
        return;
      }
      
      // Filter students by course
      const studentsSnap = await db.collection("users")
        .where("role", "==", "student")
        .where("course", "==", coordinatorCourse)
        .get();
      
      console.log("📊 DEBUG: Found", studentsSnap.size, "students for submissions");
      
      if (studentsSnap.empty) {
        container.innerHTML = `<p style='text-align:center;color:#aaa;'>No students found in ${coordinatorCourse} course.</p>`;
        return;
      }

      let allDocsHTML = "";
      for (const student of studentsSnap.docs) {
        const studentData = student.data();
        const uploadsSnap = await db.collection("documents").doc(student.id).collection("uploads").orderBy("uploadedAt", "desc").get();
        if (uploadsSnap.empty) continue;
        uploadsSnap.forEach((dSnap) => {
          const d = dSnap.data();
          const date = d.uploadedAt?.seconds ? new Date(d.uploadedAt.seconds * 1000).toLocaleString() : "N/A";
          const viewBtn = d.link ? `<a class="btn btn-secondary" href="${d.link}" target="_blank" rel="noopener">View</a>` : "";
          allDocsHTML += `
            <div class="submission-card">
              <div>
                <h3>${d.title}</h3>
                <p><strong>Type:</strong> ${d.type || "N/A"}</p>
                <p><strong>Description:</strong> ${d.description || "—"}</p>
                <p><strong>Student:</strong> ${studentData.name} (${studentData.email})</p>
                <p><strong>Date:</strong> ${date}</p>
                ${viewBtn}
              </div>
            </div>
          `;
        });
      }
      container.innerHTML = allDocsHTML || "<p>No document submissions found yet.</p>";
    } catch (err) {
      console.error("❌ loadCoordinatorSubmissions error:", err);
      container.innerHTML = "<p style='color:red;'>Error loading documents. Check console.</p>";
    }
  }

  async function openStudentModal(uid, studentName) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `<button class="close-btn">Close</button><h3>Student Details - ${studentName}</h3><div id="studentDetailsContent"><p>Loading student data...</p></div>`;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    modal.querySelector(".close-btn").addEventListener("click", () => overlay.remove());

    const detailsDiv = modal.querySelector("#studentDetailsContent");
    try {
      const logsSnap = await db.collection("timeLogs").doc(uid).collection("logs").orderBy("timeIn", "desc").get();
      let logsHTML = "<h4>Time Logs</h4>";
      if (logsSnap.empty) logsHTML += "<p>No time logs yet.</p>";
      else {
        logsHTML += "<table><thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>Status</th></tr></thead><tbody>";
        logsSnap.forEach(doc => {
          const d = doc.data();
          const date = d.date || "—";
          const timeIn = d.timeIn ? (d.timeIn.toDate ? d.timeIn.toDate().toLocaleTimeString() : new Date(d.timeIn).toLocaleTimeString()) : "—";
          const timeOut = d.timeOut ? (d.timeOut.toDate ? d.timeOut.toDate().toLocaleTimeString() : new Date(d.timeOut).toLocaleTimeString()) : "—";
          const hours = d.hours || 0;
          const status = d.status || "—";
          logsHTML += `<tr><td>${date}</td><td>${timeIn}</td><td>${timeOut}</td><td>${hours}</td><td>${status}</td></tr>`;
        });
        logsHTML += "</tbody></table>";
      }

      const docsSnap = await db.collection("documents").doc(uid).collection("uploads").orderBy("uploadedAt", "desc").get();
      let docsHTML = "<h4 style='margin-top:1rem;'>Documents</h4>";
      if (docsSnap.empty) docsHTML += "<p>No documents uploaded.</p>";
      else {
        docsSnap.forEach(doc => {
          const d = doc.data();
          const date = d.uploadedAt ? (d.uploadedAt.toDate ? d.uploadedAt.toDate().toLocaleString() : new Date(d.uploadedAt).toLocaleString()) : "—";
          const viewBtn = d.link ? `<a class="btn btn-secondary" href="${d.link}" target="_blank" rel="noopener">View</a>` : "";
          docsHTML += `<div style="margin-bottom:0.5rem;"><strong>${d.title}</strong><div style="font-size:0.9rem;color:#94a3b8">${d.type} — ${d.description || ""}</div><div style="font-size:0.8rem;color:#64748b">${date}</div>${viewBtn}</div>`;
        });
      }
      detailsDiv.innerHTML = logsHTML + docsHTML;
    } catch (err) {
      console.error("openStudentModal error:", err);
      detailsDiv.innerHTML = "<p style='color:red;'>Error loading details.</p>";
    }
  }

  window.loadCoordinatorOverview = loadCoordinatorOverview;
  window.loadCoordinatorStudents = loadCoordinatorStudents;
  window.loadCoordinatorSubmissions = loadCoordinatorSubmissions;
  window.openStudentModal = openStudentModal;
})();