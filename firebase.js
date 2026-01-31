// firebase.js — initialize Firebase once and expose auth & db
const firebaseConfig = {
  apiKey: "AIzaSyCDiEAFW6QKXhH4ssaJ5kp9g3yvgPdjXDg",
  authDomain: "smcb-ojt-system.firebaseapp.com",
  projectId: "smcb-ojt-system",
  storageBucket: "smcb-ojt-system.firebasestorage.app",
  messagingSenderId: "59872916313",
  appId: "1:59872916313:web:036d4beeaba1fa159fd248",
};

if (!window.firebase || !firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
window.firebaseApp = firebase;
window.auth = firebase.auth();
window.db = firebase.firestore();
