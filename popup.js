'use strict';

const PROFILE_KEYS = [
  'fullName',
  'email',
  'phone',
  'city',
  'college',
  'degree',
  'branch',
  'graduationYear',
  'cgpa',
  'linkedin',
  'github',
  'portfolio'
];

const form = document.getElementById('profile-form');
const saveButton = document.getElementById('save');
const fillButton = document.getElementById('fill');
const overwriteInput = document.getElementById('overwrite');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const resultPlatform = document.getElementById('result-platform');
const resultSummary = document.getElementById('result-summary');
const filledWrap = document.getElementById('filled-wrap');
const filledList = document.getElementById('filled-list');
const skippedDetails = document.getElementById('skipped-details');
const skippedSummary = document.getElementById('skipped-summary');
const skippedList = document.getElementById('skipped-list');
const resultNote = document.getElementById('result-note');

const inputs = {};
PROFILE_KEYS.forEach(function (key) {
  inputs[key] = document.getElementById(key);
});

let savedProfile = emptyProfile();
let customFields = [];   // [{ label: string, value: string }]
let dirty = false;
let busy = false;

function emptyProfile() {
  const profile = {};
  PROFILE_KEYS.forEach(function (key) { profile[key] = ''; });
  return profile;
}

function normalizeProfile(raw) {
  const profile = emptyProfile();
  if (!raw || typeof raw !== 'object') return profile;
  PROFILE_KEYS.forEach(function (key) {
    profile[key] = typeof raw[key] === 'string' ? raw[key].trim() : '';
  });
  return profile;
}

function readForm() {
  const profile = emptyProfile();
  PROFILE_KEYS.forEach(function (key) {
    profile[key] = String(inputs[key].value || '').trim();
  });
  return profile;
}

function writeForm(profile) {
  PROFILE_KEYS.forEach(function (key) {
    inputs[key].value = profile[key] || '';
  });
}

function hasAnyValue(profile) {
  return PROFILE_KEYS.some(function (key) {
    return !!String(profile[key] || '').trim();
  });
}

function isLikelyUrl(value) {
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(:\d+)?([/?#][^\s]*)?$/i.test(value);
}

function validateProfile(profile) {
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
    return { key: 'email', message: 'Enter a valid email address.' };
  }

  if (profile.phone && !/^[+()\-.\s\d]{6,25}$/.test(profile.phone)) {
    return { key: 'phone', message: 'Use only digits, spaces, +, -, and parentheses for the phone number.' };
  }

  if (profile.graduationYear && !/^(19|20)\d{2}$/.test(profile.graduationYear)) {
    return { key: 'graduationYear', message: 'Graduation year must be a four-digit year, such as 2027.' };
  }

  if (profile.cgpa) {
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(profile.cgpa) || Number(profile.cgpa) > 10) {
      return { key: 'cgpa', message: 'CGPA should be a number from 0 to 10, such as 8.5.' };
    }
  }

  const urlFields = [
    { key: 'linkedin', label: 'LinkedIn URL' },
    { key: 'github', label: 'GitHub URL' },
    { key: 'portfolio', label: 'Portfolio URL' }
  ];

  for (let i = 0; i < urlFields.length; i += 1) {
    const field = urlFields[i];
    if (profile[field.key] && !isLikelyUrl(profile[field.key])) {
      return { key: field.key, message: 'Enter a valid ' + field.label + ', such as https://example.com/you.' };
    }
  }

  return null;
}

function setStatus(message, type) {
  statusEl.hidden = !message;
  statusEl.className = 'status ' + (type || 'info');
  statusEl.textContent = message || '';
}

function setBusy(value, label) {
  busy = value;
  saveButton.disabled = value;
  fillButton.disabled = value;
  fillButton.textContent = value ? label : 'Fill Current Form';
  if (value) {
    fillButton.setAttribute('aria-busy', 'true');
  } else {
    fillButton.removeAttribute('aria-busy');
  }
}

function clearResult() {
  resultEl.hidden = true;
  resultPlatform.textContent = '';
  resultSummary.textContent = '';
  filledList.replaceChildren();
  skippedList.replaceChildren();
  resultNote.textContent = '';
  filledWrap.hidden = true;
  skippedDetails.hidden = true;
  skippedDetails.open = false;
}

function addFieldItem(list, primary, secondary) {
  const item = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = primary || 'Unnamed field';
  item.appendChild(name);

  if (secondary) {
    const detail = document.createElement('span');
    detail.className = 'field-name';
    detail.textContent = secondary;
    item.appendChild(detail);
  }

  list.appendChild(item);
}

function countFields(number, word) {
  return number + ' ' + word + (number === 1 ? '' : 's');
}

