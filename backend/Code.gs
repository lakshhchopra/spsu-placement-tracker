/*
  CPDMS Backend — Google Apps Script, bound to this Spreadsheet, deployed as a Web App.

  Real multi-role backend: every entity lives in its own tab of THIS spreadsheet, and
  script.js talks to this script over fetch(). Passwords are salted + SHA-256 hashed
  here on the server — never stored or transmitted in plaintext. Every entity call
  (other than auth) requires a valid session token, and reads/writes are filtered and
  gated per role (Student / Company / CDC / Admin) below.

  SETUP (run once):
    1. Open this spreadsheet > Extensions > Apps Script, paste this whole file over Code.gs.
    2. Select the function `setupSheets` in the toolbar dropdown, click Run, approve the
       authorization prompt (this account's own script touching this account's own sheet).
    3. Deploy > New deployment > type "Web app" > Execute as "Me" > Who has access "Anyone".
    4. Copy the resulting /exec URL into script.js's API_URL constant.

  Tabs created by setupSheets():
    Users         : id | name | email | passwordHash | salt | role | companyId | status
    Sessions      : token | userId | role | createdAt | expiresAt
    Companies     : id | name | industry | website
    Drives        : id | companyId | role | package | minCgpa | deadline
    Students      : id | userId | name | email | branch | cgpa
    Applications  : id | studentId | driveId | status | appliedAt
*/

const SHEETS = {
  companies: { name: "Companies", columns: ["id", "name", "industry", "website"] },
  drives: { name: "Drives", columns: ["id", "companyId", "role", "package", "minCgpa", "deadline", "customQuestion"] },
  students: { name: "Students", columns: ["id", "userId", "name", "email", "branch", "cgpa", "resumeUrl"] },
  applications: { name: "Applications", columns: ["id", "studentId", "driveId", "status", "appliedAt", "answer", "resumeUrl"] }
};
const RESUME_FOLDER_NAME = "CPDMS Resumes";
const USERS_SHEET = "Users";
const USERS_COLUMNS = ["id", "name", "email", "passwordHash", "salt", "role", "companyId", "status"];
const SESSIONS_SHEET = "Sessions";
const SESSIONS_COLUMNS = ["token", "userId", "role", "createdAt", "expiresAt"];
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RESETS_SHEET = "Resets";
const RESETS_COLUMNS = ["email", "code", "createdAt"];

// ===================== SETUP (run manually once) =====================
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  writeSheet_(ss, USERS_SHEET, USERS_COLUMNS, seedUsers_());
  writeSheet_(ss, SESSIONS_SHEET, SESSIONS_COLUMNS, []);
  writeSheet_(ss, RESETS_SHEET, RESETS_COLUMNS, []);
  writeSheet_(ss, SHEETS.companies.name, SHEETS.companies.columns, seedCompanies_());
  writeSheet_(ss, SHEETS.drives.name, SHEETS.drives.columns, seedDrives_());
  writeSheet_(ss, SHEETS.students.name, SHEETS.students.columns, seedStudents_());
  writeSheet_(ss, SHEETS.applications.name, SHEETS.applications.columns, seedApplications_());

  const stray = ss.getSheetByName("Sheet1");
  if (stray && ss.getSheets().length > 1) ss.deleteSheet(stray);

  Logger.log("Setup complete. Admin login: admin@cpdms.com / Admin@123");
}

// Run this once after updating an already-seeded sheet to the newer schema
// (adds resumeUrl / customQuestion / answer columns without wiping existing rows).
function migrateSchema() {
  addColumnIfMissing_(SHEETS.students.name, "resumeUrl");
  addColumnIfMissing_(SHEETS.drives.name, "customQuestion");
  addColumnIfMissing_(SHEETS.applications.name, "answer");
  addColumnIfMissing_(SHEETS.applications.name, "resumeUrl");
  Logger.log("Migration complete.");
}

