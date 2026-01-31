// auth.js – register / login / logout behavior (uses window.auth, window.db)

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const showRegister = document.getElementById("showRegister");
  const showLogin = document.getElementById("showLogin");
  const logoutBtn = document.getElementById("logoutBtn");

  if (showRegister) {
    showRegister.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("loginSection").classList.add("hidden");
      document.getElementById("registerSection").classList.remove("hidden");
    });
  }
  if (showLogin) {
    showLogin.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("registerSection").classList.add("hidden");
      document.getElementById("loginSection").classList.remove("hidden");
    });
  }

  if (registerForm) registerForm.addEventListener("submit", handleRegister);
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
});

async function handleRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  const name = (document.getElementById("regName") || {value:''}).value.trim();
  const email = (document.getElementById("regEmail") || {value:''}).value.trim();
  const password = (document.getElementById("regPassword") || {value:''}).value;
  const role = (document.getElementById("regRole") || {value:''}).value;
  const course = (document.getElementById("regCourse") || {value:''}).value;

  if (!name || !email || !password || !role) {
    showAlert("Please fill in all fields.", "danger");
    return;
  }

  // Validate course for students and coordinators
  if ((role === "student" || role === "coordinator") && !course) {
    showAlert("Please select a course/program.", "danger");
    return;
  }

  btn.disabled = true;
  btn.innerText = "Checking...";

  try {
    const methods = await auth.fetchSignInMethodsForEmail(email);
    if (methods.length > 0) {
      showAlert("This email is already registered. Please log in instead.", "danger");
      btn.disabled = false;
      btn.innerText = "Register";
      return;
    }

    btn.innerText = "Registering...";
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    const userData = {
      name,
      email,
      role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    // Add course field for students and coordinators
    if (role === "student" || role === "coordinator") {
      userData.course = course;
      console.log("✅ Saving user with course:", course);
    }

    await db.collection("users").doc(cred.user.uid).set(userData);

    showAlert("Registration successful! Please log in.", "success");
    window.location.href = "index.html";
  } catch (err) {
    showAlert("Registration error: " + (err.message || err), "danger");
    btn.disabled = false;
    btn.innerText = "Register";
    console.error(err);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  const email = (document.getElementById("loginEmail") || {value:''}).value.trim();
  const password = (document.getElementById("loginPassword") || {value:''}).value;

  btn.disabled = true;
  btn.innerText = "Logging in...";

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const doc = await db.collection("users").doc(cred.user.uid).get();
    if (!doc.exists) {
      showAlert("User record missing in Firestore.", "danger");
      btn.disabled = false;
      btn.innerText = "Login";
      return;
    }
    const role = doc.data().role;
    if (role === "student") window.location.href = "student.html";
    else if (role === "coordinator") window.location.href = "coordinator.html";
    else if (role === "admin") window.location.href = "admin.html";
    else {
      showAlert("Unknown role.", "danger");
      btn.disabled = false;
      btn.innerText = "Login";
    }
  } catch (err) {
    showAlert("Login error: " + (err.message || err), "danger");
    btn.disabled = false;
    btn.innerText = "Login";
    console.error(err);
  }
}

async function handleLogout() {
  try {
    await auth.signOut();
  } catch (err) {
    console.warn("Logout error:", err);
  } finally {
    window.location.href = "index.html";
  }
}