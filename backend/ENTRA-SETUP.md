# PBAS backend setup — Microsoft Entra ID + SharePoint

`gcet.edu.in` runs on Microsoft 365, not Google Workspace:

```
gcet.edu.in  MX →  gcet-edu-in.mail.protection.outlook.com
```

So faculty already have Microsoft accounts and no Google identity. This backend
signs them in with the account they already use for college mail, and files the
appraisal into SharePoint under the SDC's control.

```
Browser ──► Entra ID (MSAL)        sign in as name@gcet.edu.in
        ├─► SharePoint list        one row per submission — what the SDC reads
        ├─► SharePoint library     the certificates + submission.json
        └─► the user's OneDrive    their own half-finished draft, private to them
```

`backend/SETUP.md` describes an earlier Firebase + Google Apps Script design.
It does not apply — Google sign-in cannot authenticate a Microsoft account, and
no Google account should own an institutional system. Kept only for reference.

---

## What the SDC can do alone, and what needs the tenant admin

| Step | Who |
|---|---|
| 1 · SharePoint site, list, library | SDC, if you can create a site — otherwise IT |
| 2 · App registration | **Tenant admin** |
| 3 · Admin consent for `Sites.ReadWrite.All` | **Tenant admin** |
| 4 · Collect the five IDs | SDC |
| 5 · Paste them into `index.html` | SDC |

Steps 2 and 3 are the blocking ones. Send whoever runs the college's Microsoft
365 tenant the section below headed **For the tenant admin** — it is written to
be handed over as-is.

---

## 1. The SharePoint site