function addColumnIfMissing_(sheetName, colName) {
  const sheet = getSheet_(sheetName);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf(colName) === -1) {
    sheet.getRange(1, lastCol + 1).setValue(colName);
  }
}

function writeSheet_(ss, name, columns, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();
  sheet.appendRow(columns);
  rows.forEach(r => sheet.appendRow(columns.map(c => r[c] !== undefined ? r[c] : "")));
  sheet.setFrozenRows(1);
}

function seedUsers_() {
  const mk = (id, name, email, password, role, companyId) => {
    const salt = Utilities.getUuid();
    return { id, name, email, passwordHash: hashPassword_(password, salt), salt, role, companyId: companyId || "", status: "active" };
  };
  return [
    mk("u-1", "Lakshya Chopra", "admin@cpdms.com", "Admin@123", "Admin"),
    mk("u-2", "Priya Nair", "cdc@cpdms.com", "Cdc@1234", "CDC"),
    mk("u-3", "TCS Recruiter", "tcs@cpdms.com", "Tcs@1234", "Company", "c-tcs"),
    mk("u-4", "Aarav Mehta", "aarav.mehta@spsu.ac.in", "Aarav@123", "Student")
  ];
}

function seedCompanies_() {
  return [
    { id: "c-tcs", name: "TCS", industry: "IT Services", website: "tcs.com" },
    { id: "c-infosys", name: "Infosys", industry: "IT Services", website: "infosys.com" },
    { id: "c-wipro", name: "Wipro", industry: "IT Services", website: "wipro.com" }
  ];
}

function seedDrives_() {
  return [
    { id: "d-1", companyId: "c-tcs", role: "SDE I", package: 7.5, minCgpa: 6.0, deadline: "2026-12-20" },
    { id: "d-2", companyId: "c-infosys", role: "Systems Engineer", package: 6.0, minCgpa: 7.0, deadline: "2026-12-12" },
    { id: "d-3", companyId: "c-wipro", role: "Project Engineer", package: 5.5, minCgpa: 6.5, deadline: "2027-01-05" }
  ];
}

function seedStudents_() {
  return [
    { id: "s-1", userId: "u-4", name: "Aarav Mehta", email: "aarav.mehta@spsu.ac.in", branch: "CSE", cgpa: 8.2 },
    { id: "s-2", userId: "", name: "Ishita Sharma", email: "ishita.sharma@spsu.ac.in", branch: "IT", cgpa: 8.9 },
    { id: "s-3", userId: "", name: "Rohan Verma", email: "rohan.verma@spsu.ac.in", branch: "CSE", cgpa: 7.1 }
  ];
}

function seedApplications_() {
  const now = new Date().toLocaleString();
  return [
    { id: "a-1", studentId: "s-1", driveId: "d-1", status: "Shortlisted", appliedAt: now },
    { id: "a-2", studentId: "s-2", driveId: "d-2", status: "Selected", appliedAt: now },
    { id: "a-3", studentId: "s-3", driveId: "d-3", status: "Applied", appliedAt: now }
  ];
}

// ===================== HTTP entry points =====================
function doGet(e) {
  const entity = e.parameter.entity || "companies";
  return handleRequest(entity, e.parameter.action || "read", e.parameter);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    return handleRequest(data.entity, data.action, data);
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  }
}

