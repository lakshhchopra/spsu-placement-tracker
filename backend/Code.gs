/*
  Optional Google Apps Script backend — enterprise, multi-sheet edition.

  Deploy this as a Web App and point script.js's fetch() calls at the resulting
  /exec URL instead of localStorage if you want data to persist in a real
  Google Sheet (one tab per entity) rather than the visitor's browser.

  Create ONE spreadsheet with FOUR tabs, exact names and header rows below:

  Tab "Companies"     : ID | Name | Industry | Website
  Tab "Drives"        : ID | CompanyID | Role | Package | MinCGPA | Deadline
  Tab "Students"      : ID | Name | Email | Branch | CGPA
  Tab "Applications"  : ID | StudentID | DriveID | Status | AppliedAt
*/

const SPREADSHEET_ID = "PASTE_YOUR_SPREADSHEET_ID_HERE";

const SHEETS = {
  companies: { name: "Companies", columns: ["id", "name", "industry", "website"] },
  drives: { name: "Drives", columns: ["id", "companyId", "role", "package", "minCgpa", "deadline"] },
  students: { name: "Students", columns: ["id", "name", "email", "branch", "cgpa"] },
  applications: { name: "Applications", columns: ["id", "studentId", "driveId", "status", "appliedAt"] }
};

function doGet(e) {
  const entity = e.parameter.entity || "companies";
  return handleRequest(entity, e.parameter.action || "read", {});
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
    const entity = SHEETS[entityKey];
    if (!entity) throw new Error("Unknown entity: " + entityKey);
    const sheet = getSheet(entity.name);

    switch (action) {
      case "create": {
        const id = entityKey.slice(0, 1) + "-" + new Date().getTime().toString(36);
        const row = entity.columns.map(col => col === "id" ? id : (data[col] !== undefined ? data[col] : ""));
        sheet.appendRow(row);
        return jsonResponse({ success: true, message: capitalize(entityKey) + " created successfully", id: id });
      }
      case "read": {
        const values = sheet.getDataRange().getValues();
        if (values.length <= 1) return jsonResponse({ success: true, data: [] });
        values.shift();
        const records = values.map(row => {
          const obj = {};
          entity.columns.forEach((col, i) => { obj[col] = row[i]; });
          return obj;
        });
        return jsonResponse({ success: true, data: records });
      }
      case "update": {
        const rowIndex = findRowById(sheet, data.id);
        if (rowIndex === -1) throw new Error(capitalize(entityKey) + " record not found");
        const values = entity.columns.map(col => col === "id" ? data.id : (data[col] !== undefined ? data[col] : ""));
        sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
        return jsonResponse({ success: true, message: capitalize(entityKey) + " updated successfully" });
      }
      case "delete": {
        const rowIndex = findRowById(sheet, data.id);
        if (rowIndex === -1) throw new Error(capitalize(entityKey) + " record not found");
        sheet.deleteRow(rowIndex);
        return jsonResponse({ success: true, message: capitalize(entityKey) + " deleted successfully" });
      }
      default:
        throw new Error("Invalid action");
    }
  } catch (error) {
    return jsonResponse({ success: false, message: error.message });
  }
}

function getSheet(name) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return spreadsheet.getSheetByName(name);
}

function findRowById(sheet, id) {
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
  const index = ids.findIndex(value => String(value) === String(id));
  return index === -1 ? -1 : index + 2;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1, -1);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
