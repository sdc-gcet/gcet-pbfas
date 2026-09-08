/* Smoke-test the PBAS backend module against a mocked Apps Script endpoint.
   Extracts the plain-JS <script> block straight out of index.html so the
   thing under test is the shipped code, not a copy. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => m[2].trim() && !/text\/babel/.test(m[1]));
if (blocks.length !== 1) { console.error('expected 1 plain JS block, got', blocks.length); process.exit(1); }
const code = blocks[0][2];

let fail = 0;
const t = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   <- ' + extra));
  if (!cond) fail++;
};

/* Stand-ins for the browser bits the module uses. */
class FakeFile {
  constructor(name, type, size) {
    this.name = name; this.type = type; this.size = size;
    this._b64 = Buffer.from('x'.repeat(Math.min(size, 32))).toString('base64');
  }
}
class FileReader {
  readAsDataURL(f) {
    setImmediate(() => { this.result = 'data:' + f.type + ';base64,' + f._b64; this.onload(); });
  }
}

function makeCtx(fetchMock, endpoint) {
  const win = {};
  const ctx = { window: win, fetch: fetchMock, console, FileReader, Promise, JSON, Error,
                TypeError, String, Number, Date, setTimeout, Buffer };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  let src = code;
  if (endpoint) {
    src = src.replace('(function(){\n  "use strict";',
      `window.PBAS_CONFIG.endpoint=${JSON.stringify(endpoint)};\n(function(){\n  "use strict";`);
    if (src === code) { console.error('could not inject endpoint'); process.exit(1); }
  }
  vm.runInContext(src, ctx);
  return win;
}

/* ---------- 1. as shipped: unconfigured ---------- */
(function () {
  const win = makeCtx(() => { throw new Error('no network expected'); });
  const P = win.PBAS;
  t('ships unconfigured', P.configured === false, 'configured=' + P.configured);
  t('cycle is 2025-26', P.cycle === '2025-26', P.cycle);
  P.submit({ profile: { empid: 'X' } }, [], () => {})
    .then(() => t('unconfigured submit rejects', false, 'it resolved'))
    .catch(e => t('unconfigured submit rejects with a clear message',
                  /not configured yet/.test(e.message), e.message));
})();