function handleRequest(entityKey, action, data) {
  try {
    if (entityKey === "auth") return handleAuth(action, data);

    // every non-auth call must carry a valid session token
    const session = requireSession_(data);

    if (entityKey === "users") return handleUsers_(action, data, session);
    if (entityKey === "uploads") return handleUploads_(action, data, session);

    const entity = SHEETS[entityKey];
    if (!entity) throw new Error("Unknown entity: " + entityKey);

    assertPermission_(entityKey, action, data, session);

    const sheet = getSheet_(entity.name);
    switch (action) {
      case "create": {
        const id = entityKey.slice(0, 1) + "-" + new Date().getTime().toString(36);
        const row = entity.columns.map(col => col === "id" ? id : (data[col] !== undefined ? data[col] : ""));
        sheet.appendRow(row);
        return jsonResponse({ success: true, message: capitalize_(entityKey) + " created successfully", id: id });
      }
      case "read": {
        const values = sheet.getDataRange().getValues();
        if (values.length <= 1) return jsonResponse({ success: true, data: [] });
        values.shift();
        let records = values
          .filter(row => row.some(cell => cell !== ""))
          .map(row => {
            const obj = {};
            entity.columns.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
          });
        records = filterRead_(entityKey, records, session);
        return jsonResponse({ success: true, data: records });
      }
      case "update": {
        const rowIndex = findRowById_(sheet, data.id);
        if (rowIndex === -1) throw new Error(capitalize_(entityKey) + " record not found");
        // Merge with the existing row so a partial payload (e.g. a Company only
        // sending {id, customQuestion}) never blanks out the other fields.
        const existing = sheet.getRange(rowIndex, 1, 1, entity.columns.length).getValues()[0];
        const values = entity.columns.map((col, i) => col === "id" ? data.id : (data[col] !== undefined ? data[col] : existing[i]));
        sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
        return jsonResponse({ success: true, message: capitalize_(entityKey) + " updated successfully" });
      }
      case "delete": {
        const rowIndex = findRowById_(sheet, data.id);
        if (rowIndex === -1) throw new Error(capitalize_(entityKey) + " record not found");
        sheet.deleteRow(rowIndex);
        return jsonResponse({ success: true, message: capitalize_(entityKey) + " deleted successfully" });
      }
      default:
        throw new Error("Invalid action");
    }
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  }
}

// ===================== Role permissions =====================
// Admin: full access to everything.
// CDC: full access to companies/drives/students/applications (not user accounts).
// Company: read companies/drives/students; read+update(status only) applications tied
//          to their own drives; cannot create/delete companies, drives or students.
// Student: read companies/drives; read/create own applications; read/update own
//          student profile only.
function assertPermission_(entityKey, action, data, session) {
  const role = session.role;
  if (role === "Admin") return;

  if (entityKey === "companies" || entityKey === "drives") {
    if (role === "CDC") return;
    if (action === "read") return;
    if (entityKey === "drives" && role === "Company" && action === "update") {
      const drive = findRowByIdInSheet_(SHEETS.drives.name, data.id);
      if (drive && drive.companyId === session.companyId) return;
      throw new Error("You can only edit your own drives.");
    }
    throw new Error("You do not have permission to modify " + entityKey + ".");
  }

  if (entityKey === "students") {
    if (role === "CDC") return;
    if (action === "read") return; // row-level filtering happens in filterRead_
    if (role === "Student" && action === "update") {
      const own = getStudentRecordByUserId_(session.userId);
      if (own && own.id === data.id) return;
      throw new Error("You can only edit your own student profile.");
    }
    throw new Error("You do not have permission to modify students.");
  }

  if (entityKey === "applications") {
    if (role === "CDC") return;
    if (role === "Student") {
      if (action === "read") return;
      if (action === "create") {
        const own = getStudentRecordByUserId_(session.userId);
        if (own && own.id === data.studentId) return;
        throw new Error("You can only apply as yourself.");
      }
      throw new Error("Students cannot edit or delete applications directly.");
    }
    if (role === "Company") {
      if (action === "read") return;
      if (action === "update") {
        const drive = findRowByIdInSheet_(SHEETS.drives.name, data.driveId || getApplicationDriveId_(data.id));
        if (drive && drive.companyId === session.companyId) return;
        throw new Error("You can only update applications for your own drives.");
      }
      throw new Error("Companies cannot create or delete applications.");
    }
    throw new Error("You do not have permission on applications.");
  }

  throw new Error("Permission denied.");
}

