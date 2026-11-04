/*
  CPDMS — Campus Placement Drive Management System.
  Real multi-role frontend wired to a Google Apps Script backend (backend/Code.gs),
  which stores every record in a bound Google Spreadsheet. No localStorage database,
  no hardcoded application data — everything below comes from fetch() calls to the
  deployed Apps Script Web App. Passwords are never held in plaintext; the server
  hashes and verifies them, and this file only ever stores an opaque session token.
*/

const API_URL = "https://script.google.com/macros/s/AKfycbyTt66u6nqrfpV-ClTA2xDucdNjzVx3dxyxijjtzwiL5UMq88RSo5KXqzffvG4XERtO/exec";

let session = null;
try { session = JSON.parse(localStorage.getItem("cpdms_session") || "null"); } catch (e) { session = null; }

let db = { companies: [], drives: [], students: [], applications: [], users: [] };
let currentView = "dashboard";
let charts = {};

// ===================== API layer =====================
async function apiRequest(entity, action, payload) {
  payload = Object.assign({}, payload || {});
  payload.entity = entity;
  payload.action = action;
  if (session && session.token) payload.token = session.token;

  let res, json;
  try {
    if (action === "read") {
      const qs = new URLSearchParams(payload).toString();
      res = await fetch(API_URL + "?" + qs, { method: "GET" });
    } else {
      res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
    }
    json = await res.json();
  } catch (err) {
    return { success: false, message: "Network error reaching the backend. Check your connection and try again." };
  }
  if (json && json.success === false && /session expired|not authenticated/i.test(json.message || "")) {
    clearSession();
    showAuthScreen();
  }
  return json;
}

function clearSession() {
  session = null;
  localStorage.removeItem("cpdms_session");
}

function saveSession(token, user) {
  session = { token, user };
  localStorage.setItem("cpdms_session", JSON.stringify(session));
}

// ===================== Parallax (landing) =====================
(function initParallax() {
  const layers = document.querySelectorAll(".parallax-layer");
  if (!layers.length) return;
  window.addEventListener("mousemove", e => {
    const x = (e.clientX / window.innerWidth) - 0.5;
    const y = (e.clientY / window.innerHeight) - 0.5;
    layers.forEach((layer, i) => {
      const depth = (i + 1) * 10;
      layer.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
    });
  });
  window.addEventListener("scroll", () => {
    const sc = window.scrollY;
    layers.forEach((layer, i) => {
      layer.style.transform += ` translateY(${sc * (0.03 * (i + 1))}px)`;
    });
  }, { passive: true });
})();

// ===================== Boot =====================
document.addEventListener("DOMContentLoaded", () => {
  wireAuthForms();
  wireAppForms();
  if (session && session.token) {
    bootApp();
  } else {
    showAuthScreen();
  }
});

function showAuthScreen() {
  document.getElementById("authScreen").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
}

async function bootApp() {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  renderUserChip();
  buildNav();
  await switchView("dashboard");
}

// ===================== Auth forms =====================
function wireAuthForms() {
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("loginSubmit");
    btn.disabled = true;
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const res = await apiRequest("auth", "login", { email, password });
    btn.disabled = false;
    if (!res.success) { authMsg("loginMsg", res.message || "Login failed.", "error"); return; }
    saveSession(res.token, res.user);
    document.getElementById("loginForm").reset();
    authMsg("loginMsg", "", "");
    bootApp();
  });

  document.getElementById("forgotLink").addEventListener("click", e => {
    e.preventDefault();
    document.getElementById("loginCard").classList.add("hidden");
    document.getElementById("forgotCard").classList.remove("hidden");
  });
  document.getElementById("backToLogin").addEventListener("click", () => {
    document.getElementById("forgotCard").classList.add("hidden");
    document.getElementById("loginCard").classList.remove("hidden");
    document.getElementById("forgotForm").classList.remove("hidden");
    document.getElementById("resetForm").classList.add("hidden");
  });

  document.getElementById("forgotForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("forgotEmail").value.trim();
    const res = await apiRequest("auth", "forgot", { email });
    authMsg("forgotMsg", res.message || "If that account exists, a reset code has been sent.", res.success ? "success" : "error");
    if (res.success) {
      document.getElementById("forgotForm").classList.add("hidden");
      document.getElementById("resetForm").classList.remove("hidden");
      document.getElementById("resetForm").dataset.email = email;
    }
  });

  document.getElementById("resetForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("resetForm").dataset.email;
    const code = document.getElementById("resetCode").value.trim();
    const newPassword = document.getElementById("resetPassword").value;
    const res = await apiRequest("auth", "reset", { email, code, newPassword });
    authMsg("resetMsg", res.message || "", res.success ? "success" : "error");
    if (res.success) {
      setTimeout(() => {
        document.getElementById("forgotCard").classList.add("hidden");
        document.getElementById("loginCard").classList.remove("hidden");
        document.getElementById("forgotForm").classList.remove("hidden");
        document.getElementById("resetForm").classList.add("hidden");
        document.getElementById("resetForm").reset();
        document.getElementById("forgotForm").reset();
      }, 1200);
    }
  });
}

