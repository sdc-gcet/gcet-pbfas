# PBAS backend setup

Firebase project **`gcet-pbas`** (Spark plan) holds the data and the login.
Google Drive holds the certificates, reached through an Apps Script endpoint —
this is what lets the whole thing run without upgrading to Blaze.

```
Browser ──► Firebase Auth      sign in with @gcet.edu.in
        ├─► Cloud Firestore    the appraisal data
        └─► Apps Script ──► Drive    the certificate files
```

---

## 1. Authentication

Console → **Build → Authentication → Sign-in method**

- Enable **Google**, set a support email, Save.
- **Settings → Authorized domains** must list:
  - `sudheer052006.github.io`
  - `pbas.gcet.edu.in` (add once DNS is live)
  - `localhost` (already there — keep it, it's how we test)

## 2. Firestore

Console → **Build → Firestore Database → Create database**
→ **Production mode** → region **asia-south1 (Mumbai)**.

Then **Rules** tab → paste `firestore.rules` from this folder → **Publish**.

### Seed the admin allowlist

**Start collection** → ID `admins`. Add one document per admin, where the
**document ID is the email address**:

| Document ID | Field | Type | Value |
|---|---|---|---|
| `mvkamal.cse@gcet.edu.in` | `name` | string | M V Kamal |
| `25r15a6220@gcet.edu.in` | `name` | string | SDC Developer |

The rules only check that the document exists — the fields are for your own
reference. Anyone not listed here cannot open the dashboard.

### Seed the cycle config

**Start collection** → ID `config`, document ID `app`:

| Field | Type | Value |
|---|---|---|
| `cycle` | string | `2025-26` |
| `cycleLabel` | string | `July 2025 – June 2026` |
| `lockAt` | timestamp | the submission deadline, or leave the field out for no deadline |
| `headcount` | map | department name → total faculty, e.g. `Computer Science & Engineering (CSE): 62` |

`headcount` drives the per-faculty normalisation on the comparison charts. Without
it the dashboard still works, it just can't show averages — only totals, which
flatter large departments.

### Optional: the faculty master list

Collection `faculty`, **document ID = employee ID**:

| Field | Type |
|---|---|
| `name` | string |
| `dept` | string |
| `designation` | string |
| `email` | string |

This is what separates staff from students — both have `@gcet.edu.in` addresses,
so the domain alone proves nothing. With this list the form can prefill a
faculty member's details and the dashboard can flag submissions from accounts
that aren't on it. Skip it for now if the list isn't to hand; everything works
without it, with weaker vetting.

## 3. Drive uploads

1. Drive → **New → Folder** → `GCET PBAS 2025-26`. Open it; the URL ends in
   `/folders/XXXX` — that's the folder ID.
2. Share the folder with the SDC admins so they can open certificates from the
   dashboard. Do **not** set it to "anyone with the link".
3. [script.google.com](https://script.google.com) → **New project** →
   name it `GCET PBAS Uploads` → paste `Code.gs` over the default file →
   set `ROOT_FOLDER_ID` → Save.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorise, then copy the `/exec` URL.

Files land as `<root>/<Department>/<EmployeeID - Name>/`, so the SDC can browse
a department's evidence in Drive without going near the dashboard.

> **On "Who has access: Anyone"** — this means the endpoint accepts an
> unauthenticated POST. It writes only into your folder, caps files at 5 MB,
> and accepts only PDF/JPG/PNG/WebP, so the worst case is junk in the folder,
> not data loss. Firebase Auth still gates who can reach the form itself. If
> that isn't acceptable, the alternative is Blaze plus Firebase Storage.

## 4. Send back

- the Apps Script `/exec` URL
- confirmation that the rules are published and `admins` is seeded
- per-department headcounts (or say "later")