Create a team site named **PBAS** (`https://gcet.sharepoint.com/sites/PBAS`,
or whatever your tenant's hostname is).

### The submissions list

**New → List**, named **PBAS Submissions**. Add these columns. The internal
names must match exactly — the code writes to them by name, and SharePoint
does not tell you when a name is wrong, it just drops the value.

| Column | Type | Notes |
|---|---|---|
| `Title` | Single line of text | built in — holds the faculty member's name |
| `EmployeeID` | Single line of text | |
| `Department` | Single line of text | |
| `Designation` | Single line of text | |
| `Cycle` | Single line of text | `2025-26` |
| `GrandTotal` | Number | out of 1000 |
| `MinimumRequired` | Number | 500 / 550 / 600 / 650 by designation |
| `Eligible` | Yes/No | the mandatory-item gate and the minimum, combined |
| `SubmittedBy` | Single line of text | the signed-in `@gcet.edu.in` address |
| `SubmittedOn` | Single line of text | ISO 8601 — text, not Date, so it round-trips exactly |
| `EvidenceCount` | Number | certificates that uploaded |
| `EvidenceFolder` | Single line of text | link to `submission.json` |
| `Status` | Choice | `Submitted`, `Under review`, `Returned`, `Accepted` |

> **Create each column from the list's own "Add column", not from a site
> column.** If you rename a column later, SharePoint keeps the *original*
> internal name, and the write silently stops landing. To check a real internal
> name: open the column's settings and read `Field=` at the end of the URL.

**Then set item-level permissions** — this is what stops one faculty member
reading another's appraisal:

List **Settings → Advanced settings → Item-level Permissions**
- Read access: **Read items that were created by the user**
- Create and Edit access: **Create items and edit items that were created by the user**

### The evidence library

**New → Document library**, named **PBAS Evidence**. Nothing else to configure;
the form creates `PBAS 2025-26/<Department>/<EmployeeID - Name>/` as it goes.

### Permissions on the site

Faculty need **Contribute** on the site (the list's item-level setting above
narrows that back down for the list). SDC admins get **Full control**.

> **Known limitation.** Item-level permissions apply to lists, not to document
> libraries. A faculty member with Contribute can therefore browse other people's
> certificates in **PBAS Evidence** if they go looking in SharePoint directly —
> the form gives them no way to, but the permission is there. Closing that
> properly needs a server-side middle tier (an app-only daemon, or a Power
> Automate flow holding the write connection) so faculty need no SharePoint
> access at all. If the SDC has a Power Automate premium licence, that is the
> upgrade path; nothing in `index.html` changes except where it POSTs.

---

## For the tenant admin

### 2. App registration

Entra admin centre → **Applications → App registrations → New registration**

- **Name:** `GCET PBAS Faculty Appraisal`
- **Supported account types:** *Accounts in this organizational directory only (GCET only — single tenant)*
- **Redirect URI:** platform **Single-page application (SPA)**, value:
  ```
  https://sdc-gcet.github.io/gcet-pbfas/
  ```
  Add a second SPA redirect URI for local testing:
  ```
  http://localhost:5500/
  ```
  Add `https://pbas.gcet.edu.in/` too, once that DNS exists.

  Every URL the form is served from needs its own entry, trailing slash and all.
  If the older personal deployment at
  `https://sudheer052006.github.io/gcet-pbas-faculty-appraisal/` stays up, add it
  as well — otherwise sign-in there fails with `AADSTS50011`.

  The platform **must** be *Single-page application*, not *Web*. A Web platform
  expects a client secret; an SPA uses PKCE, which is what MSAL sends. Choosing
  Web produces `AADSTS9002326` at sign-in.

- Leave **Allow public client flows** off. No client secret is needed, and none
  should be created — the whole app is public JavaScript.

### 3. API permissions

**API permissions → Add a permission → Microsoft Graph → Delegated permissions:**

| Permission | Admin consent | Why |
|---|---|---|
| `User.Read` | no | read the signed-in user's name and address |
| `Files.ReadWrite.AppFolder` | no | the private draft, in the user's own OneDrive |
| `Sites.ReadWrite.All` | **yes** | write the submission and the certificates |

Then **Grant admin consent for GCET**. Without that last click the form signs
people in and then fails at submit with a 403 — the form says so explicitly when
it happens.

> `Sites.ReadWrite.All` is broad: it covers every SharePoint site the *signed-in
> user* can already reach, not just PBAS. It does not grant access the user does
> not otherwise have. If tenant policy rules it out, the alternative is
> `Sites.Selected` — but that is an application permission, so it needs a
> server-side component; the browser cannot use it.

Send back to the SDC:
- **Directory (tenant) ID** and **Application (client) ID** from the app's Overview page
- confirmation that admin consent is granted

---

## 4. The three SharePoint IDs

Sign in to [Graph Explorer](https://developer.microsoft.com/graph/graph-explorer)
as an account that can see the site, and run these three GETs. Substitute your
own hostname if it is not `gcet.sharepoint.com`.

**Site ID** — the response's `id` is the whole comma-joined triple; copy all of it:
```
GET https://graph.microsoft.com/v1.0/sites/gcet.sharepoint.com:/sites/PBAS
```
```jsonc
"id": "gcet.sharepoint.com,8f2c...,3ab1..."   // ← siteId, commas and all
```

**List ID:**
```
GET https://graph.microsoft.com/v1.0/sites/{siteId}/lists?$filter=displayName eq 'PBAS Submissions'
```

**Drive ID** of the library:
```
GET https://graph.microsoft.com/v1.0/sites/{siteId}/drives?$select=id,name
```
Take the `id` of the drive named `PBAS Evidence` — **not** `Documents`.

---

## 5. Paste them in

Near the top of the second `<script>` block in `index.html`:

```js
window.PBAS_CONFIG = {
  tenantId : "PASTE_TENANT_ID",
  clientId : "PASTE_CLIENT_ID",
  siteId   : "PASTE_SITE_ID",
  listId   : "PASTE_LIST_ID",
  driveId  : "PASTE_DRIVE_ID",
  allowedDomain : "gcet.edu.in",
  cycle         : "2025-26",
  evidenceRoot  : "PBAS 2025-26",
  draftFile     : "pbas-draft-2025-26.json"
};
```

None of these are secrets. A client ID and a tenant ID are public by design, and
the redirect-URI allowlist is what stops the app being driven from anywhere else.

While any value still starts with `PASTE_`, the form behaves exactly as it did
before this backend existed — local draft, print, export, no network, no sign-in
button. That is deliberate: a half-configured deployment degrades to the old
working form instead of failing at the last step.

---

## What happens on submit

1. Creates `PBAS 2025-26/<Department>/<EmployeeID - Name>/` in **PBAS Evidence**,
   one level at a time; a folder that already exists comes back 409 and is skipped.
2. Uploads each certificate into that folder, one at a time. Characters
   SharePoint rejects (`~ " # % & * : < > ? / \ { | }`) are stripped from names,
   and a file that fails does not abort the rest.
3. Writes `submission.json` — the complete form, every field, the item-wise
   scores, the grand total, the eligibility verdict, and where each certificate
   landed — beside the certificates.
4. Adds the row to **PBAS Submissions**.
5. Deletes the OneDrive draft and clears the local one.

If a certificate fails to upload, the submission is still recorded and the form
says which files did not make it. Nothing is silently dropped.

## Drafts

Autosave to the browser is unchanged. On top of it, a signed-in user's draft is
written to `pbas-draft-2025-26.json` in their **own OneDrive**, in the special
app folder — visible to them, invisible to every other user and to the SDC, and
needing no admin consent. On sign-in, if that copy is newer than the tab's local
one, the form offers it rather than overwriting anything.

Certificates are never in the draft. Browsers do not let a page repopulate a file
input, so files always need re-attaching — as was already true locally.

## Testing before the tenant admin gets back to you

```
cd backend
npm install                  # one dev dependency, @babel/parser
npm run check                # parse both <script> blocks, then exercise the module
```

`smoke-test.js` pulls the live module out of `index.html` and drives a full
submission against a fake Graph: folder creation, the 409 path, filename
sanitising, the upload sequence, the list row, progress reporting and the
missing-draft case. It needs no tenant and no network.

## When it goes wrong

| Symptom | Cause |
|---|---|
| `AADSTS9002326` | redirect URI registered as **Web** instead of **SPA** |
| `AADSTS50011` | the URL in the address bar is not in the redirect URI list — trailing slash counts |
| 403 at submit | admin consent for `Sites.ReadWrite.All` not granted, or no write access to the site |
| 404 at submit | a wrong `siteId` / `listId` / `driveId` |
| Row appears, columns blank | a column's internal name differs from its display name |
| Sign-in popup blocked | the browser suppressed it; the button must be a real click, which it is |
