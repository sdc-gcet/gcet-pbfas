/* Smoke-test the PBAS backend module against a mocked Microsoft Graph.
   Extracts the plain-JS <script> block straight out of index.html so the
   thing under test is the shipped code, not a copy. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => m[2].trim() && !/text\/babel/.test(m[1]));
if (blocks.length !== 1) { console.error('expected 1 plain JS block, got', blocks.length); process.exit(1); }
let code = blocks[0][2];

let fail = 0;
const t = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '   <- ' + extra));
  if (!cond) fail++;
};

/* ---------- pass 1: unconfigured (as shipped) ---------- */
{
  const win = {};
  const ctx = { window: win, msal: undefined, fetch: () => { throw new Error('no network expected'); }, console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const P = win.PBAS;
  t('ships unconfigured', P.configured === false, 'configured=' + P.configured);
  t('names all 5 missing keys', P.missing.length === 5, JSON.stringify(P.missing));
  t('allowedDomain is gcet.edu.in', P.allowedDomain === 'gcet.edu.in', P.allowedDomain);
  return_check(P);
  function return_check(P) {
    let msg = '';
    P.init().catch(e => { msg = e.message; });
    setImmediate(() => {
      t('init rejects with a useful message', /not configured yet/.test(msg), msg);
    });
  }
}

/* ---------- pass 2: configured, with a fake tenant and fake Graph ---------- */
setTimeout(() => {
  const calls = [];
  const win = {
    location: { origin: 'https://sudheer052006.github.io', pathname: '/gcet-pbas-faculty-appraisal/' }
  };

  /* minimal MSAL stand-in */
  class InteractionRequiredAuthError extends Error {}
  const account = { username: 'ravi.cse@gcet.edu.in', name: 'Ravi Kumar' };
  const msal = {
    InteractionRequiredAuthError,
    PublicClientApplication: class {
      constructor(cfg) { this.cfg = cfg; }
      initialize() { return Promise.resolve(); }
      handleRedirectPromise() { return Promise.resolve(null); }
      getAllAccounts() { return []; }
      setActiveAccount() {}
      loginPopup() { return Promise.resolve({ account: this._next || account }); }
      logoutPopup() { return Promise.resolve(); }
      acquireTokenSilent() { return Promise.resolve({ accessToken: 'FAKE_TOKEN' }); }
    }
  };

  /* fake Graph: records every call, 409s a folder that already exists */
  const existing = new Set(['PBAS 2025-26']);
  const fetchMock = (url, opts) => {
    calls.push({ method: opts.method || 'GET', url, auth: opts.headers.Authorization });
    const reply = (status, body) => Promise.resolve({
      ok: status < 400, status, statusText: 'x',
      text: () => Promise.resolve(JSON.stringify(body))
    });
    if (/\/children$/.test(url) && opts.method === 'POST') {
      const name = JSON.parse(opts.body).name;
      if (existing.has(name)) return reply(409, { error: { message: 'nameAlreadyExists' } });
      existing.add(name);
      return reply(201, { id: 'f_' + name });
    }
    if (/:\/content/.test(url) && opts.method === 'PUT')
      return reply(201, { id: 'file1', webUrl: 'https://sp/' + encodeURIComponent(url.slice(-40)) });
    if (/\/items$/.test(url) && opts.method === 'POST')
      return reply(201, { id: '42' });
    if (/approot/.test(url) && opts.method === 'GET')
      return reply(404, { error: { message: 'itemNotFound' } });
    return reply(500, { error: { message: 'unexpected call ' + url } });
  };

  const cfgOverride = `window.PBAS_CONFIG.tenantId="T";window.PBAS_CONFIG.clientId="C";window.PBAS_CONFIG.siteId="S";window.PBAS_CONFIG.listId="L";window.PBAS_CONFIG.driveId="D";`;
  /* set the config BEFORE the IIFE reads it: inject right after the config literal */
  const patched = code.replace('(function(){\n  "use strict";', cfgOverride + '\n(function(){\n  "use strict";');
  if (patched === code) { console.error('could not inject config override'); process.exit(1); }

  const ctx = { window: win, msal, fetch: fetchMock, console, Blob: class Blob {
    constructor(parts, o) { this.parts = parts; this.type = (o||{}).type; this.size = String(parts[0]).length; }
  }, Error, Promise, JSON, String, Number, Date, encodeURIComponent };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(patched, ctx);
  const P = win.PBAS;

  t('detects a complete config', P.configured === true, 'configured=' + P.configured);

  P.signIn().then(acc => {
    t('signs in a @gcet.edu.in account', P.email() === 'ravi.cse@gcet.edu.in', P.email());

    const payload = {
      profile: { name: 'Ravi Kumar', empid: 'GCET/CSE/117', dept: 'CSE \u2013 Data Science', designation: 'Associate Professor' },
      scores: { grandTotal: 712, minimumRequired: 600, eligibleForIncrement: true }
    };
    const files = [
      { name: 'SCI journal.pdf', slot: 'j_sci_1', file: new ctx.Blob(['x'], { type: 'application/pdf' }) },
      { name: 'bad:name*.png',   slot: 'j_sci_2', file: new ctx.Blob(['y'], { type: 'image/png' }) }
    ];
    const steps = [];
    return P.submit(payload, files, (d, tot, label) => steps.push(`${d}/${tot} ${label}`))
      .then(res => {
        const folderCalls = calls.filter(c => /\/children$/.test(c.url));
        const puts = calls.filter(c => c.method === 'PUT');
        const listPost = calls.find(c => /\/lists\/L\/items$/.test(c.url));

        t('sends a bearer token', calls.every(c => c.auth === 'Bearer FAKE_TOKEN'), 'missing auth header');
        t('creates the 3 folder levels', folderCalls.length === 3, folderCalls.length + ' calls');
        t('tolerates a 409 on an existing folder', res.uploaded === 3 - 1, 'uploaded=' + res.uploaded);
        t('uploads 2 certificates + submission.json', puts.length === 3, puts.length + ' PUTs');
        t('strips illegal SharePoint characters',
          puts.some(c => /bad%20name%20.png/.test(c.url)),
          puts.map(c => decodeURIComponent(c.url.split('root:/')[1] || '')).join(' | '));
        t('slash in department did not create a folder level',
          !calls.some(c => /Data%20Science\/[^:]*\/children/.test(c.url)), 'dept split into paths');
        t('writes the list row', !!listPost, 'no list POST');
        t('progress reported for every step, plus an opening tick',
          steps.length === files.length + 3 + 1 && steps[0].startsWith('0/'), steps.join(' / '));
        t('returns a reference id', res.itemId === '42', res.itemId);
        t('folder path is Root/Dept/EmpID - Name',
          res.folderPath === 'PBAS 2025-26/CSE \u2013 Data Science/GCET CSE 117 - Ravi Kumar',
          res.folderPath);
      });
  }).then(() => {
    return P.loadDraft().then(d => t('a missing OneDrive draft returns null, not an error', d === null, JSON.stringify(d)));
  }).then(() => {
    console.log(fail ? `\n${fail} check(s) failed.` : `\nAll checks passed.`);
    process.exit(fail ? 1 : 0);
  }).catch(e => {
    console.error('\nUNCAUGHT:', e.message);
    process.exit(1);
  });
}, 50);
