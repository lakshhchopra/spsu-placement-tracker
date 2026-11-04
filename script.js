/*
  CPDMS — Campus Placement Drive Management System.
  Enterprise-style multi-entity CRUD: Companies, Placement Drives, Students, Applications.

  Storage: browser localStorage, one "sheet" (array) per entity — mirrors the four-sheet
  Google Apps Script backend in backend/Code.gs (Companies / Drives / Students / Applications
  tabs in one spreadsheet). Swapping storage.js calls here for fetch() calls to a deployed
  Apps Script Web App persists the same shape of data server-side instead.
*/

const KEYS = {
  companies: "cpdms_companies",
  drives: "cpdms_drives",
  students: "cpdms_students",
  applications: "cpdms_applications"
};

let db = {
  companies: JSON.parse(localStorage.getItem(KEYS.companies) || "null"),
  drives: JSON.parse(localStorage.getItem(KEYS.drives) || "null"),
  students: JSON.parse(localStorage.getItem(KEYS.students) || "null"),
  applications: JSON.parse(localStorage.getItem(KEYS.applications) || "null")
};

function persist(entity) {
  localStorage.setItem(KEYS[entity], JSON.stringify(db[entity]));
}

function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------- Seed demo data on first run ----------
if (!db.companies) {
  db.companies = [
    { id: "c-tcs", name: "TCS", industry: "IT Services", website: "tcs.com" },
    { id: "c-infosys", name: "Infosys", industry: "IT Services", website: "infosys.com" },
    { id: "c-wipro", name: "Wipro", industry: "IT Services", website: "wipro.com" }
  ];
  persist("companies");
}
if (!db.drives) {
  db.drives = [
    { id: "d-1", companyId: "c-tcs", role: "SDE I", package: 7.5, minCgpa: 6.0, deadline: "2026-11-20" },
    { id: "d-2", companyId: "c-infosys", role: "Systems Engineer", package: 6.0, minCgpa: 7.0, deadline: "2026-11-12" },
    { id: "d-3", companyId: "c-wipro", role: "Project Engineer", package: 5.5, minCgpa: 6.5, deadline: "2026-12-01" }
  ];
  persist("drives");
}
if (!db.students) {
  db.students = [
    { id: "s-1", name: "Aarav Mehta", email: "aarav.mehta@spsu.ac.in", branch: "CSE", cgpa: 8.2 },
    { id: "s-2", name: "Ishita Sharma", email: "ishita.sharma@spsu.ac.in", branch: "IT", cgpa: 8.9 },
    { id: "s-3", name: "Rohan Verma", email: "rohan.verma@spsu.ac.in", branch: "CSE", cgpa: 7.1 }
  ];
  persist("students");
}
if (!db.applications) {
  db.applications = [
    { id: "a-1", studentId: "s-1", driveId: "d-1", status: "Shortlisted", appliedAt: new Date().toLocaleString() },
    { id: "a-2", studentId: "s-2", driveId: "d-2", status: "Selected", appliedAt: new Date().toLocaleString() },
    { id: "a-3", studentId: "s-3", driveId: "d-3", status: "Applied", appliedAt: new Date().toLocaleString() }
  ];
  persist("applications");
}

// ---------- Lookups ----------
const companyById = id => db.companies.find(c => c.id === id);
const driveById = id => db.drives.find(d => d.id === id);
const studentById = id => db.students.find(s => s.id === id);

function escapeHtml(str) {
  const div = document.createElement("div");
  div.innerText = str == null ? "" : String(str);
  return div.innerHTML;
}

function showMessage(entity, text, type) {
  const el = document.getElementById(entity + "Msg");
  if (!el) return;
  el.innerText = text;
  el.className = "msg " + type;
  setTimeout(() => { el.innerText = ""; }, 3500);
}

// ---------- Navigation ----------
document.querySelectorAll(".navBtn").forEach(btn => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  document.querySelectorAll(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  renderAll();
}

// ================= COMPANIES =================
const companyForm = document.getElementById("companyForm");
companyForm.addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("companyId").value;
  const payload = {
    id: id || uid("c"),
    name: document.getElementById("companyName").value.trim(),
    industry: document.getElementById("companyIndustry").value.trim(),
    website: document.getElementById("companyWebsite").value.trim()
  };
  if (!payload.name || !payload.industry) { showMessage("company", "Company name and industry are required.", "error"); return; }

  if (id) {
    const idx = db.companies.findIndex(c => c.id === id);
    db.companies[idx] = payload;
    showMessage("company", "Company updated successfully.", "success");
  } else {
    db.companies.push(payload);
    showMessage("company", "Company created successfully.", "success");
  }
  persist("companies");
  resetForm("company");
  renderAll();
});