function renderResult(summary) {
  const filled = Array.isArray(summary.filled) ? summary.filled : [];
  const skipped = Array.isArray(summary.skipped) ? summary.skipped : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.slice() : [];
  const detected = Number(summary.detected) || 0;

  resultEl.hidden = false;
  resultPlatform.textContent = summary.platform || 'Current page';
  resultPlatform.title = summary.platform || '';

  resultSummary.textContent =
    'Filled ' + countFields(filled.length, 'field') +
    ', skipped ' + countFields(skipped.length, 'field') + '.';

  filledList.replaceChildren();
  if (filled.length) {
    filledWrap.hidden = false;
    filled.slice(0, 50).forEach(function (item) {
      addFieldItem(filledList, item.label, item.field);
    });
    if (filled.length > 50) {
      addFieldItem(filledList, '\u2026and ' + (filled.length - 50) + ' more filled fields', '');
    }
  } else {
    filledWrap.hidden = true;
  }

  skippedList.replaceChildren();
  if (skipped.length) {
    skippedDetails.hidden = false;
    skippedSummary.textContent = 'Skipped fields (' + skipped.length + ')';
    skipped.slice(0, 50).forEach(function (item) {
      addFieldItem(skippedList, item.label, item.reason);
    });
    if (skipped.length > 50) {
      addFieldItem(skippedList, '\u2026and ' + (skipped.length - 50) + ' more skipped fields', '');
    }
    skippedDetails.open = filled.length === 0;
  } else {
    skippedDetails.hidden = true;
    skippedDetails.open = false;
  }

  const uniqueNotes = [];
  notes.forEach(function (note) {
    if (note && uniqueNotes.indexOf(note) === -1) uniqueNotes.push(note);
  });
  if (summary.ignored > 0) {
    uniqueNotes.push(countFields(summary.ignored, 'unsupported field') + ' left untouched.');
  }
  if (!detected) {
    uniqueNotes.push('If the form is embedded in an iframe, open the form in its own tab and try again.');
  }
  resultNote.textContent = uniqueNotes.join(' ');

  if (filled.length) {
    setStatus(
      'Filled ' + countFields(filled.length, 'field') +
      '. Review every answer before submitting.',
      'success'
    );
  } else if (!detected) {
    setStatus('No fillable fields were found on this page.', 'warn');
  } else {
    setStatus('No fields were filled. Open the result details to see why.', 'warn');
  }
}

function friendlyError(error) {
  const message = String((error && error.message) || error || 'Unknown error');

  if (/cannot access|missing host permission|extensions gallery cannot be scripted|cannot access a chrome/i.test(message)) {
    return 'Chrome blocked access to this page. Reload the page and try again. For a local file, open the extension Details page and enable "Allow access to file URLs".';
  }
  if (/no tab with id|tab was closed|no tab/i.test(message)) {
    return 'The active tab was closed before autofill finished.';
  }
  if (/frame was removed|navigated|context invalidated/i.test(message)) {
    return 'The page changed while autofill was running. Reload it and try again.';
  }
  if (/file:\/\//i.test(message)) {
    return 'Chrome cannot read this local file. Enable "Allow access to file URLs" on the extension Details page.';
  }
  return 'Could not fill this page: ' + message;
}

function blockedReason(url) {
  if (!url) return '';
  const lower = url.toLowerCase();

  if (lower.indexOf('chrome://') === 0 || lower.indexOf('edge://') === 0 ||
      lower.indexOf('about:') === 0 || lower.indexOf('devtools://') === 0 ||
      lower.indexOf('chrome-extension://') === 0) {
    return 'Chrome does not allow extensions to fill its internal pages. Open a normal job application form and try again.';
  }
  if (lower.indexOf('chromewebstore.google.com') !== -1 ||
      lower.indexOf('chrome.google.com/webstore') !== -1) {
    return 'Chrome blocks extensions from running on the Chrome Web Store. Open the application form in another tab.';
  }
  if (lower.indexOf('view-source:') === 0 || lower.indexOf('.pdf') !== -1) {
    return 'PDF pages and view-source pages cannot be autofilled. Open the form as a normal web page.';
  }
  if (lower.indexOf('http://') !== 0 && lower.indexOf('https://') !== 0 && lower.indexOf('file://') !== 0) {
    return 'This page type is not supported. Open a normal web page or form.';
  }
  return '';
}

async function saveProfile(silent) {
  const profile = readForm();
  const problem = validateProfile(profile);
  if (problem) {
    setStatus(problem.message, 'error');
    if (inputs[problem.key]) inputs[problem.key].focus();
    return false;
  }

  try {
    await chrome.storage.local.set({
      profile: profile,
      overwrite: overwriteInput.checked,
      customFields: customFields
    });
    savedProfile = profile;
    dirty = false;
    if (!silent) setStatus('Profile saved locally.', 'success');
    return true;
  } catch (error) {
    setStatus('Could not save the profile in Chrome storage. ' + friendlyError(error), 'error');
    return false;
  }
}