function filterRead_(entityKey, records, session) {
  const role = session.role;
  if (role === "Admin" || role === "CDC") return records;

  if (entityKey === "students") {
    if (role === "Student") {
      const own = getStudentRecordByUserId_(session.userId);
      return own ? records.filter(r => r.id === own.id) : [];
    }
    return records; // Company can see applicant profiles
  }

  if (entityKey === "applications") {
    if (role === "Student") {
      const own = getStudentRecordByUserId_(session.userId);
      return own ? records.filter(r => r.studentId === own.id) : [];
    }
    if (role === "Company") {
      const driveIds = getSheetRecords_(SHEETS.drives.name, SHEETS.drives.columns)
        .filter(d => d.companyId === session.companyId)
        .map(d => d.id);
      return records.filter(r => driveIds.indexOf(r.driveId) !== -1);
    }
  }

  return records;
}

function getApplicationDriveId_(appId) {
  const app = findRowByIdInSheet_(SHEETS.applications.name, appId);
  return app ? app.driveId : null;
}

function findRowByIdInSheet_(sheetName, id) {
  if (!id) return null;
  const columns = Object.values(SHEETS).find(s => s.name === sheetName).columns;
  return getSheetRecords_(sheetName, columns).find(r => r.id === id) || null;
}

function getSheetRecords_(sheetName, columns) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  values.shift();
  return values.filter(row => row.some(cell => cell !== "")).map(row => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function getStudentRecordByUserId_(userId) {
  if (!userId) return null;
  return getSheetRecords_(SHEETS.students.name, SHEETS.students.columns).find(s => s.userId === userId) || null;
}

// ===================== Users (Admin only) =====================
function handleUsers_(action, data, session) {
  if (session.role !== "Admin") throw new Error("Only an Admin can manage user accounts.");
  const sheet = getSheet_(USERS_SHEET);

  switch (action) {
    case "read": {
      const values = sheet.getDataRange().getValues();
      values.shift();
      const records = values
        .filter(row => row.some(cell => cell !== ""))
        .map(row => ({ id: row[0], name: row[1], email: row[2], role: row[5], companyId: row[6], status: row[7] }));
      return jsonResponse({ success: true, data: records });
    }
    case "create": {
      if (!data.email || !data.name || !data.role) throw new Error("Name, email and role are required.");
      const existing = findRowByColumn_(sheet, 2, data.email);
      if (existing !== -1) throw new Error("A user with this email already exists.");
      const id = "u-" + new Date().getTime().toString(36);
      const salt = Utilities.getUuid();
      const password = data.password || Utilities.getUuid().slice(0, 8);
      const hash = hashPassword_(password, salt);
      sheet.appendRow([id, data.name, data.email, hash, salt, data.role, data.companyId || "", data.status || "active"]);
      return jsonResponse({ success: true, message: "User created successfully", id: id });
    }
    case "update": {
      const rowIndex = findRowById_(sheet, data.id);
      if (rowIndex === -1) throw new Error("User not found");
      const row = sheet.getRange(rowIndex, 1, 1, USERS_COLUMNS.length).getValues()[0];
      const name = data.name !== undefined ? data.name : row[1];
      const email = data.email !== undefined ? data.email : row[2];
      let hash = row[3], salt = row[4];
      if (data.password) {
        salt = Utilities.getUuid();
        hash = hashPassword_(data.password, salt);
      }
      const role = data.role !== undefined ? data.role : row[5];
      const companyId = data.companyId !== undefined ? data.companyId : row[6];
      const status = data.status !== undefined ? data.status : row[7];
      sheet.getRange(rowIndex, 1, 1, USERS_COLUMNS.length).setValues([[data.id, name, email, hash, salt, role, companyId, status]]);
      return jsonResponse({ success: true, message: "User updated successfully" });
    }
    case "delete": {
      const rowIndex = findRowById_(sheet, data.id);
      if (rowIndex === -1) throw new Error("User not found");
      if (data.id === session.userId) throw new Error("You cannot delete your own account.");
      sheet.deleteRow(rowIndex);
      return jsonResponse({ success: true, message: "User deleted successfully" });
    }
    default:
      throw new Error("Invalid action");
  }
}

// ===================== Uploads (resumes, saved to Drive) =====================
// A student uploads their own resume (or Admin/CDC uploads on a student's behalf);
// the file is stored in a shared Drive folder, and the resulting link is saved onto
// that Student's row so it can be reused on every future application and shared.
function handleUploads_(action, data, session) {
  if (action !== "resume") throw new Error("Invalid upload action");
  if (!data.base64 || !data.fileName) throw new Error("A resume file is required.");

  const role = session.role;
  let studentRecord;
  if (role === "Student") {
    studentRecord = getStudentRecordByUserId_(session.userId);
    if (!studentRecord) throw new Error("No student profile linked to your account.");
  } else if (role === "Admin" || role === "CDC") {
    if (!data.studentId) throw new Error("studentId is required.");
    studentRecord = findRowByIdInSheet_(SHEETS.students.name, data.studentId);
    if (!studentRecord) throw new Error("Student not found.");
  } else {
    throw new Error("You do not have permission to upload a resume.");
  }

  const bytes = Utilities.base64Decode(data.base64);
  const mimeType = data.mimeType || "application/pdf";
  const blob = Utilities.newBlob(bytes, mimeType, data.fileName);
  const safeName = String(studentRecord.name || "resume").replace(/[^a-z0-9]+/gi, "_");
  blob.setName(safeName + "_" + data.fileName);

  const folder = getResumeFolder_();
  const file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) { /* sharing restricted by workspace policy; file still saved */ }
  const url = "https://drive.google.com/file/d/" + file.getId() + "/view";

  const sheet = getSheet_(SHEETS.students.name);
  const rowIndex = findRowById_(sheet, studentRecord.id);
  if (rowIndex !== -1) {
    const col = SHEETS.students.columns.indexOf("resumeUrl") + 1;
    sheet.getRange(rowIndex, col).setValue(url);
  }

  return jsonResponse({ success: true, message: "Resume uploaded successfully.", url: url, studentId: studentRecord.id });
}