function editCompany(id) {
  const c = companyById(id);
  if (!c) return;
  document.getElementById("companyId").value = c.id;
  document.getElementById("companyName").value = c.name;
  document.getElementById("companyIndustry").value = c.industry;
  document.getElementById("companyWebsite").value = c.website;
  document.getElementById("companyFormTitle").innerText = "Update Company";
}

function deleteCompany(id) {
  const linkedDrives = db.drives.some(d => d.companyId === id);
  if (linkedDrives) {
    showMessage("company", "Cannot delete: this company has placement drives linked to it.", "error");
    return;
  }
  if (!confirm("Delete this company?")) return;
  db.companies = db.companies.filter(c => c.id !== id);
  persist("companies");
  showMessage("company", "Company deleted.", "success");
  renderAll();
}

function renderCompanies() {
  const body = document.getElementById("companyTableBody");
  document.getElementById("companyCount").innerText = `${db.companies.length} compan${db.companies.length === 1 ? "y" : "ies"}`;
  if (db.companies.length === 0) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">No companies yet.</td></tr>`;
    return;
  }
  body.innerHTML = db.companies.map(c => {
    const openDrives = db.drives.filter(d => d.companyId === c.id).length;
    return `<tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.industry)}</td>
      <td>${escapeHtml(c.website)}</td>
      <td>${openDrives}</td>
      <td>
        <button class="actionBtn editBtn" onclick="editCompany('${c.id}')">Edit</button>
        <button class="actionBtn deleteBtn" onclick="deleteCompany('${c.id}')">Delete</button>
      </td>
    </tr>`;
  }).join("");
}

// ================= DRIVES =================
const driveForm = document.getElementById("driveForm");
driveForm.addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("driveId").value;
  const payload = {
    id: id || uid("d"),
    companyId: document.getElementById("driveCompany").value,
    role: document.getElementById("driveRole").value.trim(),
    package: parseFloat(document.getElementById("drivePackage").value),
    minCgpa: parseFloat(document.getElementById("driveMinCgpa").value),
    deadline: document.getElementById("driveDeadline").value
  };
  if (!payload.companyId || !payload.role) { showMessage("drive", "Company and role are required.", "error"); return; }
  if (payload.minCgpa < 0 || payload.minCgpa > 10) { showMessage("drive", "Minimum CGPA must be between 0 and 10.", "error"); return; }
  if (!payload.deadline || new Date(payload.deadline) < new Date(new Date().toDateString())) {
    showMessage("drive", "Deadline must be a future date.", "error"); return;
  }

  if (id) {
    const idx = db.drives.findIndex(d => d.id === id);
    db.drives[idx] = payload;
    showMessage("drive", "Drive updated successfully.", "success");
  } else {
    db.drives.push(payload);
    showMessage("drive", "Drive created successfully.", "success");
  }
  persist("drives");
  resetForm("drive");
  renderAll();
});

function editDrive(id) {
  const d = driveById(id);
  if (!d) return;
  document.getElementById("driveId").value = d.id;
  document.getElementById("driveCompany").value = d.companyId;
  document.getElementById("driveRole").value = d.role;
  document.getElementById("drivePackage").value = d.package;
  document.getElementById("driveMinCgpa").value = d.minCgpa;
  document.getElementById("driveDeadline").value = d.deadline;
  document.getElementById("driveFormTitle").innerText = "Update Drive";
}

function deleteDrive(id) {
  const linkedApps = db.applications.some(a => a.driveId === id);
  if (linkedApps) {
    showMessage("drive", "Cannot delete: this drive has applications linked to it.", "error");
    return;
  }
  if (!confirm("Delete this drive?")) return;
  db.drives = db.drives.filter(d => d.id !== id);
  persist("drives");
  showMessage("drive", "Drive deleted.", "success");
  renderAll();
}

function renderDriveCompanyOptions() {
  const select = document.getElementById("driveCompany");
  const current = select.value;
  select.innerHTML = `<option value="">Select Company</option>` + db.companies.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  select.value = current;
}

