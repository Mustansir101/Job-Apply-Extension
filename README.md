# Job Application Autofill

A Manifest V3 Chrome extension that fills job application forms with your saved profile. Your data stays in your browser — nothing is sent to any server. **The extension never submits a form.**

## Features

- Fills text inputs, dropdowns, radio buttons, and checkboxes
- Automatically checks a checkbox that clearly consents to recording your email address with the response
- Works on Google Forms and most standard job application pages
- Tries embedded iframes automatically when the top-level page has no fields
- Shows a result summary of every filled and skipped field, with reasons
- Overwrite toggle to re-fill fields that already have a value
- All profile data stored locally via `chrome.storage.local`

## Profile fields

| Field | Description |
|---|---|
| Full name | Your first and last name |
| Email address | Contact email |
| Phone number | With country code if needed |
| City / location | Current city |
| College / university | Institution name |
| Degree | e.g. B.Tech, B.E., B.Sc |
| Branch / specialization | e.g. Computer Science |
| Graduation year | Four-digit year, e.g. 2027 |
| CGPA | Numeric, 0–10 |
| LinkedIn URL | Full profile URL |
| GitHub URL | Full profile URL |
| Portfolio URL | Personal site or project page |

## Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the project folder.
5. The extension icon appears in the toolbar.

## Usage

1. Click the extension icon to open the popup.
2. Enter your details and click **Save Profile**.
3. Open any job application form in Chrome.
4. Click the extension icon and then **Fill Current Form**.
5. Review the result panel — check every filled answer before submitting the form yourself.

If a checkbox clearly says your email address will be recorded or included with your response, it is checked automatically. Other consent, policy, and marketing checkboxes are left alone.

## Development

### Project layout

```
manifest.json          Extension manifest (Manifest V3)
popup.html             Popup UI
popup.css              Popup styles
popup.js               Popup logic — save, fill, result rendering
lib/matcher.js         Field-label matching engine (dependency-free)
content/filler.js      Page-side script injected on demand
icons/                 Extension icons (16, 48, 128 px)
test/
  form.html            Local test form
  popup-harness.html   Popup UI harness for manual testing
  matcher.test.js      Unit tests for the matcher module
  validate.js          Project integrity checks
  serve.js             Tiny local HTTP server for test pages
```

### Running tests

Requires Node.js (any modern LTS version).

```bash
# Run matcher unit tests
node test/matcher.test.js

# Run full project validation (manifest, syntax, safety, matcher tests)
node test/validate.js

# Serve test pages locally (default port 3000)
node test/serve.js
```

### Safety constraints (enforced by validate.js)

- `content/filler.js` must never call `form.submit()`, `.requestSubmit()`, or click Submit/Apply/Next buttons.
- The manifest must not include `host_permissions`, `content_scripts`, or a background service worker.
- No `unsafe-eval` or `unsafe-inline` in the Content Security Policy.

## Privacy

All profile data is stored exclusively in `chrome.storage.local` on your own machine. No data is transmitted anywhere. The extension requests only the `storage`, `activeTab`, and `scripting` permissions.
