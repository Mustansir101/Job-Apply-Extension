'use strict';

/**
 * Dependency-free project checks.
 * Run with: node test/validate.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const problems = [];
const notes = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

function exists(relative) {
  return fs.existsSync(path.join(root, relative));
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

let manifest;
try {
  manifest = JSON.parse(read('manifest.json'));
} catch (error) {
  problems.push('manifest.json is not valid JSON: ' + error.message);
  manifest = null;
}

if (manifest) {
  check(manifest.manifest_version === 3, 'manifest_version must be 3.');
  check(typeof manifest.name === 'string' && manifest.name.length > 0, 'manifest name is required.');
  check(/^\d+\.\d+\.\d+$/.test(String(manifest.version || '')), 'manifest version should look like 1.0.0.');

  const permissions = manifest.permissions || [];
  ['storage', 'activeTab', 'scripting'].forEach(function (permission) {
    check(permissions.indexOf(permission) !== -1, 'manifest is missing the "' + permission + '" permission.');
  });

  check(!manifest.host_permissions, 'Version 1 should not request host_permissions.');
  check(!manifest.content_scripts, 'Version 1 injects on demand, so no content_scripts entry is needed.');
  check(!manifest.background, 'Version 1 does not need a background service worker.');

  const action = manifest.action || {};
  check(action.default_popup === 'popup.html', 'action.default_popup must be popup.html.');
  check(action.default_icon && action.default_icon['16'] && action.default_icon['48'] && action.default_icon['128'],
    'action.default_icon should include 16, 48, and 128 pixel icons.');
  check(manifest.icons && manifest.icons['16'] && manifest.icons['48'] && manifest.icons['128'],
    'manifest.icons should include 16, 48, and 128 pixel icons.');

  if (manifest.content_security_policy) {
    const policy = JSON.stringify(manifest.content_security_policy);
    check(policy.indexOf('unsafe-eval') === -1, 'manifest CSP must not allow unsafe-eval.');
    check(policy.indexOf('unsafe-inline') === -1, 'manifest CSP must not allow unsafe-inline.');
  }
}

const requiredFiles = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'popup.js',
  'lib/matcher.js',
  'content/filler.js',
  'icons/icon128.png',
  'README.md',
  'test/form.html',
  'test/matcher.test.js',
  'test/validate.js'
];

requiredFiles.forEach(function (file) {
  check(exists(file), 'missing required file: ' + file);
});

if (exists('popup.html')) {
  const html = read('popup.html');
  check(/<script\s+src="popup\.js"><\/script>/.test(html), 'popup.html should load popup.js with a script tag.');
  check(/<link\s+rel="stylesheet"\s+href="popup\.css">/.test(html), 'popup.html should load popup.css.');
  check(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html), 'popup.html must not contain inline scripts.');
}

const jsFiles = [
  'popup.js',
  'lib/matcher.js',
  'content/filler.js',
  'test/matcher.test.js',
  'test/validate.js',
  'test/serve.js'
];

jsFiles.forEach(function (file) {
  if (!exists(file)) return;
  try {
    execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'pipe' });
  } catch (error) {
    problems.push('JavaScript syntax error in ' + file + ': ' + String(error.stderr || error.message).trim());
  }
});

if (exists('content/filler.js')) {
  const filler = read('content/filler.js');
  check(filler.indexOf('form.submit') === -1, 'filler must not call form.submit().');
  check(filler.indexOf('.requestSubmit') === -1, 'filler must not call requestSubmit().');
  check(!/querySelector(All)?\([^)]*submit/i.test(filler), 'filler must not search for submit controls.');

  const clickLines = filler.split(/\r?\n/).filter(function (line) {
    return /\.click\(\)/.test(line);
  });
  const suspicious = clickLines.filter(function (line) {
    return /submit|apply|next|continue|button/i.test(line) && !/heading|option|role/i.test(line);
  });
  check(suspicious.length === 0, 'filler appears to click a navigation control: ' + suspicious.join(' | '));
}

// Run the matcher tests as part of validation.
try {
  const output = execFileSync(process.execPath, [path.join(root, 'test/matcher.test.js')], {
    stdio: 'pipe',
    encoding: 'utf8'
  });
  notes.push(output.trim());
} catch (error) {
  problems.push('matcher tests failed: ' + String(error.stdout || error.stderr || error.message).trim());
}

if (problems.length) {
  console.error('Validation failed:');
  problems.forEach(function (problem) { console.error('  - ' + problem); });
  process.exitCode = 1;
} else {
  console.log('Manifest and files: OK');
  console.log('JavaScript syntax: OK');
  console.log('Safety checks: OK');
  notes.forEach(function (note) { console.log(note); });
  console.log('Validation: PASS');
}
