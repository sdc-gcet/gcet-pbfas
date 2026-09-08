# PBAS backend setup — Google Apps Script

One Apps Script web app is the whole backend. No Firebase, no sign-in, no
paid tier.

```
Browser ──► Apps Script /exec ──┬─► Drive   certificates + submission.json
                                ├─► Sheet   one row per submission
                                └─► Drive   _drafts/<EmployeeID>.json
```

Setup is about fifteen minutes and needs nobody's permission but your own.

---

## Before you start: which Google account?

The script, the Drive folder and the spreadsheet all live in **one Google
account**, and whoever holds that account holds the data.

`sdc@gcet.edu.in` cannot be it — `gcet.edu.in` runs on Microsoft 365
(`MX → gcet-edu-in.mail.protection.outlook.com`), so it is an Outlook mailbox
and has no Google Drive behind it.

So make a **dedicated Google account** for this — something like
`sdc.gcet.pbas@gmail.com` — and keep its password with the SDC, not with one
person. Do not use a personal account: when that person leaves, the college's
appraisal records leave with them.

Add the SDC staff who need the data as **Editors** on the Drive folder
(step 1) so the evidence is reachable even if the owning account is lost.

---

## 1. The Drive folder

Drive → **New → Folder** → `GCET PBAS 2025-26`.

Open it. The URL ends in `/folders/XXXXXXXX` — that is the **folder ID**.

Share it with the SDC admins as **Editor**. Do **not** set it to
"Anyone with the link" — the certificates are personnel records.

## 2. The script

1. [script.google.com](https://script.google.com) → **New project**
2. Name it `GCET PBAS`
3. Paste `backend/Code.gs` from this repo over the default `Code.gs`
4. Set `ROOT_FOLDER_ID` at the top to the folder ID from step 1
5. **Save**

## 3. Authorise it, before deploying

In the editor, pick **`testSetup`** from the function dropdown and press **Run**.

Google will warn that the app is unverified — that is expected for a script you
just wrote. **Advanced → Go to GCET PBAS (unsafe) → Allow.** "Unsafe" here means
"not reviewed by Google", not "dangerous"; you are granting your own script
access to your own Drive.

The execution log should print the folder, the new spreadsheet and the drafts
folder. If it throws, fix that now — it is much easier to read an error here
than through the deployed endpoint.

This also creates **`PBAS Submissions 2025-26`** in the Drive folder. That
spreadsheet is where you will read every submission.

## 4. Deploy

**Deploy → New deployment → ⚙ → Web app**

| Setting | Value |
|---|---|
| Description | `PBAS 2025-26` |
| Execute as | **Me** |
| Who has access | **Anyone** |

**Deploy**, then copy the **`/exec`** URL.

> **Two things go wrong here more than anything else.**
>
> **"Who has access" must be *Anyone*, not *Anyone with a Google account*.**
> Faculty have Microsoft accounts, so "Anyone with a Google account" locks
> every one of them out. *Anyone* means the endpoint accepts an
> unauthenticated POST — see the note on that below.
>
> **Copy the `/exec` URL, not the `/dev` one.** The `/dev` URL only works while
> you are signed in as the owner, so it will appear to work for you and fail for
> everybody else. The form detects this and says so, but it costs you a round of
> confusion.

## 5. Paste it into the form

In `index.html`, near the top of the second `<script>` block:

```js
window.PBAS_CONFIG = {
  endpoint : "PASTE_APPS_SCRIPT_EXEC_URL",
  ...
};
```

Replace the placeholder with the `/exec` URL, commit and push. While it still
reads `PASTE_...`, the form behaves exactly as it did before the backend
existed — local draft, print and export, no network. A half-configured
deployment degrades to the working form instead of failing at the last step.

## 6. Check it

Open the live form, fill in a name, employee ID and department, attach one
small PDF, and submit. Then look in Drive:

```
GCET PBAS 2025-26/
├── PBAS Submissions 2025-26          ← the spreadsheet, one row added
├── _drafts/                          ← draft cleared after submit
└── Computer Science & Engineering (CSE)/
    └── GCET-CSE-117 - Test Faculty/
        ├── j_sci_1__20260908-143000__certificate.pdf
        └── submission-20260908-143000.json
```

---

## Seeing the data in one place

Open **`PBAS Submissions 2025-26`**. One row per submission:

| Column | |
|---|---|
| Submitted at, Cycle | when, and which appraisal cycle |
| Name, Employee ID, Department, Designation | who |
| Date of joining, Experience in GCET, Overall experience | service |
| Grand total, Out of, Minimum required, Eligible | the score and the verdict |
| Mandatory items met | e.g. `4 of 5` |
| Certificates | how many uploaded |
| Evidence folder | link to that person's Drive folder |
| Full submission | link to `submission.json` — every field, every item-wise score |

From there: **Data → Create a filter** to sort and filter, or
**Insert → Pivot table** for per-department totals. Anyone with Editor access on
the Drive folder can open it, so the SDC sees everything in one place without
touching the script.

`submission.json` is the complete record. The spreadsheet is an index over it —
if a column is ever wrong or missing, the JSON still has the truth.

---

## What you are accepting

**The endpoint is open.** "Who has access: Anyone" means anyone who finds the
`/exec` URL can POST to it. That URL sits in `index.html`, which is public on
GitHub Pages, so treat it as public.

In practice:

- Anyone can submit an appraisal under **any name and employee ID**. There is
  no identity check, because faculty have no Google identity to check against.
  Vet submissions against your own faculty list.
- Anyone who knows an employee ID can **load that person's draft**, since drafts
  are keyed by employee ID and there is nothing else to key them on.
- The damage ceiling is junk in your Drive folder: the script writes only inside
  `ROOT_FOLDER_ID`, caps files at 5 MB, and accepts only PDF, JPG, PNG and WebP.
  It never reads or returns anything outside that folder.

This is the trade for a backend that needs no admin, no licence and no money.
If it is not acceptable, the way to close it is a real identity provider — and
the one the college already has is Microsoft Entra, which is what
`ENTRA-SETUP.md` describes. That version signs faculty in with their actual
college accounts, at the cost of needing tenant-admin consent.

## Quotas

A consumer Google account gets, per day: 20,000 URL fetch calls, 50 MB per
blob write, and about 6 hours of total script runtime. For a few hundred faculty
submitting once a year, none of these is close. Drive storage is 15 GB shared
with Gmail — at 5 MB a certificate, watch it if every faculty member uploads
twenty.

## When it goes wrong

| Symptom | Cause |
|---|---|
| "returned a web page instead of data" | deployment is *Only myself* / *Anyone with a Google account*, or you used the `/dev` URL |
| "Could not reach the endpoint" | no network, or the deployment was deleted |
| Certificates upload, submission fails | employee ID left blank — it is what the folder is named after |
| Nothing in the spreadsheet | it was recreated; check `SHEET_ID` in Project Settings → Script Properties |
| Changes to `Code.gs` have no effect | you did not re-deploy: **Manage deployments → edit → Version: New version** |

## Checking without deploying

```
cd backend
npm install
npm run check
```

`parse-check.js` compiles both `<script>` blocks in `index.html`;
`smoke-test.js` pulls the live module out of the page and drives a full
submission against a mocked endpoint — oversize and wrong-type files, a
server-side rejection, the drafts, and the two Apps Script misconfigurations
above. No network, no Google account.
