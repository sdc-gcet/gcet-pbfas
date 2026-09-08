/**
 * GCET PBAS — appraisal endpoint
 * ---------------------------------------------------------------------------
 * One Apps Script web app behind the whole form:
 *
 *   certificates  →  Drive, under <ROOT>/<Department>/<EmployeeID - Name>/
 *   the form      →  submission-<stamp>.json in that same folder
 *   the index     →  a row in the "PBAS Submissions" spreadsheet
 *   drafts        →  <ROOT>/_drafts/<EmployeeID>.json
 *
 * Setup is backend/GOOGLE-SETUP.md. The short version:
 *   1. Drive → New → Folder → "GCET PBAS 2025-26". Open it; the URL ends in
 *      /folders/XXXX — that is ROOT_FOLDER_ID, set it below.
 *   2. script.google.com → New project → paste this over Code.gs → Save.
 *   3. Run testSetup() once from the editor, authorise when asked.
 *   4. Deploy → New deployment → Web app
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      Copy the /exec URL into PBAS_CONFIG.endpoint in index.html.
 *
 * The spreadsheet is created on first use and remembered, so ROOT_FOLDER_ID is
 * the only thing anyone has to set.
 *
 * Re-deploy after any edit: Deploy → Manage deployments → edit (pencil) →
 * Version: New version → Deploy. The URL only survives if you edit the existing
 * deployment instead of creating a second one.
 */

var ROOT_FOLDER_ID = 'PASTE_YOUR_FOLDER_ID_HERE';
var SHEET_NAME     = 'PBAS Submissions 2025-26';
var CYCLE          = '2025-26';
var MAX_BYTES      = 5 * 1024 * 1024;
var ALLOWED_TYPES  = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
var TZ             = 'Asia/Kolkata';

var HEADERS = [
  'Submitted at', 'Cycle', 'Name', 'Employee ID', 'Department', 'Designation',
  'Date of joining', 'Experience in GCET', 'Overall experience',
  'Grand total', 'Out of', 'Minimum required', 'Eligible',
  'Mandatory items met', 'Certificates', 'Evidence folder', 'Full submission'
];

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

function doGet() {
  return json({ ok: true, service: 'gcet-pbas', cycle: CYCLE, version: 2 });
}

/**
 * The form posts JSON as text/plain on purpose. Apps Script web apps cannot
 * answer a CORS preflight, and text/plain keeps the request "simple" so the
 * browser never sends one.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Empty request.' });
    }
    var req = JSON.parse(e.postData.contents);

    switch (req.action) {
      case 'ping':      return json({ ok: true, pong: true, cycle: CYCLE });
      case 'upload':    return storeFile(req);
      case 'delete':    return removeFile(req);
      case 'submit':    return storeSubmission(req);
      case 'draftSave': return draftSave(req);
      case 'draftLoad': return draftLoad(req);
      case 'draftDrop': return draftDrop(req);
      default:          return storeFile(req);   /* v1 clients posted a bare file */
    }
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ------------------------------------------------------------------ */
/* Certificates                                                        */
/* ------------------------------------------------------------------ */

function storeFile(req) {
  var missing = ['fileName', 'mimeType', 'data', 'empid'].filter(function (k) {
    return !req[k];
  });
  if (missing.length) return json({ ok: false, error: 'Missing: ' + missing.join(', ') });

  if (ALLOWED_TYPES.indexOf(req.mimeType) === -1) {
    return json({ ok: false, error: 'Only PDF, JPG, PNG and WebP are accepted.' });
  }

  var bytes = Utilities.base64Decode(req.data);
  if (bytes.length > MAX_BYTES) return json({ ok: false, error: 'File is larger than 5 MB.' });

  var folder = folderFor(req.dept, req.empid, req.name);
  var safe   = sanitise(req.fileName);
  var stamp  = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  var label  = req.slot ? sanitise(req.slot) + '__' : '';

  var blob = Utilities.newBlob(bytes, req.mimeType, label + stamp + '__' + safe);
  var file = folder.createFile(blob);
  file.setDescription(
    'PBAS ' + CYCLE + '\nFaculty: ' + (req.name || '') +
    '\nEmployee ID: ' + req.empid +
    '\nDepartment: ' + (req.dept || '') +
    '\nEntry: ' + (req.slotTitle || req.slot || '')
  );

  return json({
    ok: true,
    fileId: file.getId(),
    name: file.getName(),
    size: bytes.length,
    /* Access follows the folder's own sharing. Nothing is made public. */
    viewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    uploadedAt: new Date().toISOString()
  });
}

/* Replacing an attachment removes the old file so the folder does not fill
   with abandoned versions. Trashed, not purged, so mistakes are recoverable. */
function removeFile(req) {
  if (!req.fileId) return json({ ok: false, error: 'No fileId given.' });
  try {
    DriveApp.getFileById(req.fileId).setTrashed(true);
    return json({ ok: true, trashed: req.fileId });
  } catch (err) {
    return json({ ok: true, trashed: null, note: 'Already gone.' });
  }
}

/* ------------------------------------------------------------------ */
/* The submission                                                      */
/* ------------------------------------------------------------------ */

