'use strict';

/**
 * Dependency-free tests for lib/matcher.js.
 * Run with: node test/matcher.test.js
 */
const M = require('../lib/matcher.js');

let passed = 0;
let failed = 0;

function fail(message) {
  failed += 1;
  console.error('FAIL: ' + message);
}

function match(label, type = 'text') {
  return M.matchField([{ text: label, weight: 1, source: 'label' }], { type });
}

function expectKey(label, expected, type = 'text') {
  const result = match(label, type);
  const actual = result ? result.key : null;
  if (actual === expected) {
    passed += 1;
  } else {
    fail(`"${label}" (${type}) -> expected ${expected}, got ${actual}`);
  }
}

function expectNull(label, type = 'text') {
  expectKey(label, null, type);
}

function expectOption(key, value, options, expectedIndex) {
  const actual = M.findOption(key, value, options);
  if (actual === expectedIndex) {
    passed += 1;
  } else {
    fail(`findOption(${key}, "${value}") -> expected ${expectedIndex}, got ${actual}`);
  }
}

// Required synonym coverage from the brief.
[
  ['Full Name', 'fullName'],
  ['Name', 'fullName'],
  ['Candidate Name', 'fullName'],
  ['Your Name', 'fullName'],
  ['Email', 'email'],
  ['Email Address', 'email'],
  ['Contact Email', 'email'],
  ['E-mail Address', 'email'],
  ['Mobile Number', 'phone'],
  ['Phone Number', 'phone'],
  ['Contact Number', 'phone'],
  ['College', 'college'],
  ['University', 'college'],
  ['Institution Name', 'college'],
  ['College/University', 'college'],
  ['Degree', 'degree'],
  ['Qualification', 'degree'],
  ['Highest Qualification', 'degree'],
  ['Branch', 'branch'],
  ['Specialization', 'branch'],
  ['Major', 'branch'],
  ['Graduation Year', 'graduationYear'],
  ['Expected Graduation', 'graduationYear'],
  ['Year of Passing', 'graduationYear'],
  ['CGPA', 'cgpa'],
  ['Current CGPA', 'cgpa'],
  ['LinkedIn Profile', 'linkedin'],
  ['LinkedIn URL', 'linkedin'],
  ['GitHub Profile', 'github'],
  ['GitHub URL', 'github'],
  ['Portfolio', 'portfolio'],
  ['Portfolio URL', 'portfolio'],
  ['City', 'city'],
  ['Current Location', 'city']
].forEach(([label, key]) => expectKey(label, key));

// Sentence-style question text.
[
  ['What is your full name?', 'fullName'],
  ['Please enter your contact number', 'phone'],
  ['Name of your college', 'college'],
  ['Name of the university you attend', 'college'],
  ['Which branch did you choose?', 'branch'],
  ['When is your expected graduation?', 'graduationYear'],
  ['What is your current CGPA?', 'cgpa'],
  ['Add your LinkedIn profile link', 'linkedin'],
  ['Share your GitHub URL', 'github'],
  ['Personal website / portfolio', 'portfolio'],
  ['Where do you currently live?', 'city']
].forEach(([label, key]) => expectKey(label, key));

// Input-type-only fallbacks. These are common when Google Forms exposes
// "Your answer" and no useful label.
expectKey('Your answer', 'email', 'email');
expectKey('Your answer', 'phone', 'tel');

// Conservative skips.
[
  'Company Name',
  'First Name',
  'Last Name',
  'Alternate Phone Number',
  'Preferred Location',
  'Date of Birth',
  'Gender',
  'Salary Expectation',
  'Why do you want to join us?',
  'Tell us about yourself',
  'Describe a challenging project',
  'How did you hear about us?',
  'LinkedIn Company Page',
  'GitHub Repository',
  'Degree Percentage',
  'Email or Phone',
  'Address',
  'College Roll Number',
  'Are you authorized to work?',
  'Upload Resume'
].forEach((label) => expectNull(label));

// A label that clearly describes a different attribute than the control type
// should be skipped rather than filled by a type guess.
expectNull('Full Name', 'email');
expectNull('Phone Number', 'number');
expectNull('LinkedIn URL', 'email');
expectNull('Alternate Phone Number', 'tel');
expectNull('Alternate Email', 'email');
expectNull('Company Name', 'email');

// A generic URL input with a portfolio label should match.
expectKey('Portfolio', 'portfolio', 'url');
expectKey('Website', 'portfolio', 'url');
expectKey('LinkedIn', 'linkedin', 'url');

// Option matching.
expectOption('graduationYear', '2027', [
  { text: '2025' },
  { text: '2026' },
  { text: '2027 (Expected)' }
], 2);

expectOption('graduationYear', '2026', [
  { text: 'Select year' },
  { text: '2025' },
  { text: '2026' }
], 2);

expectOption('cgpa', '8.5', [
  { text: 'Select CGPA' },
  { text: '8.0' },
  { text: '8.5' }
], 2);

expectOption('degree', 'B.Tech', [
  { text: 'Select degree' },
  { text: 'Bachelor of Technology' },
  { text: 'Bachelor of Science' }
], 1);

expectOption('degree', 'Bachelor of Technology', [
  { text: 'B.Tech' },
  { text: 'B.Sc' }
], 0);

expectOption('branch', 'CSE', [
  { text: 'Computer Science and Engineering' },
  { text: 'Information Technology' }
], 0);

// Ambiguous or unsafe option matches must be skipped.
expectOption('graduationYear', '2026', [
  { text: '2025-2026' },
  { text: '2026-2027' }
], -1);

expectOption('degree', 'B.Tech', [
  { text: 'B.Tech CSE' },
  { text: 'B.Tech ECE' }
], -1);

expectOption('degree', 'B.Tech', [
  { text: 'Choose' },
  { text: 'BA / B.Com. / B.Ed. / BBA / Diploma' },
  { text: 'BCA / B.Tech. / B.E. / B.Sc.' },
  { text: 'MCA / M.Tech. / M.Sc.' }
], 2);

expectOption('branch', 'CSE', [
  { text: 'CSE / IT' },
  { text: 'ECE' }
], 0);

expectOption('fullName', 'Alex', [
  { text: 'Alex' },
  { text: 'Alexa' }
], 0);

// Value formatting for URL fields.
if (M.formatValue('linkedin', 'linkedin.com/in/example') === 'https://linkedin.com/in/example') {
  passed += 1;
} else {
  fail('formatValue should add https:// to a bare URL');
}

if (M.formatValue('email', 'person@example.com') === 'person@example.com') {
  passed += 1;
} else {
  fail('formatValue should not change email values');
}

// Email-recording consent checkboxes are checked automatically, but only when
// the wording clearly asks to record/include the respondent's email.
function expectConsent(text, expected) {
  const actual = M.isEmailConsentOption(text);
  if (actual === expected) {
    passed += 1;
  } else {
    fail(`isEmailConsentOption("${text}") -> expected ${expected}, got ${actual}`);
  }
}

[
  'Record [email address] as the email to be included with my response',
  'Record my email address',
  'Include my email address with my response',
  'Record my e-mail address as the email to be included with my response',
  'Please record my email address with my response',
  'Include the respondent\u2019s email address with my response',
  'Record [alex@example.com] as the email to be included with my response'
].forEach((text) => expectConsent(text, true));

[
  'Do not record my email address',
  'Do not include my email address with my response',
  'Email me about new jobs',
  'I agree to the privacy policy',
  'Record my phone number',
  'Include my portfolio with my response',
  'Subscribe to the newsletter',
  ''
].forEach((text) => expectConsent(text, false));

console.log(`\nMatcher tests: ${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
