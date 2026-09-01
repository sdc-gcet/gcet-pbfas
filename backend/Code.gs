/**
 * GCET PBAS — Drive upload endpoint
 * ---------------------------------------------------------------------------
 * Receives a certificate from the appraisal form and files it in Drive under
 *   <ROOT_FOLDER>/<Department>/<EmployeeID - Name>/
 * and returns a link the form stores in Firestore.
 *
 * DEPLOY (one time)
 *   1. drive.google.com → New → Folder → "GCET PBAS 2025-26"
 *      Open it. The URL ends in /folders/XXXXXXXX — that is ROOT_FOLDER_ID.
 *   2. script.google.com → New project → name it "GCET PBAS Uploads"
 *      Paste this file over Code.gs. Set ROOT_FOLDER_ID below. Save.
 *   3. Deploy → New deployment → type "Web app"
 *        Execute as:  Me
 *        Who has access:  Anyone
 *      Deploy → authorise → copy the /exec URL and send it to me.
 *
 * Re-deploy after any edit: Deploy → Manage deployments → edit → New version.
 * The URL stays the same as long as you edit the existing deployment.
 */

var ROOT_FOLDER_ID = 'PASTE_YOUR_FOLDER_ID_HERE';
var MAX_BYTES      = 5 * 1024 * 1024;
var ALLOWED_TYPES  = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

function doGet() {
  return json({ ok: true, service: 'gcet-pbas-uploads', version: 1 });
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

    if (req.action === 'ping') return json({ ok: true, pong: true });
    if (req.action === 'delete') return removeFile(req);

    return storeFile(req);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

function storeFile(req) {
  var missing = ['fileName', 'mimeType', 'data', 'empid'].filter(function (k) {
    return !req[k];
  });
  if (missing.length) {
    return json({ ok: false, error: 'Missing: ' + missing.join(', ') });
  }

  if (ALLOWED_TYPES.indexOf(req.mimeType) === -1) {
    return json({ ok: false, error: 'Only PDF, JPG, PNG and WebP are accepted.' });
  }

  var bytes = Utilities.base64Decode(req.data);
  if (bytes.length > MAX_BYTES) {
    return json({ ok: false, error: 'File is larger than 5 MB.' });
  }

  var folder = folderFor(req.dept, req.empid, req.name);
  var safe   = sanitise(req.fileName);
  var stamp  = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd-HHmmss');
  var label  = req.slot ? sanitise(req.slot) + '__' : '';

  var blob = Utilities.newBlob(bytes, req.mimeType, label + stamp + '__' + safe);
  var file = folder.createFile(blob);
  file.setDescription(
    'PBAS 2025-26\nFaculty: ' + (req.name || '') +
    '\nEmployee ID: ' + req.empid +
    '\nDepartment: ' + (req.dept || '') +
    '\nEntry: ' + (req.slotTitle || req.slot || '')
  );

  return json({
    ok: true,
    fileId: file.getId(),
    name: file.getName(),
    size: bytes.length,
    /* Viewable by anyone the Drive folder is shared with — the SDC. Nothing is
       made public; access follows the folder's own sharing settings. */
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