// ─── Custom fields ───────────────────────────────────────────────────────────

const customSection = document.getElementById('custom-section');
const customList = document.getElementById('custom-list');
const addCustomBtn = document.getElementById('add-custom');

function normalizeCustomLabel(label) {
  return String(label || '').trim();
}

function renderCustomFields() {
  customList.replaceChildren();
  customFields.forEach(function (cf, index) {
    const row = document.createElement('div');
    row.className = 'custom-row';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'custom-label-input';
    labelInput.placeholder = 'Field label';
    labelInput.value = cf.label;
    labelInput.setAttribute('aria-label', 'Custom field label ' + (index + 1));
    labelInput.addEventListener('input', function () {
      customFields[index].label = normalizeCustomLabel(labelInput.value);
      markDirty();
    });

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'custom-value-input';
    valueInput.placeholder = 'Value';
    valueInput.value = cf.value;
    valueInput.setAttribute('aria-label', 'Custom field value ' + (index + 1));
    valueInput.addEventListener('input', function () {
      customFields[index].value = String(valueInput.value);
      markDirty();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'button custom-del';
    delBtn.title = 'Remove this field';
    delBtn.setAttribute('aria-label', 'Delete custom field ' + (index + 1));
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function () {
      customFields.splice(index, 1);
      renderCustomFields();
      markDirty();
    });

    row.appendChild(labelInput);
    row.appendChild(valueInput);
    row.appendChild(delBtn);
    customList.appendChild(row);
  });
}

function markDirty() {
  if (!dirty) {
    dirty = true;
    clearResult();
    if (!busy) setStatus('Unsaved changes. Save the profile before filling.', 'warn');
  }
}

addCustomBtn.addEventListener('click', function () {
  customFields.push({ label: '', value: '' });
  renderCustomFields();
  // Focus the new label input.
  const rows = customList.querySelectorAll('.custom-row');
  const last = rows[rows.length - 1];
  if (last) last.querySelector('.custom-label-input').focus();
  markDirty();
});

// ─── Export / Import ─────────────────────────────────────────────────────────

const exportBtn = document.getElementById('export-profile');
const importBtn = document.getElementById('import-profile');
const importFileInput = document.getElementById('import-file-input');

exportBtn.addEventListener('click', function () {
  const data = {
    profile: savedProfile,
    customFields: customFields
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'autofill-profile.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus('Profile exported.', 'success');
});

importBtn.addEventListener('click', function () {
  importFileInput.value = '';
  importFileInput.click();
});

importFileInput.addEventListener('change', function () {
  const file = importFileInput.files && importFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function (event) {
    let parsed;
    try {
      parsed = JSON.parse(event.target.result);
    } catch (err) {
      setStatus('Could not read the file. Make sure it is a valid autofill JSON export.', 'error');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setStatus('Invalid file format. The file must be a JSON object.', 'error');
      return;
    }

    // Validate profile fields.
    const importedProfile = normalizeProfile(parsed.profile);
    const problem = validateProfile(importedProfile);
    if (problem) {
      setStatus('Import failed: ' + problem.message, 'error');
      return;
    }

    // Validate custom fields.
    const rawCustom = Array.isArray(parsed.customFields) ? parsed.customFields : [];
    const importedCustom = [];
    for (let i = 0; i < rawCustom.length; i++) {
      const cf = rawCustom[i];
      if (!cf || typeof cf !== 'object') continue;
      const label = String(cf.label || '').trim();
      const value = String(cf.value || '');
      if (label) importedCustom.push({ label, value });
    }

    if (!hasAnyValue(importedProfile) && !importedCustom.length) {
      setStatus('The file appears to be empty. Nothing was imported.', 'warn');
      return;
    }

    if (!window.confirm('Replace your current profile with the imported data?')) return;

    try {
      await chrome.storage.local.set({
        profile: importedProfile,
        customFields: importedCustom
      });
      savedProfile = importedProfile;
      customFields = importedCustom;
      writeForm(savedProfile);
      renderCustomFields();
      dirty = false;
      setStatus('Profile imported successfully.', 'success');
    } catch (error) {
      setStatus('Could not save the imported profile. ' + friendlyError(error), 'error');
    }
  };
  reader.readAsText(file);
});

function mergeSummaries(summaries) {
  const usable = summaries.filter(function (summary) {
    return summary && !summary.error;
  });
  if (!usable.length) return summaries[0];

  const base = usable.find(function (summary) { return summary.detected > 0; }) || usable[0];
  const notes = [];
  let detected = 0;
  let ignored = 0;
  const filled = [];
  const skipped = [];
  const platforms = [];

  usable.forEach(function (summary) {
    detected += Number(summary.detected) || 0;
    ignored += Number(summary.ignored) || 0;
    if (Array.isArray(summary.filled)) filled.push.apply(filled, summary.filled);
    if (Array.isArray(summary.skipped)) skipped.push.apply(skipped, summary.skipped);
    if (summary.platform && platforms.indexOf(summary.platform) === -1) platforms.push(summary.platform);
    if (Array.isArray(summary.notes)) {
      summary.notes.forEach(function (note) {
        if (note && notes.indexOf(note) === -1) notes.push(note);
      });
    }
  });

  return {
    ok: true,
    platform: platforms.join(' + ') || base.platform,
    url: base.url,
    title: base.title,
    detected: detected,
    filled: filled,
    skipped: skipped,
    ignored: ignored,
    notes: notes
  };
}

async function runAutofill(tabId, profile, overwrite) {
  const files = ['lib/matcher.js', 'content/filler.js'];
  const functionBody = function (profileArg, overwriteArg, customFieldsArg) {
    if (!globalThis.AutofillFiller) {
      return { error: 'Autofill code did not load on this page. Reload the extension and try again.' };
    }
    return globalThis.AutofillFiller.run(profileArg, overwriteArg, customFieldsArg);
  };

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: files
  });

  const topResults = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: functionBody,
    args: [profile, overwrite, customFields]
  });

  let summary = topResults && topResults[0] && topResults[0].result;
  if (!summary) throw new Error('Autofill returned no result.');
  if (summary.error) return summary;

  if (summary.detected === 0) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        files: files
      });
      const frameResults = await chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        func: functionBody,
        args: [profile, overwrite, customFields]
      });
      const summaries = (frameResults || [])
        .map(function (entry) { return entry && entry.result; })
        .filter(Boolean);

      if (summaries.some(function (item) { return item.detected > 0; })) {
        summary = mergeSummaries(summaries.concat([summary]));
        summary.notes = summary.notes || [];
        summary.notes.push('Results include accessible embedded frames. Cross-origin frames may still be blocked by Chrome.');
      }
    } catch (error) {
      summary.notes = summary.notes || [];
      summary.notes.push('Embedded frames could not be accessed. If the form is inside an iframe, open it in its own tab and try again.');
    }
  }

  return summary;
}