function authMsg(id, text, type) {
  const el = document.getElementById(id);
  el.innerText = text;
  el.className = "auth-msg " + type;
}

// ===================== Nav / shell =====================
const NAV_BY_ROLE = {
  Admin: [
    { id: "dashboard", label: "Dashboard" },
    { id: "companies", label: "Companies" },
    { id: "drives", label: "Drives" },
    { id: "students", label: "Students" },
    { id: "applications", label: "Applications" },
    { id: "users", label: "Users" }
  ],
  CDC: [
    { id: "dashboard", label: "Dashboard" },
    { id: "companies", label: "Companies" },
    { id: "drives", label: "Drives" },
    { id: "students", label: "Students" },
    { id: "applications", label: "Applications" }
  ],
  Company: [
    { id: "dashboard", label: "Dashboard" },
    { id: "drives", label: "Our drives" },
    { id: "applications", label: "Applicants" }
  ],
  Student: [
    { id: "dashboard", label: "Dashboard" },
    { id: "drives", label: "Browse drives" },
    { id: "applications", label: "My applications" },
    { id: "profile", label: "My profile" }
  ]
};
const VIEW_TITLES = {
  dashboard: "Dashboard", companies: "Companies", drives: "Placement drives",
  students: "Students", applications: "Applications", profile: "My profile", users: "User accounts"
};

function buildNav() {
  const role = session.user.role;
  const items = NAV_BY_ROLE[role] || NAV_BY_ROLE.Student;
  const nav = document.getElementById("sideNav");
  nav.innerHTML = items.map(it => `<button class="nav-btn" data-view="${it.id}">${it.label}</button>`).join("");
  nav.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  applyRoleVisibility(role);
}

function applyRoleVisibility(role) {
  document.getElementById("driveFormPanel").classList.toggle("hidden", !(role === "Admin" || role === "CDC"));
  document.getElementById("applicationFormPanel").classList.toggle("hidden", role === "Company");
  document.getElementById("applicationStudentWrap").classList.toggle("hidden", role === "Student");
  document.getElementById("applicationStatusWrap").classList.toggle("hidden", role === "Student");
}

function renderUserChip() {
  const u = session.user;
  document.getElementById("userAvatar").innerText = (u.name || "?").charAt(0).toUpperCase();
  document.getElementById("userName").innerText = u.name;
  document.getElementById("userRole").innerText = u.role;
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await apiRequest("auth", "logout", {});
  clearSession();
  location.reload();
});

async function switchView(viewId) {
  currentView = viewId;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === viewId));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + viewId));
  document.getElementById("viewTitle").innerText = VIEW_TITLES[viewId] || "CPDMS";
  await loadData();
  renderCurrentView();
}

// ===================== Data loading =====================
async function loadData() {
  const role = session.user.role;
  const reads = [
    apiRequest("companies", "read", {}),
    apiRequest("drives", "read", {}),
    apiRequest("applications", "read", {})
  ];
  reads.push((role === "Admin" || role === "CDC" || role === "Company") ? apiRequest("students", "read", {}) : apiRequest("students", "read", {}));
  reads.push(role === "Admin" ? apiRequest("users", "read", {}) : Promise.resolve({ success: true, data: [] }));

  const [companies, drives, applications, students, users] = await Promise.all(reads);
  db.companies = companies.success ? companies.data : [];
  db.drives = drives.success ? drives.data : [];
  db.applications = applications.success ? applications.data : [];
  db.students = students.success ? students.data : [];
  db.users = users.success ? users.data : [];
}

const companyById = id => db.companies.find(c => c.id === id);
const driveById = id => db.drives.find(d => d.id === id);
const studentById = id => db.students.find(s => s.id === id);
const myStudentRecord = () => db.students.find(s => s.userId === session.user.id);

function escapeHtml(str) {
  const div = document.createElement("div");
  div.innerText = str == null ? "" : String(str);
  return div.innerHTML;
}

function toast(text, type) {
  const el = document.getElementById("toast");
  el.innerText = text;
  el.className = "toast show " + (type || "");
  setTimeout(() => { el.classList.remove("show"); }, 3200);
}

function formMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = text;
  el.className = "auth-msg " + (type || "");
  if (text) setTimeout(() => { el.innerText = ""; }, 3500);
}

function renderCurrentView() {
  switch (currentView) {
    case "dashboard": renderDashboard(); break;
    case "companies": renderCompanies(); break;
    case "drives": renderDrives(); break;
    case "students": renderStudents(); break;
    case "applications": renderApplications(); break;
    case "profile": renderProfile(); break;
    case "users": renderUsers(); break;
  }
}

// ===================== Forms wiring =====================
function wireAppForms() {
  document.getElementById("companyForm").addEventListener("submit", onCompanySubmit);
  document.getElementById("driveForm").addEventListener("submit", onDriveSubmit);
  document.getElementById("studentForm").addEventListener("submit", onStudentSubmit);
  document.getElementById("applicationForm").addEventListener("submit", onApplicationSubmit);
  document.getElementById("profileForm").addEventListener("submit", onProfileSubmit);
  document.getElementById("userForm").addEventListener("submit", onUserSubmit);
  document.getElementById("resumeUploadBtn").addEventListener("click", onResumeUploadClick);
  document.getElementById("applyModalSubmit").addEventListener("click", submitApplyModal);
  document.getElementById("applyModalCancel").addEventListener("click", closeApplyModal);
}

function resetForm(entity) {
  const map = {
    company: ["companyForm", "Add Company"],
    drive: ["driveForm", "Add Drive"],
    student: ["studentForm", "Add Student"],
    application: ["applicationForm", "New Application"],
    userForm: ["userForm", "Add User"]
  };
  const [formId, title] = map[entity];
  document.getElementById(formId).reset();
  const idField = document.getElementById(formId === "userForm" ? "userId" : entity + "Id");
  if (idField) idField.value = "";
  const titleEl = document.getElementById((formId === "userForm" ? "userForm" : entity) + "FormTitle");
  if (titleEl) titleEl.innerText = title;
}

// ================= COMPANIES =================
async function onCompanySubmit(e) {
  e.preventDefault();
  const id = document.getElementById("companyId").value;
  const payload = {
    id,
    name: document.getElementById("companyName").value.trim(),
    industry: document.getElementById("companyIndustry").value.trim(),
    website: document.getElementById("companyWebsite").value.trim()
  };
  const res = await apiRequest("companies", id ? "update" : "create", payload);
  if (!res.success) { formMsg("companyMsg", res.message, "error"); return; }
  formMsg("companyMsg", res.message, "success");
  resetForm("company");
  await loadData();
  renderCompanies();
}

function editCompany(id) {
  const c = companyById(id);
  if (!c) return;
  document.getElementById("companyId").value = c.id;
  document.getElementById("companyName").value = c.name;
  document.getElementById("companyIndustry").value = c.industry;
  document.getElementById("companyWebsite").value = c.website;
  document.getElementById("companyFormTitle").innerText = "Update Company";
}

async function deleteCompany(id) {
  if (!confirm("Delete this company?")) return;
  const res = await apiRequest("companies", "delete", { id });
  toast(res.message, res.success ? "success" : "error");
  if (res.success) { await loadData(); renderCompanies(); }
}

function renderCompanies() {
  const body = document.getElementById("companyTableBody");
  document.getElementById("companyCount").innerText = `${db.companies.length} compan${db.companies.length === 1 ? "y" : "ies"}`;
  const role = session.user.role;
  const canEdit = role === "Admin" || role === "CDC";
  if (db.companies.length === 0) { body.innerHTML = `<tr class="empty-row"><td colspan="5">No companies yet.</td></tr>`; return; }
  body.innerHTML = db.companies.map(c => {
    const openDrives = db.drives.filter(d => d.companyId === c.id).length;
    return `<tr>
      <td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.industry)}</td><td>${escapeHtml(c.website)}</td><td>${openDrives}</td>
      <td>${canEdit ? `<button class="action-btn edit-btn" onclick="editCompany('${c.id}')">Edit</button>
      <button class="action-btn delete-btn" onclick="deleteCompany('${c.id}')">Delete</button>` : ""}</td>
    </tr>`;
  }).join("");
}

// ================= DRIVES =================
async function onDriveSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("driveId").value;
  const payload = {
    id,
    companyId: document.getElementById("driveCompany").value,
    role: document.getElementById("driveRole").value.trim(),
    package: parseFloat(document.getElementById("drivePackage").value),
    minCgpa: parseFloat(document.getElementById("driveMinCgpa").value),
    deadline: document.getElementById("driveDeadline").value,
    customQuestion: document.getElementById("driveCustomQuestion").value.trim()
  };
  const res = await apiRequest("drives", id ? "update" : "create", payload);
  if (!res.success) { formMsg("driveMsg", res.message, "error"); return; }
  formMsg("driveMsg", res.message, "success");
  resetForm("drive");
  await loadData();
  renderDrives();
}