function renderDrives() {
  const body = document.getElementById("driveTableBody");
  document.getElementById("driveCount").innerText = `${db.drives.length} drive${db.drives.length === 1 ? "" : "s"}`;
  if (db.drives.length === 0) {
    body.innerHTML = `<tr class="empty-row"><td colspan="7">No placement drives yet.</td></tr>`;
    return;
  }
  body.innerHTML = db.drives.map(d => {
    const company = companyById(d.companyId);
    const applicants = db.applications.filter(a => a.driveId === d.id).length;
    return `<tr>
      <td>${escapeHtml(company ? company.name : "Unknown")}</td>
      <td>${escapeHtml(d.role)}</td>
      <td>${d.package} LPA</td>
      <td>${d.minCgpa}</td>
      <td>${escapeHtml(d.deadline)}</td>
      <td>${applicants}</td>
      <td>
        <button class="actionBtn editBtn" onclick="editDrive('${d.id}')">Edit</button>
        <button class="actionBtn deleteBtn" onclick="deleteDrive('${d.id}')">Delete</button>
      </td>
    </tr>`;
  }).join("");
}

// ================= STUDENTS =================
const studentForm = document.getElementById("studentForm");
studentForm.addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("studentId").value;
  const payload = {
    id: id || uid("s"),
    name: document.getElementById("studentName").value.trim(),
    email: document.getElementById("studentEmail").value.trim(),
    branch: document.getElementById("studentBranch").value.trim(),
    cgpa: parseFloat(document.getElementById("studentCgpa").value)
  };
  if (!payload.name || !payload.email || !payload.branch) { showMessage("student", "All fields are required.", "error"); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { showMessage("student", "Please enter a valid email address.", "error"); return; }
  if (payload.cgpa < 0 || payload.cgpa > 10) { showMessage("student", "CGPA must be between 0 and 10.", "error"); return; }

  if (id) {
    const idx = db.students.findIndex(s => s.id === id);
    db.students[idx] = payload;
    showMessage("student", "Student updated successfully.", "success");
  } else {
    db.students.push(payload);
    showMessage("student", "Student created successfully.", "success");
  }
  persist("students");
  resetForm("student");
  renderAll();
});

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

function deleteStudent(id) {
  const linkedApps = db.applications.some(a => a.studentId === id);
  if (linkedApps) {
    showMessage("student", "Cannot delete: this student has applications linked to them.", "error");
    return;
  }
  if (!confirm("Delete this student?")) return;
  db.students = db.students.filter(s => s.id !== id);
  persist("students");
  showMessage("student", "Student deleted.", "success");
  renderAll();
}

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

function renderStudents() {
  const body = document.getElementById("studentTableBody");
  document.getElementById("studentCount").innerText = `${db.students.length} student${db.students.length === 1 ? "" : "s"}`;
  if (db.students.length === 0) {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">No students yet.</td></tr>`;
    return;
  }
  body.innerHTML = db.students.map(s => {
    const apps = db.applications.filter(a => a.studentId === s.id).length;
    return `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.branch)}</td>
      <td>${s.cgpa}</td>
      <td>${apps}</td>
      <td>
        <button class="actionBtn editBtn" onclick="editStudent('${s.id}')">Edit</button>
        <button class="actionBtn deleteBtn" onclick="deleteStudent('${s.id}')">Delete</button>
      </td>
    </tr>`;
  }).join("");
}

// ================= APPLICATIONS =================
const applicationForm = document.getElementById("applicationForm");
applicationForm.addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("applicationId").value;
  const studentId = document.getElementById("applicationStudent").value;
  const driveId = document.getElementById("applicationDrive").value;
  const status = document.getElementById("applicationStatus").value;

  if (!studentId || !driveId) { showMessage("application", "Student and drive are required.", "error"); return; }

  const student = studentById(studentId);
  const drive = driveById(driveId);

  if (!id) {
    if (new Date(drive.deadline) < new Date(new Date().toDateString())) {
      showMessage("application", "Application deadline has passed.", "error"); return;
    }
    if (student.cgpa < drive.minCgpa) {
      showMessage("application", "Student does not meet the eligibility criteria for this drive.", "error"); return;
    }
    const duplicate = db.applications.some(a => a.studentId === studentId && a.driveId === driveId);
    if (duplicate) {
      showMessage("application", "This student has already applied to this drive.", "error"); return;
    }
  }

  const payload = {
    id: id || uid("a"),
    studentId, driveId, status,
    appliedAt: id ? db.applications.find(a => a.id === id).appliedAt : new Date().toLocaleString()
  };

  if (id) {
    const idx = db.applications.findIndex(a => a.id === id);
    db.applications[idx] = payload;
    showMessage("application", "Application updated successfully.", "success");
  } else {
    db.applications.push(payload);
    showMessage("application", "Application submitted successfully.", "success");
  }
  persist("applications");
  resetForm("application");
  renderAll();
});

