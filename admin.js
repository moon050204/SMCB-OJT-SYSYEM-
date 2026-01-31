// admin.js — admin functions (kept simple and in sync with admin.html)
(function () {
  async function loadAdminOverview() {
    try {
      const usersSnap = await db.collection('users').get();
      const totalUsers = usersSnap.size;

      let students = 0;
      let coordinators = 0;
      const studentIds = [];

      usersSnap.forEach(doc => {
        const data = doc.data();
        if (data.role === 'student') {
          students++;
          studentIds.push(doc.id);
        } else if (data.role === 'coordinator') {
          coordinators++;
        }
      });

      let totalDocs = 0;
      for (const uid of studentIds) {
        const docsSnap = await db
          .collection('documents')
          .doc(uid)
          .collection('uploads')
          .get();
        totalDocs += docsSnap.size;
      }

      const elTotal = document.getElementById('adminTotalUsers');
      if (elTotal) elTotal.innerText = totalUsers;
      const elStudents = document.getElementById('adminStudents');
      if (elStudents) elStudents.innerText = students;
      const elCoord = document.getElementById('adminCoordinators');
      if (elCoord) elCoord.innerText = coordinators;
      const elDocs = document.getElementById('adminTotalDocs');
      if (elDocs) elDocs.innerText = totalDocs;
    } catch (err) {
      console.error('loadAdminOverview error:', err);
    }
  }

  async function loadAdminUsers() {
    const table = document.getElementById('adminUserTable');
    if (!table) return;
    try {
      const usersSnap = await db.collection('users').orderBy('createdAt', 'desc').get();
      if (usersSnap.empty) {
        table.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No users found.</td></tr>";
        return;
      }
      table.innerHTML = '';
      usersSnap.forEach(doc => {
        const data = doc.data();
        const joined = (data.createdAt && data.createdAt.seconds)
          ? new Date(data.createdAt.seconds * 1000).toLocaleDateString()
          : '—';
        const course = data.course || '—';
        const row = `
          <tr>
            <td>${data.name}</td>
            <td>${data.email}</td>
            <td>${data.role}</td>
            <td>${course}</td>
            <td>${joined}</td>
          </tr>
        `;
        table.insertAdjacentHTML('beforeend', row);
      });
    } catch (err) {
      console.error('loadAdminUsers error:', err);
      table.innerHTML = "<tr><td colspan='5' style='text-align:center;color:red;'>Error loading users.</td></tr>";
    }
  }

  window.loadAdminOverview = loadAdminOverview;
  window.loadAdminUsers = loadAdminUsers;
})();
