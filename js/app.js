// Shared frontend helpers
const API = window.location.protocol === "file:" ? "http://localhost:3000" : "";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function showMessage(text, type="notice") {
  const box = document.getElementById("messageBox");
  if (!box) return alert(text);
  box.className = "notice " + type;
  box.textContent = text;
  box.style.display = "block";
  setTimeout(() => box.style.display = "none", 5000);
}

function getStudent() {
  try { return JSON.parse(localStorage.getItem("currentStudent") || "null"); }
  catch { return null; }
}

function logoutStudent() {
  localStorage.removeItem("currentStudent");
  location.href = "login.html";
}

function logoutAdmin() {
  localStorage.removeItem("adminLoggedIn");
  localStorage.removeItem("adminUsername");
  localStorage.removeItem("adminToken");
  location.href = "admin-login.html";
}
