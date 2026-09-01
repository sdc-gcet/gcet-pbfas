# GCET — Performance Based Faculty Appraisal System (PBAS)

A single-file web form for the **Software Development Cell (SDC)** to collect faculty
appraisal data for the **2025–2026** cycle (June 2025 to May 2026).

**Live form:** https://sudheer052006.github.io/gcet-pbas-faculty-appraisal/

## What it collects

| Section | Items |
|---|---|
| A · Faculty Profile | Name, department, employee ID, date of joining, experience breakup (teaching / industry / research) |
| B · Teaching Load | Three theory subjects and three laboratories per semester |
| C · Research & Publications | Journals (SCI, Scopus, Web of Science, IEEE Transactions), conferences (IEEE, Springer), patents, books, book chapters |
| D · Professional Development | FDPs attended, NPTEL courses, MOOCs / certifications, credits earned |
| E · Recognition & Roles | Awards and recognitions, departmental responsibilities |
| F · Documents | Bulk upload of all supporting certificates and proofs |
| G · Declaration | Remarks, declaration, signature blocks |

## How it works

**Counts drive entries drive documents.** Declare three SCI journals in section C and the
form generates three entry cards, each requiring one supporting document. Submission is
blocked until entries and uploads match what was declared — so the evidence always
reconciles with the numbers.

Other behaviour worth knowing:

- **Experience in GCET** is computed from the date of joining; **overall experience** is A + B + C.
- **Bulk upload** — drop every certificate into section F at once. Files whose names match an
  entry title are assigned automatically; the rest are assigned from a dropdown or in order.
- **Draft autosave** to the browser, so a half-finished form survives a closed tab.
- **Print** produces the full form on a GCET letterhead with all sections expanded.
- **Export** downloads a JSON of every field and the assigned filenames.
- Light and dark themes; works from desktop down to phone width.

## Running it

Open `index.html` in any modern browser — that is the whole application. React, ReactDOM
and Babel load from cdnjs, so the page needs an internet connection.

## Current limitation

There is no backend. "Review & submit" produces an on-screen summary for printing or
export; nothing is transmitted and attached files are not stored on a server. Wiring it to
a real endpoint (PHP, Node, Google Apps Script + Drive, or Firebase) is the next step.

Attached files also do not survive a page reload — browsers do not allow a page to
repopulate a file input. The draft remembers each filename and marks it for re-attaching.