function editApplication(id) {
  const a = db.applications.find(x => x.id === id);
  if (!a) return;
  document.getElementById("applicationId").value = a.id;
  document.getElementById("applicationStudent").value = a.studentId;
  document.getElementById("applicationDrive").value = a.driveId;
  document.getElementById("applicationStatus").value = a.status;
  document.getElementById("applicationFormTitle").innerText = "Update Application";
}

function deleteApplication(id) {
  if (!confirm("Delete this application?")) return;
  db.applications = db.applications.filter(a => a.id !== id);
  persist("applications");
  showMessage("application", "Application deleted.", "success");
  renderAll();
}

function statusBadgeClass(status) {
  return { Applied: "applied", Shortlisted: "shortlisted", Selected: "selected", Rejected: "rejected" }[status] || "applied";
}

function renderApplications() {
  const body = document.getElementById("applicationTableBody");
  document.getElementById("applicationCount").innerText = `${db.applications.length} application${db.applications.length === 1 ? "" : "s"}`;
  if (db.applications.length === 0) {
    body.innerHTML = `<tr class="empty-row"><td colspan="6">No applications yet.</td></tr>`;
    return;
  }
  body.innerHTML = db.applications.slice().reverse().map(a => {
    const student = studentById(a.studentId);
    const drive = driveById(a.driveId);
    const company = drive ? companyById(drive.companyId) : null;
    return `<tr>
      <td>${escapeHtml(student ? student.name : "Unknown")}</td>
      <td>${escapeHtml(drive ? drive.role : "Unknown")}</td>
      <td>${escapeHtml(company ? company.name : "Unknown")}</td>
      <td><span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(a.status)}</span></td>
      <td>${escapeHtml(a.appliedAt)}</td>
      <td>
        <button class="actionBtn editBtn" onclick="editApplication('${a.id}')">Edit</button>
        <button class="actionBtn deleteBtn" onclick="deleteApplication('${a.id}')">Delete</button>
      </td>
    </tr>`;
  }).join("");
}

// ================= DASHBOARD =================
function renderDashboard() {
  const grid = document.getElementById("statGrid");
  grid.innerHTML = `
    <div class="stat"><div class="label">Companies</div><div class="value">${db.companies.length}</div></div>
    <div class="stat"><div class="label">Active Drives</div><div class="value">${db.drives.length}</div></div>
    <div class="stat"><div class="label">Students</div><div class="value">${db.students.length}</div></div>
    <div class="stat accent"><div class="label">Applications</div><div class="value">${db.applications.length}</div></div>
  `;

  const statuses = ["Applied", "Shortlisted", "Selected", "Rejected"];
  const colors = { Applied: "#f0c419", Shortlisted: "#8b5cf6", Selected: "#2f9e44", Rejected: "#e03131" };
  const max = Math.max(1, ...statuses.map(s => db.applications.filter(a => a.status === s).length));
  document.getElementById("statusBars").innerHTML = statuses.map(s => {
    const count = db.applications.filter(a => a.status === s).length;
    const pct = Math.round((count / max) * 100);
    return `<div class="statusRow">
      <div class="name">${s}</div>
      <div class="barTrack"><div class="barFill" style="width:${pct}%;background:${colors[s]}"></div></div>
      <div class="num">${count}</div>
    </div>`;
  }).join("");

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
        <td>${escapeHtml(student ? student.name : "Unknown")}</td>
        <td>${escapeHtml(drive ? drive.role : "Unknown")}</td>
        <td>${escapeHtml(company ? company.name : "Unknown")}</td>
        <td><span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(a.status)}</span></td>
        <td>${escapeHtml(a.appliedAt)}</td>
      </tr>`;
    }).join("");
  }
}

// ================= Shared ================
function resetForm(entity) {
  document.getElementById(entity + "Form").reset();
  document.getElementById(entity + "Id").value = "";
  const titleMap = { company: "Add Company", drive: "Add Drive", student: "Add Student", application: "New Application" };
  document.getElementById(entity + "FormTitle").innerText = titleMap[entity];
}

function renderAll() {
  renderDriveCompanyOptions();
  renderApplicationStudentOptions();
  renderApplicationDriveOptions();
  renderCompanies();
  renderDrives();
  renderStudents();
  renderApplications();
  renderDashboard();
}

renderAll();