function storeSubmission(req) {
  var payload = req.payload || {};
  var p = payload.profile || {};
  if (!p.empid) return json({ ok: false, error: 'The employee ID is missing.' });

  var folder = folderFor(p.dept, p.empid, p.name);
  var stamp  = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');

  payload.submittedAt    = new Date().toISOString();
  payload.cycle          = CYCLE;
  payload.evidence       = req.evidence || [];
  payload.evidenceFailed = req.evidenceFailed || [];

  var jsonFile = folder.createFile(
    Utilities.newBlob(JSON.stringify(payload, null, 2), 'application/json',
                      'submission-' + stamp + '.json')
  );

  var sc = payload.scores || {};
  var gates = sc.mandatory || [];
  var met = gates.filter(function (g) { return g.met; }).length;

  appendRow([
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'),
    CYCLE,
    p.name || '',
    p.empid || '',
    p.dept || '',
    p.designation || '',
    p.doj || '',
    p.experienceInGcet || '',
    p.overallExperience || '',
    Number(sc.grandTotal || 0),
    Number(sc.outOf || 1000),
    Number(sc.minimumRequired || 0),
    sc.eligibleForIncrement ? 'Yes' : 'No',
    met + ' of ' + gates.length,
    (req.evidence || []).length,
    folder.getUrl(),
    'https://drive.google.com/file/d/' + jsonFile.getId() + '/view'
  ]);

  draftDrop({ empid: p.empid });

  return json({
    ok: true,
    reference: stamp + '-' + sanitise(p.empid),
    folderUrl: folder.getUrl(),
    jsonUrl: 'https://drive.google.com/file/d/' + jsonFile.getId() + '/view',
    uploaded: (req.evidence || []).length,
    submittedAt: payload.submittedAt
  });
}

/* ------------------------------------------------------------------ */
/* Drafts                                                              */
/* ------------------------------------------------------------------ */
/* Keyed by employee ID. The form has no sign-in, so anyone who knows an
   employee ID can load that person's draft — the same exposure as being able
   to submit under it. Called out in GOOGLE-SETUP.md. */

function draftFolder() {
  return childNamed(DriveApp.getFolderById(ROOT_FOLDER_ID), '_drafts');
}

function draftName(empid) {
  return sanitise(empid) + '.json';
}

function draftSave(req) {
  if (!req.empid) return json({ ok: false, error: 'The employee ID is missing.' });
  var folder = draftFolder();
  var name   = draftName(req.empid);
  var at     = new Date().toISOString();
  var body   = JSON.stringify({ savedAt: at, cycle: CYCLE, data: req.data });

  var it = folder.getFilesByName(name);
  if (it.hasNext()) {
    it.next().setContent(body);
    return json({ ok: true, savedAt: at, updated: true });
  }
  folder.createFile(Utilities.newBlob(body, 'application/json', name));
  return json({ ok: true, savedAt: at, updated: false });
}

function draftLoad(req) {
  if (!req.empid) return json({ ok: false, error: 'The employee ID is missing.' });
  var it = draftFolder().getFilesByName(draftName(req.empid));
  if (!it.hasNext()) return json({ ok: true, draft: null });
  return json({ ok: true, draft: JSON.parse(it.next().getBlob().getDataAsString()) });
}

function draftDrop(req) {
  if (!req || !req.empid) return json({ ok: true, dropped: null });
  var it = draftFolder().getFilesByName(draftName(req.empid));
  while (it.hasNext()) it.next().setTrashed(true);
  return json({ ok: true, dropped: req.empid });
}

/* ------------------------------------------------------------------ */
/* Spreadsheet                                                         */
/* ------------------------------------------------------------------ */

/* Created on first use and remembered, so ROOT_FOLDER_ID stays the only
   thing anyone has to set. */
function sheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');

  if (id) {
    try { return SpreadsheetApp.openById(id).getSheets()[0]; }
    catch (e) { /* deleted or unreachable — make another below */ }
  }

  var ss = SpreadsheetApp.create(SHEET_NAME);
  var sh = ss.getSheets()[0];
  sh.appendRow(HEADERS);
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);

  /* Move it beside the evidence so the SDC finds everything in one place. */
  var file = DriveApp.getFileById(ss.getId());
  DriveApp.getFolderById(ROOT_FOLDER_ID).addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  props.setProperty('SHEET_ID', ss.getId());
  return sh;
}

/* Two people submitting in the same second must not land on one row. */
function appendRow(values) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet().appendRow(values);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/* Run once from the editor before deploying: creates the sheet, proves Drive
   access, and triggers the authorisation prompt while you can still see it. */
function testSetup() {
  if (ROOT_FOLDER_ID === 'PASTE_YOUR_FOLDER_ID_HERE') {
    throw new Error('Set ROOT_FOLDER_ID first.');
  }
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var sh = sheet();
  Logger.log('Root folder : ' + root.getName() + '  ' + root.getUrl());
  Logger.log('Spreadsheet : ' + sh.getParent().getUrl());
  Logger.log('Drafts      : ' + draftFolder().getUrl());
  Logger.log('Ready.');
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function folderFor(dept, empid, name) {
  var root = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var deptFolder = childNamed(root, sanitise(dept || 'Unspecified department'));
  var who = sanitise(empid) + (name ? ' - ' + sanitise(name) : '');
  return childNamed(deptFolder, who);
}

function childNamed(parent, folderName) {
  var it = parent.getFoldersByName(folderName);
  return it.hasNext() ? it.next() : parent.createFolder(folderName);
}

function sanitise(s) {
  return String(s || '')
    .replace(/[\\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
