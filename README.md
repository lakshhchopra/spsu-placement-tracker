# CPDMS — Campus Placement Drive Management System

An enterprise-style CRUD system built during the SPSU Udaipur Championship. Four linked
entities - Companies, Placement Drives, Students and Applications - each with their own
view, form, table and validation, plus a live dashboard summarizing the whole pipeline.

**Live demo:** coming shortly after GitHub Pages deploy

## Problem Statement

Campus Career Development Cells track companies, drives, student eligibility and selection
outcomes across spreadsheets and emails. CPDMS gives one interface to manage all four, with
referential rules enforced in the UI (you can't delete a company with drives attached, a
student can't apply twice to the same drive, deadlines and eligibility are checked before an
application is accepted).

## Features

- Dashboard - live counts, an applications-by-status breakdown, and a recent-activity table
- Companies - create, edit, delete; blocked from deleting while drives are linked
- Placement Drives - role, package, minimum CGPA and deadline, linked to a company
- Students - name, email, branch and CGPA, with per-student application counts
- Applications - links a student to a drive; enforces deadline, eligibility (CGPA) and
  duplicate-application business rules before creating a record, and a status workflow
  (Applied to Shortlisted to Selected/Rejected)
- Specific, actionable validation errors throughout (never a bare "invalid input")
- Fully responsive layout (desktop + mobile)

## Tech Stack

HTML, CSS, JavaScript. Each entity is stored as its own collection in the browser's
localStorage - mirroring four Google Sheets tabs (Companies / Drives / Students /
Applications) - so the project deploys as a static site on GitHub Pages with zero backend
setup. An equivalent multi-sheet Google Apps Script backend (one tab per entity) is
included in backend/Code.gs as a drop-in alternative: swap the localStorage reads/writes
in script.js for fetch() calls to a deployed Apps Script Web App URL to persist the same
four entities in a real spreadsheet instead.

## How to Run

Open index.html directly in a browser, or visit the deployed application link above.
No build step, no dependencies, no server required.

## Project Structure

spsu-placement-tracker/
- index.html - Sidebar + 5 views: Dashboard, Companies, Drives, Students, Applications
- style.css - Responsive styling
- script.js - Multi-entity CRUD logic, relational lookups, dashboard aggregation
- backend/Code.gs - Optional multi-sheet Google Apps Script backend
- screenshots/ - Deployment and testing evidence
- README.md

## Learning Outcomes

Relational data modelling across linked entities, CRUD operations, DOM manipulation, client-side
validation, business-rule enforcement, Git/GitHub version control, and taking a project from
local development to a live, shareable deployment.

## Related SPSU Championship Deliverables

This project is one part of a connected submission pack:

- System Design - HLD, LLD, ER diagram and UI/UX wireframes for this same Company /
  Placement Drive / Student / Application data model.
- DevOps and Deployment - this repository, its commit history and its live GitHub Pages URL.
- API Testing - a Postman collection testing the equivalent CRUD API contract.

## Author

Lakshya Chopra | SPSU Udaipur Championship