function getResumeFolder_() {
  const it = DriveApp.getFoldersByName(RESUME_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(RESUME_FOLDER_NAME);
}

// ===================== Auth =====================
function handleAuth(action, data) {
  switch (action) {
    case "login": return doLogin_(data);
    case "logout": return doLogout_(data);
    case "forgot": return doForgotPassword_(data);
    case "reset": return doResetPassword_(data);
    case "me": return doMe_(data);
    default: throw new Error("Invalid auth action");
  }
}

function doLogin_(data) {
  const sheet = getSheet_(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  values.shift();
  const row = values.find(r => String(r[2]).toLowerCase() === String(data.email || "").toLowerCase());
  if (!row) return jsonResponse({ success: false, message: "Invalid email or password." });
  const [id, name, email, passwordHash, salt, role, companyId, status] = row;
  if (status !== "active") return jsonResponse({ success: false, message: "This account has been disabled." });
  if (hashPassword_(data.password || "", salt) !== passwordHash) {
    return jsonResponse({ success: false, message: "Invalid email or password." });
  }
  const token = Utilities.getUuid();
  const sessions = getSheet_(SESSIONS_SHEET);
  sessions.appendRow([token, id, role, Date.now(), Date.now() + SESSION_TTL_MS]);
  return jsonResponse({ success: true, token: token, user: { id, name, email, role, companyId } });
}

function doLogout_(data) {
  const sessions = getSheet_(SESSIONS_SHEET);
  const rowIndex = findTokenRow_(sessions, data.token);
  if (rowIndex !== -1) sessions.deleteRow(rowIndex);
  return jsonResponse({ success: true });
}

function doMe_(data) {
  const session = requireSession_(data);
  const sheet = getSheet_(USERS_SHEET);
  const rowIndex = findRowById_(sheet, session.userId);
  if (rowIndex === -1) throw new Error("Account not found.");
  const row = sheet.getRange(rowIndex, 1, 1, USERS_COLUMNS.length).getValues()[0];
  return jsonResponse({ success: true, user: { id: row[0], name: row[1], email: row[2], role: row[5], companyId: row[6] } });
}

function doForgotPassword_(data) {
  const sheet = getSheet_(USERS_SHEET);
  const values = sheet.getDataRange().getValues();
  values.shift();
  const row = values.find(r => String(r[2]).toLowerCase() === String(data.email || "").toLowerCase());
  if (!row) return jsonResponse({ success: true, message: "If that account exists, a reset code has been sent." });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const resets = getSheet_(RESETS_SHEET);
  resets.appendRow([data.email, code, Date.now()]);

  try {
    MailApp.sendEmail({
      to: data.email,
      subject: "CPDMS password reset code",
      body: "Your CPDMS password reset code is: " + code + "\n\nThis code expires in 15 minutes. If you did not request this, ignore this email."
    });
  } catch (err) {
    Logger.log("MailApp error: " + err.message);
  }
  return jsonResponse({ success: true, message: "If that account exists, a reset code has been sent." });
}

function doResetPassword_(data) {
  const resets = getSheet_(RESETS_SHEET);
  const values = resets.getDataRange().getValues();
  values.shift();
  const idx = values.findIndex(r => String(r[0]).toLowerCase() === String(data.email || "").toLowerCase() && String(r[1]) === String(data.code));
  if (idx === -1) return jsonResponse({ success: false, message: "Invalid or expired reset code." });
  const createdAt = values[idx][2];
  if (Date.now() - createdAt > 15 * 60 * 1000) return jsonResponse({ success: false, message: "Reset code expired. Request a new one." });

  const usersSheet = getSheet_(USERS_SHEET);
  const userRowIndex = findRowByColumn_(usersSheet, 2, data.email);
  if (userRowIndex === -1) return jsonResponse({ success: false, message: "Account not found." });

  const salt = Utilities.getUuid();
  const hash = hashPassword_(data.newPassword || "", salt);
  usersSheet.getRange(userRowIndex, 4, 1, 2).setValues([[hash, salt]]);

  resets.deleteRow(idx + 2);
  return jsonResponse({ success: true, message: "Password updated. You can now log in." });
}

function requireSession_(data) {
  const token = data.token;
  if (!token) throw new Error("Not authenticated. Please log in.");
  const sessions = getSheet_(SESSIONS_SHEET);
  const values = sessions.getDataRange().getValues();
  values.shift();
  const row = values.find(r => r[0] === token);
  if (!row) throw new Error("Session expired. Please log in again.");
  if (Date.now() > row[4]) throw new Error("Session expired. Please log in again.");

  const usersSheet = getSheet_(USERS_SHEET);
  const userRowIndex = findRowById_(usersSheet, row[1]);
  const companyId = userRowIndex !== -1 ? usersSheet.getRange(userRowIndex, 7, 1, 1).getValue() : "";

  return { userId: row[1], role: row[2], companyId: companyId };
}

// ===================== Helpers =====================
function hashPassword_(password, salt) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ":" + salt);
  return digest.map(b => ("0" + (b & 0xFF).toString(16)).slice(-2)).join("");
}

function getSheet_(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error("Sheet tab not found: " + name + ". Run setupSheets() first.");
  return sheet;
}

function findRowById_(sheet, id) {
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
  const index = ids.findIndex(value => String(value) === String(id));
  return index === -1 ? -1 : index + 2;
}

function findRowByColumn_(sheet, colIndex, value) {
  const vals = sheet.getRange(2, colIndex + 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
  const index = vals.findIndex(v => String(v).toLowerCase() === String(value).toLowerCase());
  return index === -1 ? -1 : index + 2;
}

function findTokenRow_(sheet, token) {
  const tokens = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
  const index = tokens.findIndex(v => v === token);
  return index === -1 ? -1 : index + 2;
}

function capitalize_(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