function editDrive(id) {
  const d = driveById(id);
  if (!d) return;
  document.getElementById("driveId").value = d.id;
  document.getElementById("driveCompany").value = d.companyId;
  document.getElementById("driveRole").value = d.role;
  document.getElementById("drivePackage").value = d.package;
  document.getElementById("driveMinCgpa").value = d.minCgpa;
  document.getElementById("driveDeadline").value = d.deadline;
  document.getElementById("driveCustomQuestion").value = d.customQuestion || "";
  document.getElementById("driveFormTitle").innerText = "Update Drive";
}

async function deleteDrive(id) {
  if (!confirm("Delete this drive?")) return;
  const res = await apiRequest("drives", "delete", { id });
  toast(res.message, res.success ? "success" : "error");
  if (res.success) { await loadData(); renderDrives(); }
}

// Each company can set its own custom question on a drive (see editDriveQuestion / driveCustomQuestion),
// so "applying" opens a small modal: answer the company's question (if any) and attach a resume
// (reusing the one already saved on the student's profile, or uploading a fresh one on the spot).
let applyingDriveId = null;

function applyToDrive(driveId) {
  const me = myStudentRecord();
  if (!me) { toast("No student profile linked to your account yet.", "error"); return; }
  const drive = driveById(driveId);
  if (!drive) return;
  if (me.cgpa < drive.minCgpa) { toast("You do not meet the minimum CGPA for this drive.", "error"); return; }
  if (new Date(drive.deadline) < new Date(new Date().toDateString())) { toast("Application deadline has passed.", "error"); return; }

  applyingDriveId = driveId;
  const company = companyById(drive.companyId);
  document.getElementById("applyModalTitle").innerText = `Apply — ${drive.role} at ${company ? company.name : ""}`;

  const qWrap = document.getElementById("applyModalQuestionWrap");
  if (drive.customQuestion) {
    qWrap.classList.remove("hidden");
    document.getElementById("applyModalQuestionLabel").innerText = drive.customQuestion;
    document.getElementById("applyAnswer").value = "";
  } else {
    qWrap.classList.add("hidden");
  }

  document.getElementById("applyResumeFile").value = "";
  renderApplyResumeStatus(me.resumeUrl);
  formMsg("applyModalMsg", "", "");
  document.getElementById("applyModal").classList.remove("hidden");
}

function renderApplyResumeStatus(resumeUrl) {
  const el = document.getElementById("applyResumeStatus");
  el.innerHTML = resumeUrl
    ? `Using your saved resume — <a href="${escapeHtml(resumeUrl)}" target="_blank" rel="noopener">view it</a>, or choose a new file below to replace it.`
    : `No resume on file yet — choose a file below to attach one (required to apply).`;
}

function closeApplyModal() {
  applyingDriveId = null;
  document.getElementById("applyModal").classList.add("hidden");
}