/* ---------- 2. configured, against a fake endpoint ---------- */
setTimeout(() => {
  const calls = [];
  const EP = 'https://script.google.com/macros/s/FAKE/exec';

  const fetchMock = (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, action: body.action, body, ctype: opts.headers['Content-Type'] });
    const reply = obj => Promise.resolve({ text: () => Promise.resolve(JSON.stringify(obj)) });

    if (body.action === 'upload') {
      if (body.fileName === 'server-reject.pdf') return reply({ ok: false, error: 'Quota exceeded.' });
      return reply({ ok: true, name: body.fileName, size: 1234,
                     viewUrl: 'https://drive.google.com/file/d/ID/view' });
    }
    if (body.action === 'submit')
      return reply({ ok: true, reference: '20260908-120000-GCET-CSE-117',
                     folderUrl: 'https://drive.google.com/drive/folders/FOLDER',
                     jsonUrl: 'https://drive.google.com/file/d/JSON/view' });
    if (body.action === 'draftSave') return reply({ ok: true, savedAt: '2026-09-08T12:00:00.000Z' });
    if (body.action === 'draftLoad')
      return reply({ ok: true, draft: body.empid === 'KNOWN'
        ? { savedAt: '2026-09-08T11:00:00.000Z', data: { profile: { empid: 'KNOWN' } } } : null });
    if (body.action === 'draftDrop') return reply({ ok: true, dropped: body.empid });
    return reply({ ok: false, error: 'unexpected action ' + body.action });
  };

  const P = makeCtx(fetchMock, EP).PBAS;
  t('detects a configured endpoint', P.configured === true, 'configured=' + P.configured);

  const payload = {
    profile: { name: 'Ravi Kumar', empid: 'GCET/CSE/117', dept: 'CSE – Data Science' },
    scores: { grandTotal: 712, minimumRequired: 600, eligibleForIncrement: true }
  };
  const files = [
    { name: 'sci.pdf',           slot: 'j_sci_1', file: new FakeFile('sci.pdf', 'application/pdf', 2048) },
    { name: 'huge.pdf',          slot: 'j_sci_2', file: new FakeFile('huge.pdf', 'application/pdf', 9 * 1048576) },
    { name: 'notes.txt',         slot: 'j_sci_3', file: new FakeFile('notes.txt', 'text/plain', 100) },
    { name: 'server-reject.pdf', slot: 'j_sci_4', file: new FakeFile('server-reject.pdf', 'application/pdf', 512) }
  ];
  const steps = [];

  P.submit(payload, files, (d, tot, label) => steps.push(`${d}/${tot} ${label}`)).then(res => {
    const uploads = calls.filter(c => c.action === 'upload');
    const submits = calls.filter(c => c.action === 'submit');

    t('posts as text/plain so no CORS preflight is triggered',
      calls.every(c => /text\/plain/.test(c.ctype)), calls.map(c => c.ctype).join(','));
    t('posts to the configured endpoint', calls.every(c => c.url === EP), calls[0] && calls[0].url);
    t('only files passing client-side validation reach the network',
      uploads.length === 2 &&
      uploads.map(u => u.body.fileName).join(',') === 'sci.pdf,server-reject.pdf',
      uploads.map(u => u.body.fileName).join(', '));
    t('oversize file rejected before upload',
      res.failed.some(f => f.name === 'huge.pdf' && /Larger than 5 MB/.test(f.reason)), JSON.stringify(res.failed));
    t('wrong type rejected before upload',
      res.failed.some(f => f.name === 'notes.txt' && /not accepted/.test(f.reason)), JSON.stringify(res.failed));
    t('a server-side rejection is captured, not thrown',
      res.failed.some(f => f.name === 'server-reject.pdf' && /Quota exceeded/.test(f.reason)), JSON.stringify(res.failed));
    t('one bad file does not abort the submission', submits.length === 1, submits.length + ' submits');
    t('base64 is sent without the data: prefix',
      uploads[0] && !/^data:/.test(uploads[0].body.data), uploads[0] && uploads[0].body.data.slice(0, 20));
    t('the submission carries what uploaded and what did not',
      submits[0].body.evidence.length === 1 && submits[0].body.evidenceFailed.length === 3,
      JSON.stringify({ up: submits[0].body.evidence.length, bad: submits[0].body.evidenceFailed.length }));
    t('returns the reference', res.reference === '20260908-120000-GCET-CSE-117', res.reference);
    t('reports the uploaded count', res.uploaded === 1, String(res.uploaded));
    t('progress ticks once per file plus two, after an opening tick',
      steps.length === files.length + 2 + 1 && steps[0].startsWith('0/'), steps.join(' / '));

    return P.submit({ profile: {} }, [], () => {})
      .then(() => t('submit without an employee ID is refused', false, 'it resolved'))
      .catch(e => t('submit without an employee ID is refused', /employee ID/.test(e.message), e.message));
  }).then(() =>
    P.loadDraft('UNKNOWN').then(d => t('a missing draft returns null, not an error', d === null, JSON.stringify(d)))
  ).then(() =>
    P.loadDraft('KNOWN').then(d => t('an existing draft comes back',
      !!d && d.data.profile.empid === 'KNOWN', JSON.stringify(d)))
  ).then(() =>
    P.loadDraft('').then(d => t('no employee ID means no draft lookup', d === null, JSON.stringify(d)))
  ).then(() => {
    /* Apps Script serves an HTML sign-in page when deployment access is wrong. */
    const w = makeCtx(() => Promise.resolve({
      text: () => Promise.resolve('<html><body>Sign in</body></html>') }), EP);
    return w.PBAS.ping()
      .then(() => t('an HTML error page is explained', false, 'it resolved'))
      .catch(e => t('an HTML error page is explained, not dumped raw',
                    /deployment is probably set/.test(e.message), e.message));
  }).then(() => {
    const w = makeCtx(() => Promise.reject(new TypeError('Failed to fetch')), EP);
    return w.PBAS.ping()
      .then(() => t('an unreachable endpoint is explained', false, 'it resolved'))
      .catch(e => t('an unreachable endpoint is explained',
                    /Could not reach the endpoint/.test(e.message), e.message));
  }).then(() => {
    console.log(fail ? `\n${fail} check(s) failed.` : `\nAll checks passed.`);
    process.exit(fail ? 1 : 0);
  }).catch(e => {
    console.error('\nUNCAUGHT:', e && e.message);
    process.exit(1);
  });
}, 50);