async function handleFill() {
  if (busy) return;
  clearResult();
  setBusy(true, 'Filling\u2026');

  try {
    if (dirty) {
      const saved = await saveProfile(true);
      if (!saved) return;
      setStatus('Saved current profile. Filling\u2026', 'info');
    }

    if (!hasAnyValue(savedProfile)) {
      setStatus('Enter and save your profile first, then try again.', 'error');
      return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') {
      setStatus('No active tab was found. Open the form and try again.', 'error');
      return;
    }

    const reason = blockedReason(tab.url);
    if (reason) {
      setStatus(reason, 'error');
      return;
    }

    setStatus('Filling the current page\u2026', 'info');
    const summary = await runAutofill(tab.id, savedProfile, overwriteInput.checked);

    if (!summary || summary.error) {
      throw new Error((summary && summary.error) || 'Autofill returned no result.');
    }

    renderResult(summary);
  } catch (error) {
    setStatus(friendlyError(error), 'error');
  } finally {
    setBusy(false);
  }
}

async function init() {
  try {
    const data = await chrome.storage.local.get(['profile', 'overwrite', 'customFields']);
    savedProfile = normalizeProfile(data.profile);
    writeForm(savedProfile);
    overwriteInput.checked = !!data.overwrite;
    customFields = Array.isArray(data.customFields) ? data.customFields : [];
    renderCustomFields();

    if (hasAnyValue(savedProfile) || customFields.length) {
      setStatus('Saved profile loaded.', 'info');
    }
  } catch (error) {
    setStatus('Could not load the saved profile. ' + friendlyError(error), 'error');
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true, 'Saving\u2026');
    try {
      await saveProfile(false);
    } finally {
      setBusy(false);
    }
  });

  PROFILE_KEYS.forEach(function (key) {
    inputs[key].addEventListener('input', function () {
      markDirty();
    });
  });

  overwriteInput.addEventListener('change', function () {
    chrome.storage.local.set({ overwrite: overwriteInput.checked }).catch(function () {
      // The checkbox is a convenience setting; failure is not worth blocking the UI.
    });
  });

  fillButton.addEventListener('click', handleFill);
}

init();
