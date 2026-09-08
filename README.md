# GCET — Performance Based Faculty Appraisal System (PBAS)

A single-file web form for the **Software Development Cell (SDC)** that collects the
**Faculty Performance Appraisal Form** for the **2025–2026** cycle (July 2025 to June 2026),
and scores it against the official rubric — 16 items, 1000 marks.

**Live form:** https://sdc-gcet.github.io/gcet-pbfas/

## Sections, in the order of the printed form

| Section | Official items | Collects |
|---|---|---|
| A · Faculty Profile | — | Name, employee ID, department, designation, date of joining, experience breakup |
| B · Classroom Teaching | **1** (150) | Theory subjects and labs per semester with hours taken and pass percentage; pedagogical initiatives; the PBL project presented outside the institution; remedial teaching for slow learners; classroom observation |
| C · Mentoring | **2** (50) | Student mentoring (Asst./Assoc. Professor) or faculty mentoring (Professor), picked from the designation |
| D · Research & Publications | **3** (100) | SCI, Scopus, Web of Science and IEEE Transactions journals; IEEE and Springer conferences; text books with publisher category; book chapters; patents |
| E · Professional Development | **4, 5, 6** (125) | MOOCs qualified through SWAYAM/NPTEL; resource person in an FDP or chairing an international conference; FDPs attended |
| F · Projects & Consultancy | **7, 8, 13** (140) | Sponsored research from UGC/DST/AICTE/industry; consultancy receipts; project executed on internal seed funding |
| G · Supervision & Events | **9, 11** (225) | Hackathons, project exhibitions, paper and poster contests with the prize flag; activities coordinated |
| H · Administration & Roles | **10** (50) | The eleven administration assignments, the nature of each job, and awards |
| I · Ratings & Feedback | **12, 14, 15, 16** (160) | Students' ratings on TLP; Group Head's rating; HoD's rating; rating by the Head of the Institution |
| J · Documents | — | Bulk upload of every supporting certificate and proof |
| K · Score Summary & Submit | Grand total | Item-wise ledger, grand total against the minimum for the designation, the mandatory-item gate, declaration and signatures |

## How the scoring works

Every objective band in the printed form is computed, and nothing else is invented:

- **1.a** — 10 marks scaled by how many theory courses reach the minimum 40 hours.
- **1.e** — the published pass-percentage bands (>95: 30 … ≥65: 05), from the average across theory courses.
- **3** — SCI ×100, Scopus/WoS/IEEE Transactions ×50, text books with an international publisher ×100, capped at 100.
- **4, 5, 6** — full marks once one qualifying entry is declared.
- **7** — 15 for one project, 25 for two.
- **8** — the consultancy bands (>50k: 10 · ≥100k: 25 · ≥150k: 40 · ≥200k: 50), from the amounts on the consultancy cards.
- **9** — per-event marks from the category picked on each card, doubled up by the prize flag, capped at 200.
- **10** — the ticked assignments summed and capped at 50.
- **11** — the coordinated activities counted and capped at 25.
- **12** — the feedback and Course End Survey bands.
- **13** — 40 once the sanctioned seed funding reaches Rs. 2,00,000.

The subjective components — 1.b, 1.c, 1.d, 1.f, item 2, and items 14, 15 and 16 — are marks
somebody awards, so they are entered directly and clamped to their maximum.

**Two places where the printed form does not close, and what this form does about it:**

- Item 15's ten components add up to 65 while the item is worth 50. The sum is capped at 50
  and the card says so.
- Item 7's printed bands stop at 25 while its column is 50. The computed band is shown, and a
  **marks awarded** field lets the HoD go up to 50; left blank, the band is used.

## Eligibility

The grand total is checked against the minimum for the designation — Assistant Professor 500,
Senior Assistant Professor 550, Associate Professor 600, Professor 650 — and against the
mandatory items for sanction of increment: **1.c**, **3** (minimum 50), **4**, **6**, and
**9** (minimum 100). Section K shows each one as met or not met with a jump link. These are
reported, not enforced: the form still submits, because the HoD and Principal fill their
ratings after the faculty member does.

## Evidence

**Counts drive entries drive documents.** Declare three SCI journals in section D and the
form generates three entry cards, each requiring one supporting document. Submission is
blocked until entries and uploads match what was declared — so the evidence always
reconciles with the numbers.

Other behaviour worth knowing:

- **Experience in GCET** is computed from the date of joining; **overall experience** is A + B + C.
- **Bulk upload** — drop every certificate into section J at once. Files whose names match an
  entry title are assigned automatically; the rest are assigned from a dropdown or in order.
- **Draft autosave** to the browser, so a half-finished form survives a closed tab.
- **Print** produces the full form on a GCET letterhead with all sections expanded, ending in
  the score ledger and the four signature blocks.
- **Export** downloads a JSON of every field, the assigned filenames, the item-wise scores, the
  grand total and the eligibility verdict.
- Light and dark themes; works from desktop down to phone width.

## Running it

Open `index.html` in any modern browser — that is the whole application. React, ReactDOM,
Babel and MSAL load from cdnjs, so the page needs an internet connection.

## The backend

`gcet.edu.in` runs on Microsoft 365, so faculty sign in with the Microsoft account they
already use for college mail, and the appraisal is filed into SharePoint:

- **Sign-in** — Entra ID, restricted to `@gcet.edu.in`. Every submission carries the
  address that signed in.
- **Submission** — a row in the **PBAS Submissions** list: name, employee ID, department,
  designation, grand total, minimum required, the eligibility verdict, and who submitted when.
- **Evidence** — the certificates go to `PBAS 2025-26/<Department>/<EmployeeID - Name>/`
  in the **PBAS Evidence** library, with `submission.json` — the complete form, every
  field and every item-wise score — filed beside them.
- **Drafts** — the browser draft is unchanged; a signed-in user's draft is also written to
  their own OneDrive, private to them, so a form started on one machine can be finished on
  another. On sign-in the form offers the saved copy if it is newer, rather than overwriting.

Setup is `backend/ENTRA-SETUP.md`. Two of its steps — the app registration and admin
consent for `Sites.ReadWrite.All` — need whoever runs the college's Microsoft 365 tenant;
that section is written to be handed over as-is.

Until the five IDs in `PBAS_CONFIG` are filled in, the form behaves exactly as it did before
the backend existed: local draft, print and export, no sign-in button, no network. A
half-configured deployment degrades to the old working form instead of failing at the last step.

`backend/SETUP.md`, `backend/Code.gs` and `backend/firestore.rules` describe an earlier
Firebase + Google Apps Script design. They do not apply — Google sign-in cannot
authenticate a Microsoft account. Kept for reference only.

### Checking it without a tenant

```
cd backend
npm install
npm run check
```

`smoke-test.js` extracts the live module from `index.html` and drives a full submission
against a fake Graph — folder creation, the already-exists path, filename sanitising,
the upload sequence, the list row, progress reporting, the missing-draft case.

## Known limitations

- **Certificates are visible across the library.** SharePoint's item-level permissions apply
  to lists, not document libraries, so a faculty member with Contribute could browse another's
  certificates by going into SharePoint directly. The form gives them no way to. Closing it
  needs a server-side middle tier — see the note in `backend/ENTRA-SETUP.md`.
- **Attached files do not survive a page reload.** Browsers do not allow a page to repopulate
  a file input. The draft remembers each filename and marks it for re-attaching.
- **Drafts from the pre-16-item version are not carried over.** The stored schema changed, so
  the storage key moved to `gcet-pbas-react-2025-26-v2`.