async function submitApplyModal() {
  const me = myStudentRecord();
  const drive = driveById(applyingDriveId);
  if (!me || !drive) { closeApplyModal(); return; }

  const btn = document.getElementById("applyModalSubmit");
  btn.disabled = true;
  try {
    let resumeUrl = me.resumeUrl || "";
    const file = document.getElementById("applyResumeFile").files[0];
    if (file) {
      const upload = await uploadResumeFile(file);
      if (!upload.success) { formMsg("applyModalMsg", upload.message || "Resume upload failed.", "error"); return; }
      resumeUrl = upload.url;
    }
    if (!resumeUrl) { formMsg("applyModalMsg", "Please attach a resume before applying.", "error"); return; }

    const answer = drive.customQuestion ? document.getElementById("applyAnswer").value.trim() : "";
    if (drive.customQuestion && !answer) { formMsg("applyModalMsg", "Please answer the company's question.", "error"); return; }

    const res = await apiRequest("applications", "create", {
      studentId: me.id, driveId: applyingDriveId, status: "Applied", answer, resumeUrl
    });
    if (!res.success) { formMsg("applyModalMsg", res.message, "error"); return; }
    toast(res.message, "success");
    closeApplyModal();
    await loadData();
    renderCurrentView();
  } finally {
    btn.disabled = false;
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5MB

async function uploadResumeFile(file) {
  if (file.size > MAX_RESUME_BYTES) return { success: false, message: "Resume must be under 5MB." };
  const base64 = await fileToBase64(file);
  return apiRequest("uploads", "resume", { fileName: file.name, mimeType: file.type || "application/octet-stream", base64 });
}

// ================= DRIVE CUSTOM QUESTION (Company, on their own drives) =================
async function editDriveQuestion(id) {
  const d = driveById(id);
  if (!d) return;
  const q = prompt("Custom question shown to students applying to this drive:", d.customQuestion || "");
  if (q === null) return;
  const res = await apiRequest("drives", "update", { id, customQuestion: q.trim() });
  toast(res.message, res.success ? "success" : "error");
  if (res.success) { await loadData(); renderDrives(); }
}

function renderDriveCompanyOptions() {
  const select = document.getElementById("driveCompany");
  const current = select.value;
  select.innerHTML = `<option value="">Select Company</option>` + db.companies.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  select.value = current;
}

function renderDrives() {
  renderDriveCompanyOptions();
  const role = session.user.role;
  const body = document.getElementById("driveTableBody");
  document.getElementById("driveCount").innerText = `${db.drives.length} drive${db.drives.length === 1 ? "" : "s"}`;
  if (db.drives.length === 0) { body.innerHTML = `<tr class="empty-row"><td colspan="8">No placement drives yet.</td></tr>`; return; }
  const canEdit = role === "Admin" || role === "CDC";
  body.innerHTML = db.drives.map(d => {
    const company = companyById(d.companyId);
    const applicants = db.applications.filter(a => a.driveId === d.id).length;
    const questionCell = d.customQuestion
      ? `<span class="question-chip" title="${escapeHtml(d.customQuestion)}">${escapeHtml(d.customQuestion.slice(0, 28))}${d.customQuestion.length > 28 ? "…" : ""}</span>`
      : `<span class="muted">—</span>`;
    let actions = "";
    if (canEdit) {
      actions = `<button class="action-btn edit-btn" onclick="editDrive('${d.id}')">Edit</button>
        <button class="action-btn delete-btn" onclick="deleteDrive('${d.id}')">Delete</button>`;
    } else if (role === "Student") {
      const me = myStudentRecord();
      const already = me && db.applications.some(a => a.studentId === me.id && a.driveId === d.id);
      actions = already ? `<span class="badge shortlisted">Applied</span>` : `<button class="action-btn edit-btn" onclick="applyToDrive('${d.id}')">Apply</button>`;
    } else if (role === "Company" && d.companyId === session.user.companyId) {
      actions = `<span class="count-pill">${applicants} applicant${applicants === 1 ? "" : "s"}</span>
        <button class="action-btn edit-btn" onclick="editDriveQuestion('${d.id}')">Edit question</button>`;
    } else {
      actions = `<span class="count-pill">${applicants} applicant${applicants === 1 ? "" : "s"}</span>`;
    }
    return `<tr>
      <td>${escapeHtml(company ? company.name : "Unknown")}</td><td>${escapeHtml(d.role)}</td><td>${d.package} LPA</td>
      <td>${d.minCgpa}</td><td>${escapeHtml(d.deadline)}</td><td>${questionCell}</td><td>${applicants}</td><td>${actions}</td>
    </tr>`;
  }).join("");
}

// ================= STUDENTS =================
async function onStudentSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("studentId").value;
  const payload = {
    id,
    name: document.getElementById("studentName").value.trim(),
    email: document.getElementById("studentEmail").value.trim(),
    branch: document.getElementById("studentBranch").value.trim(),
    cgpa: parseFloat(document.getElementById("studentCgpa").value)
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { formMsg("studentMsg", "Please enter a valid email address.", "error"); return; }
  const res = await apiRequest("students", id ? "update" : "create", payload);
  if (!res.success) { formMsg("studentMsg", res.message, "error"); return; }
  formMsg("studentMsg", res.message, "success");
  resetForm("student");
  await loadData();
  renderStudents();
}

function editStudent(id) {
  const s = studentById(id);
  if (!s) return;
  document.getElementById("studentId").value = s.id;
  document.getElementById("studentName").value = s.name;
  document.getElementById("studentEmail").value = s.email;
  document.getElementById("studentBranch").value = s.branch;
  document.getElementById("studentCgpa").value = s.cgpa;
  document.getElementById("studentFormTitle").innerText = "Update Student";
}

async function deleteStudent(id) {
  if (!confirm("Delete this student?")) return;
  const res = await apiRequest("students", "delete", { id });
  toast(res.message, res.success ? "success" : "error");
  if (res.success) { await loadData(); renderStudents(); }
}

function renderStudents() {
  const body = document.getElementById("studentTableBody");
  document.getElementById("studentCount").innerText = `${db.students.length} student${db.students.length === 1 ? "" : "s"}`;
  if (db.students.length === 0) { body.innerHTML = `<tr class="empty-row"><td colspan="6">No students yet.</td></tr>`; return; }
  body.innerHTML = db.students.map(s => {
    const apps = db.applications.filter(a => a.studentId === s.id).length;
    return `<tr>
      <td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.branch)}</td><td>${s.cgpa}</td><td>${apps}</td>
      <td><button class="action-btn edit-btn" onclick="editStudent('${s.id}')">Edit</button>
      <button class="action-btn delete-btn" onclick="deleteStudent('${s.id}')">Delete</button></td>
    </tr>`;
  }).join("");
}

// ================= APPLICATIONS =================
function renderApplicationStudentOptions() {
  const select = document.getElementById("applicationStudent");
  const current = select.value;
  select.innerHTML = `<option value="">Select Student</option>` + db.students.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (CGPA ${s.cgpa})</option>`).join("");
  select.value = current;
}
function renderApplicationDriveOptions() {
  const select = document.getElementById("applicationDrive");
  const current = select.value;
  select.innerHTML = `<option value="">Select Drive</option>` + db.drives.map(d => {
    const c = companyById(d.companyId);
    return `<option value="${d.id}">${escapeHtml(c ? c.name : "?")} — ${escapeHtml(d.role)}</option>`;
  }).join("");
  select.value = current;
}

async function onApplicationSubmit(e) {
  e.preventDefault();
  const role = session.user.role;
  const id = document.getElementById("applicationId").value;
  const driveId = document.getElementById("applicationDrive").value;
  let studentId = document.getElementById("applicationStudent").value;
  const status = document.getElementById("applicationStatus").value;

  if (role === "Student") {
    const me = myStudentRecord();
    if (!me) { formMsg("applicationMsg", "No student profile linked to your account.", "error"); return; }
    studentId = me.id;
  }
  if (!studentId || !driveId) { formMsg("applicationMsg", "Student and drive are required.", "error"); return; }

  const payload = { id, studentId, driveId, status: role === "Student" ? "Applied" : status };
  const res = await apiRequest("applications", id ? "update" : "create", payload);
  if (!res.success) { formMsg("applicationMsg", res.message, "error"); return; }
  formMsg("applicationMsg", res.message, "success");
  resetForm("application");
  await loadData();
  renderApplications();
}

function editApplication(id) {
  const a = db.applications.find(x => x.id === id);
  if (!a) return;
  document.getElementById("applicationId").value = a.id;
  document.getElementById("applicationStudent").value = a.studentId;
  document.getElementById("applicationDrive").value = a.driveId;
  document.getElementById("applicationStatus").value = a.status;
  document.getElementById("applicationFormTitle").innerText = "Update Application";
}

async function deleteApplication(id) {
  if (!confirm("Delete this application?")) return;
  const res = await apiRequest("applications", "delete", { id });
  toast(res.message, res.success ? "success" : "error");
  if (res.success) { await loadData(); renderApplications(); }
}

async function updateApplicationStatus(id, status) {
  const a = db.applications.find(x => x.id === id);
  if (!a) return;
  const res = await apiRequest("applications", "update", { id, studentId: a.studentId, driveId: a.driveId, status });
  toast(res.message, res.success ? "success" : "error");
  if (res.success) { await loadData(); renderApplications(); }
}

function statusBadgeClass(status) {
  return { Applied: "applied", Shortlisted: "shortlisted", Selected: "selected", Rejected: "rejected" }[status] || "applied";
}

function renderApplications() {
  renderApplicationStudentOptions();
  renderApplicationDriveOptions();
  const role = session.user.role;
  const body = document.getElementById("applicationTableBody");
  document.getElementById("applicationCount").innerText = `${db.applications.length} application${db.applications.length === 1 ? "" : "s"}`;
  if (db.applications.length === 0) { body.innerHTML = `<tr class="empty-row"><td colspan="8">No applications yet.</td></tr>`; return; }
  body.innerHTML = db.applications.slice().reverse().map(a => {
    const student = studentById(a.studentId);
    const drive = driveById(a.driveId);
    const company = drive ? companyById(drive.companyId) : null;
    const resumeCell = a.resumeUrl
      ? `<a href="${escapeHtml(a.resumeUrl)}" target="_blank" rel="noopener" class="action-btn edit-btn" style="display:inline-block;text-decoration:none">View</a>`
      : `<span class="muted">—</span>`;
    const answerCell = a.answer
      ? `<span class="question-chip" title="${escapeHtml(a.answer)}">${escapeHtml(a.answer.slice(0, 24))}${a.answer.length > 24 ? "…" : ""}</span>`
      : `<span class="muted">—</span>`;
    let actions = "";
    if (role === "Admin" || role === "CDC") {
      actions = `<button class="action-btn edit-btn" onclick="editApplication('${a.id}')">Edit</button>
        <button class="action-btn delete-btn" onclick="deleteApplication('${a.id}')">Delete</button>`;
    } else if (role === "Company") {
      actions = `<select onchange="updateApplicationStatus('${a.id}', this.value)">
        ${["Applied", "Shortlisted", "Selected", "Rejected"].map(s => `<option value="${s}" ${s === a.status ? "selected" : ""}>${s}</option>`).join("")}
      </select>`;
    }
    return `<tr>
      <td>${escapeHtml(student ? student.name : "Unknown")}</td><td>${escapeHtml(drive ? drive.role : "Unknown")}</td>
      <td>${escapeHtml(company ? company.name : "Unknown")}</td>
      <td>${resumeCell}</td><td>${answerCell}</td>
      <td><span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(a.status)}</span></td>
      <td>${escapeHtml(a.appliedAt)}</td><td>${actions}</td>
    </tr>`;
  }).join("");
}

// ================= PROFILE (Student) =================
function renderProfile() {
  const me = myStudentRecord();
  if (!me) { formMsg("profileMsg", "No student profile linked to your account yet. Contact the CDC.", "error"); return; }
  document.getElementById("profileName").value = me.name;
  document.getElementById("profileEmail").value = me.email;
  document.getElementById("profileBranch").value = me.branch;
  document.getElementById("profileCgpa").value = me.cgpa;
  document.getElementById("profileForm").dataset.id = me.id;

  const statusEl = document.getElementById("resumeStatus");
  statusEl.innerHTML = me.resumeUrl
    ? `Resume on file — <a href="${escapeHtml(me.resumeUrl)}" target="_blank" rel="noopener">view / share this link</a>.`
    : `No resume uploaded yet.`;
}

async function onResumeUploadClick() {
  const me = myStudentRecord();
  if (!me) { formMsg("resumeMsg", "No student profile linked to your account.", "error"); return; }
  const file = document.getElementById("resumeFile").files[0];
  if (!file) { formMsg("resumeMsg", "Choose a file first.", "error"); return; }
  const btn = document.getElementById("resumeUploadBtn");
  btn.disabled = true;
  const res = await uploadResumeFile(file);
  btn.disabled = false;
  formMsg("resumeMsg", res.message, res.success ? "success" : "error");
  if (res.success) {
    document.getElementById("resumeFile").value = "";
    await loadData();
    renderProfile();
  }
}

async function onProfileSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("profileForm").dataset.id;
  const payload = {
    id,
    name: document.getElementById("profileName").value.trim(),
    email: document.getElementById("profileEmail").value.trim(),
    branch: document.getElementById("profileBranch").value.trim(),
    cgpa: parseFloat(document.getElementById("profileCgpa").value)
  };
  const res = await apiRequest("students", "update", payload);
  formMsg("profileMsg", res.message, res.success ? "success" : "error");
  if (res.success) await loadData();
}

// ================= USERS (Admin) =================
function renderUserCompanyOptions() {
  const select = document.getElementById("userFormCompany");
  const current = select.value;
  select.innerHTML = `<option value="">—</option>` + db.companies.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  select.value = current;
}

async function onUserSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("userId").value;
  const payload = {
    id,
    name: document.getElementById("userFormName").value.trim(),
    email: document.getElementById("userFormEmail").value.trim(),
    role: document.getElementById("userFormRole").value,
    companyId: document.getElementById("userFormCompany").value,
    status: document.getElementById("userFormStatus").value
  };
  const password = document.getElementById("userFormPassword").value;
  if (password) payload.password = password;
  const res = await apiRequest("users", id ? "update" : "create", payload);
  if (!res.success) { formMsg("userFormMsg", res.message, "error"); return; }
  formMsg("userFormMsg", res.message, "success");
  resetForm("userForm");
  await loadData();
  renderUsers();
}

function editUser(id) {
  const u = db.users.find(x => x.id === id);
  if (!u) return;
  document.getElementById("userId").value = u.id;
  document.getElementById("userFormName").value = u.name;
  document.getElementById("userFormEmail").value = u.email;
  document.getElementById("userFormRole").value = u.role;
  document.getElementById("userFormCompany").value = u.companyId || "";
  document.getElementById("userFormStatus").value = u.status;
  document.getElementById("userFormTitle").innerText = "Update User";
}

async function deleteUser(id) {
  if (!confirm("Delete this user account?")) return;
  const res = await apiRequest("users", "delete", { id });
  toast(res.message, res.success ? "success" : "error");
  if (res.success) { await loadData(); renderUsers(); }
}

function renderUsers() {
  renderUserCompanyOptions();
  const body = document.getElementById("userTableBody");
  document.getElementById("userCount").innerText = `${db.users.length} user${db.users.length === 1 ? "" : "s"}`;
  if (db.users.length === 0) { body.innerHTML = `<tr class="empty-row"><td colspan="5">No users yet.</td></tr>`; return; }
  body.innerHTML = db.users.map(u => `<tr>
    <td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td>
    <td><span class="badge ${u.status === "active" ? "selected" : "rejected"}">${escapeHtml(u.status)}</span></td>
    <td><button class="action-btn edit-btn" onclick="editUser('${u.id}')">Edit</button>
    <button class="action-btn delete-btn" onclick="deleteUser('${u.id}')">Delete</button></td>
  </tr>`).join("");
}

// ================= DASHBOARD =================
function renderDashboard() {
  const role = session.user.role;
  const grid = document.getElementById("statGrid");

  if (role === "Admin" || role === "CDC") {
    grid.innerHTML = `
      <div class="stat"><div class="label">Companies</div><div class="value">${db.companies.length}</div></div>
      <div class="stat"><div class="label">Active Drives</div><div class="value">${db.drives.length}</div></div>
      <div class="stat"><div class="label">Students</div><div class="value">${db.students.length}</div></div>
      <div class="stat accent"><div class="label">Applications</div><div class="value">${db.applications.length}</div></div>`;
  } else if (role === "Company") {
    const myDrives = db.drives.filter(d => d.companyId === session.user.companyId);
    const myApps = db.applications;
    grid.innerHTML = `
      <div class="stat"><div class="label">Our drives</div><div class="value">${myDrives.length}</div></div>
      <div class="stat"><div class="label">Applicants</div><div class="value">${myApps.length}</div></div>
      <div class="stat"><div class="label">Shortlisted</div><div class="value">${myApps.filter(a => a.status === "Shortlisted").length}</div></div>
      <div class="stat accent"><div class="label">Selected</div><div class="value">${myApps.filter(a => a.status === "Selected").length}</div></div>`;
  } else {
    const myApps = db.applications;
    grid.innerHTML = `
      <div class="stat"><div class="label">Open drives</div><div class="value">${db.drives.length}</div></div>
      <div class="stat"><div class="label">My applications</div><div class="value">${myApps.length}</div></div>
      <div class="stat"><div class="label">Shortlisted</div><div class="value">${myApps.filter(a => a.status === "Shortlisted").length}</div></div>
      <div class="stat accent"><div class="label">Selected</div><div class="value">${myApps.filter(a => a.status === "Selected").length}</div></div>`;
  }

  renderCharts();

  const recentBody = document.getElementById("recentAppsBody");
  const recent = db.applications.slice(-5).reverse();
  if (recent.length === 0) {
    recentBody.innerHTML = `<tr class="empty-row"><td colspan="5">No applications yet.</td></tr>`;
  } else {
    recentBody.innerHTML = recent.map(a => {
      const student = studentById(a.studentId);
      const drive = driveById(a.driveId);
      const company = drive ? companyById(drive.companyId) : null;
      return `<tr>
        <td>${escapeHtml(student ? student.name : "Unknown")}</td><td>${escapeHtml(drive ? drive.role : "Unknown")}</td>
        <td>${escapeHtml(company ? company.name : "Unknown")}</td>
        <td><span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(a.status)}</span></td>
        <td>${escapeHtml(a.appliedAt)}</td>
      </tr>`;
    }).join("");
  }
}

function renderCharts() {
  const statuses = ["Applied", "Shortlisted", "Selected", "Rejected"];
  const statusColors = ["#d79a1f", "#5b6cf0", "#2f9e6e", "#e2566b"];
  const statusCounts = statuses.map(s => db.applications.filter(a => a.status === s).length);

  const ctx1 = document.getElementById("chartStatus");
  if (charts.status) charts.status.destroy();
  charts.status = new Chart(ctx1, {
    type: "doughnut",
    data: { labels: statuses, datasets: [{ data: statusCounts, backgroundColor: statusColors, borderWidth: 0 }] },
    options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } }, cutout: "62%" }
  });

  const companyNames = db.companies.map(c => c.name);
  const driveCounts = db.companies.map(c => db.drives.filter(d => d.companyId === c.id).length);
  const ctx2 = document.getElementById("chartDrives");
  if (charts.drives) charts.drives.destroy();
  charts.drives = new Chart(ctx2, {
    type: "bar",
    data: { labels: companyNames, datasets: [{ data: driveCounts, backgroundColor: "#8d9bff", borderRadius: 6, maxBarThickness: 34 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}
