/**
 * Field matching for Job Application Autofill.
 *
 * This file is deliberately dependency-free. It runs in the extension popup's
 * injected content script, and it can also be loaded directly by Node for tests:
 *   const M = require('./lib/matcher.js');
 *
 * Matching is conservative: a field is filled only when one profile attribute
 * clearly wins. Ambiguous labels return null instead of guessing.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AutofillMatcher = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FIELD_LABELS = {
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone',
    city: 'City / location',
    college: 'College / university',
    degree: 'Degree',
    branch: 'Branch / specialization',
    graduationYear: 'Graduation year',
    cgpa: 'CGPA',
    linkedin: 'LinkedIn',
    github: 'GitHub',
    portfolio: 'Portfolio'
  };

  // A regex used as a global must be reset before each test. We never use the
  // global flag here, but this helper keeps that contract explicit.
  function hits(re, text) {
    re.lastIndex = 0;
    return re.test(text);
  }

  function anyHit(list, text) {
    for (var i = 0; i < list.length; i += 1) {
      if (hits(list[i], text)) return true;
    }
    return false;
  }

  var GLOBAL_NEGATIVES = [
    /\bwhy\b/,
    /\bcover letter\b/,
    /\btell us\b/,
    /\bdescribe\b/,
    /\bexplain\b/,
    /\bmotivat/,
    /\bstatement of purpose\b/,
    /\bessay\b/,
    /\badditional (information|comments?|details?)\b/,
    /\bcomments?\b/,
    /\bmessage\b/,
    /\bhow did you hear\b/,
    /\bsalary\b/,
    /\bcompensation\b/,
    /\bctc\b/,
    /\bnotice period\b/,
    /\bstart date\b/,
    /\bavailability\b/,
    /\bdate of birth\b/,
    /\bdob\b/,
    /\bage\b/,
    /\bgender\b/,
    /\bnationality\b/,
    /\bmarital\b/,
    /\bresume\b/,
    /\bcv\b/,
    /\bupload\b/,
    /\bsignature\b/,
    /\bconsent\b/,
    /\bdeclaration\b/,
    /\bterms\b/,
    /\bi agree\b/,
    /\bsubscribe\b/,
    /\breferral\b/,
    /\breference\b/,
    /\bemergency\b/,
    /\bfather\b/,
    /\bmother\b/,
    /\bguardian\b/
  ];

  var SPECS = [
    {
      key: 'fullName',
      patterns: [
        { re: /^full name$/, weight: 14 },
        { re: /\bfull name\b/, weight: 12 },
        { re: /\b(candidate|applicant) name\b/, weight: 12 },
        { re: /^(your )?name$/, weight: 12 },
        { re: /^name\b/, weight: 9 },
        { re: /\bname (of )?(the )?(candidate|applicant)\b/, weight: 10 },
        { re: /\bname as (per|on)\b/, weight: 9 }
      ],
      negatives: [
        /\bcompany\b/,
        /\bemployer\b/,
        /\borgani[sz]ation\b/,
        /\bproject\b/,
        /\bproduct\b/,
        /\bbank\b/,
        /\bfile\b/,
        /\bdomain\b/,
        /\buser ?name\b/,
        /\bevent\b/,
        /\bcourse\b/,
        /\bcertificate\b/,
        /\bposition\b/,
        /\brole\b/,
        /\bjob title\b/,
        /\bfirst name\b/,
        /\blast name\b/,
        /\bmiddle name\b/,
        /\bsurname\b/,
        /\bgiven name\b/,
        /\bfamily name\b/,
        /\bnick ?name\b/,
        /\bpreferred name\b/,
        /\bcollege\b/,
        /\buniversity\b/,
        /\binstitute\b/,
        /\bschool\b/,
        /\bfather\b/,
        /\bmother\b/,
        /\bguardian\b/,
        /\breferr/
      ]
    },
    {
      key: 'email',
      patterns: [
        { re: /\bemail address\b/, weight: 13 },
        { re: /\bemail\b/, weight: 10 },
        { re: /\bmail id\b/, weight: 10 },
        { re: /\be mail\b/, weight: 10 }
      ],
      negatives: [
        /\balternate\b/,
        /\bsecondary\b/,
        /\bother email\b/,
        /\brecovery\b/,
        /\bparent\b/,
        /\bguardian\b/,
        /\bcollege email\b/,
        /\bemail preference\b/
      ]
    },
    {
      key: 'phone',
      patterns: [
        { re: /\bcontact (number|no|phone)\b/, weight: 12 },
        { re: /\bphone number\b/, weight: 12 },
        { re: /\bmobile number\b/, weight: 12 },
        { re: /\bwhatsapp\b/, weight: 11 },
        { re: /\bphone\b/, weight: 10 },
        { re: /\bmobile\b/, weight: 10 },
        { re: /\bcell( phone)?\b/, weight: 8 }
      ],
      negatives: [
        /\bcountry code\b/,
        /\barea code\b/,
        /\bextension\b/,
        /\bext\b/,
        /\bphone type\b/,
        /\balternate\b/,
        /\bsecondary\b/,
        /\bother\b/,
        /\bemergency\b/,
        /\bparent\b/,
        /\bguardian\b/,
        /\blandline\b/,
        /\bhome phone\b/,
        /\boffice phone\b/
      ]
    },
    {
      key: 'city',
      patterns: [
        { re: /\bcity location\b/, weight: 13 },
        { re: /\bcity\b/, weight: 10 },
        { re: /\bcurrent location\b/, weight: 11 },
        { re: /\blocation\b/, weight: 9 },
        { re: /\bwhere (do )?you (currently )?(live|based)\b/, weight: 11 },
        { re: /\bbased in\b/, weight: 9 },
        { re: /\bresidence\b/, weight: 8 },
        { re: /\btown\b/, weight: 8 },
        { re: /\bplace\b/, weight: 6 }
      ],
      negatives: [
        /\bpreferred\b/,
        /\bjob location\b/,
        /\bwork location\b/,
        /\boffice location\b/,
        /\brelocat/,
        /\bcountry\b/,
        /\bstate\b/,
        /\bprovince\b/,
        /\bzip\b/,
        /\bpostal\b/,
        /\bpin ?code\b/,
        /\baddress\b/,
        /\bstreet\b/,
        /\bdistrict\b/
      ]
    },
    {
      key: 'college',
      patterns: [
        { re: /\bcollege university\b/, weight: 14 },
        { re: /\bcollege\b/, weight: 10 },
        { re: /\buniversity\b/, weight: 10 },
        { re: /\b(institute|institution)\b/, weight: 10 },
        { re: /\balma mater\b/, weight: 12 },
        { re: /\beducational institution\b/, weight: 12 },
        { re: /\bname of (the )?(college|university|institute)\b/, weight: 13 }
      ],
      negatives: [
        /\bcompany\b/,
        /\bemployer\b/,
        /\borgani[sz]ation\b/,
        /\bhigh school\b/,
        /\bhigher secondary\b/,
        /\b12th\b/,
        /\b10th\b/,
        /\broll\b/,
        /\bregistration\b/,
        /\benrol/,
        /\bstudent id\b/,
        /\bid number\b/,
        /\bemail\b/,
        /\bwebsite\b/,
        /\baddress\b/,
        /\bcity\b/,
        /\bcountry\b/,
        /\branking\b/
      ]
    },
    {
      key: 'degree',
      patterns: [
        { re: /\bdegree\b/, weight: 10 },
        { re: /\bqualification\b/, weight: 10 },
        { re: /\bhighest education\b/, weight: 11 },
        { re: /\beducation level\b/, weight: 9 },
        { re: /\bcourse\b/, weight: 8 },
        { re: /\bprogram(me)?\b/, weight: 7 },
        { re: /\bwhat are you (studying|pursuing)\b/, weight: 9 }
      ],
      negatives: [
        /\bpercentage\b/,
        /\bpercent\b/,
        /\bmarks\b/,
        /\bcgpa\b/,
        /\bgpa\b/,
        /\bscore\b/,
        /\byear\b/,
        /\bsemester\b/,
        /\bcourse code\b/,
        /\bcourse name\b/,
        /\bapplying\b/,
        /\bapplied\b/,
        /\bjob\b/,
        /\bposition\b/,
        /\brole\b/
      ]
    },
    {
      key: 'branch',
      patterns: [
        { re: /\bspeciali[sz]ation\b/, weight: 12 },
        { re: /\bbranch\b/, weight: 10 },
        { re: /\bmajor\b/, weight: 9 },
        { re: /\bstream\b/, weight: 9 },
        { re: /\bfield of study\b/, weight: 11 },
        { re: /\barea of study\b/, weight: 10 },
        { re: /\bdiscipline\b/, weight: 8 },
        { re: /\bdepartment\b/, weight: 7 }
      ],
      negatives: [
        /\bbranch office\b/,
        /\bbank branch\b/,
        /\bcode\b/,
        /\broll\b/,
        /\bregistration\b/,
        /\bcompany\b/,
        /\bemployer\b/,
        /\bjob\b/,
        /\bposition\b/,
        /\brole\b/,
        /\boffice\b/,
        /\bapplying\b/
      ]
    },
    {
      key: 'graduationYear',
      patterns: [
        { re: /\bgraduation year\b/, weight: 15 },
        { re: /\byear of graduation\b/, weight: 15 },
        { re: /\bexpected graduation\b/, weight: 14 },
        { re: /\bgraduating (year|in)\b/, weight: 14 },
        { re: /\bpassing out (year)?\b/, weight: 13 },
        { re: /\byear of passing\b/, weight: 13 },
        { re: /\bcompletion year\b/, weight: 12 },
        { re: /\bclass of\b/, weight: 11 },
        { re: /\bbatch\b/, weight: 9 },
        { re: /\bgraduation\b/, weight: 9 }
      ],
      negatives: [
        /\bbirth\b/,
        /\bdob\b/,
        /\bexperience\b/,
        /\bstart\b/,
        /\bjoining\b/,
        /\badmission\b/,
        /\benrol/,
        /\bfounded\b/,
        /\bestablished\b/,
        /\bcurrent year\b/,
        /\bpassing marks\b/
      ]
    },
    {
      key: 'cgpa',
      patterns: [
        { re: /\bcgpa\b/, weight: 15 },
        { re: /\bgrade point average\b/, weight: 14 },
        { re: /\bgpa\b/, weight: 12 },
        { re: /\bgrade point\b/, weight: 11 },
        { re: /\baggregate\b/, weight: 8 }
      ],
      negatives: [
        /\bpercentage\b/,
        /\bpercent\b/,
        /\bmarks\b/,
        /\b12th\b/,
        /\b10th\b/,
        /\bsemester\b/
      ]
    },
    {
      key: 'linkedin',
      patterns: [
        { re: /\blinkedin (profile|url|link)\b/, weight: 16 },
        { re: /\blinkedin\b/, weight: 14 }
      ],
      negatives: [/\bcompany\b/, /\bpage\b/, /\bpost\b/, /\bjob\b/]
    },
    {
      key: 'github',
      patterns: [
        { re: /\bgithub (profile|url|link)\b/, weight: 16 },
        { re: /\bgithub\b/, weight: 14 },
        { re: /\bcode repository\b/, weight: 8 }
      ],
      negatives: [
        /\brepository\b/,
        /\brepo\b/,
        /\bgist\b/,
        /\borgani[sz]ation\b/,
        /\bworkflow\b/,
        /\bactions\b/,
        /\bpages\b/
      ]
    },
    {
      key: 'portfolio',
      patterns: [
        { re: /\bportfolio\b/, weight: 15 },
        { re: /\bpersonal (website|site|webpage)\b/, weight: 14 },
        { re: /\bwebsite url\b/, weight: 13 },
        { re: /\bwebsite\b/, weight: 9 },
        { re: /\bwork samples?\b/, weight: 9 }
      ],
      negatives: [
        /\bcompany\b/,
        /\borgani[sz]ation\b/,
        /\bagency\b/,
        /\bclient\b/,
        /\bblog\b/,
        /\bshop\b/,
        /\bstore\b/
      ]
    }
  ];

  var ALLOWED_TYPES = {
    fullName: ['text', 'textarea', 'select', 'radio', 'checkbox'],
    email: ['text', 'email', 'textarea', 'select', 'radio', 'checkbox'],
    phone: ['text', 'tel', 'textarea', 'select', 'radio', 'checkbox'],
    city: ['text', 'textarea', 'select', 'radio', 'checkbox'],
    college: ['text', 'textarea', 'select', 'radio', 'checkbox'],
    degree: ['text', 'textarea', 'select', 'radio', 'checkbox'],
    branch: ['text', 'textarea', 'select', 'radio', 'checkbox'],
    graduationYear: ['text', 'number', 'textarea', 'select', 'radio', 'checkbox'],
    cgpa: ['text', 'number', 'textarea', 'select', 'radio', 'checkbox'],
    linkedin: ['text', 'url', 'textarea', 'select', 'radio', 'checkbox'],
    github: ['text', 'url', 'textarea', 'select', 'radio', 'checkbox'],
    portfolio: ['text', 'url', 'textarea', 'select', 'radio', 'checkbox']
  };

  var TYPE_BONUS = {
    email: { email: 7 },
    tel: { phone: 7 }
  };

  var MIN_SCORE = 4.5;
  var MIN_MARGIN = 1.5;
  var GENERIC_TEXT = /^(your answer|enter your answer|type your answer|answer|type here|write here|search|search\s*)$/;

  var ALIAS_GROUPS = {
    degree: [
      ['b tech', 'btech', 'bachelor of technology'],
      ['be', 'b e', 'bachelor of engineering'],
      ['b sc', 'bsc', 'bachelor of science'],
      ['m tech', 'mtech', 'master of technology'],
      ['me', 'm e', 'master of engineering'],
      ['m sc', 'msc', 'master of science'],
      ['mba', 'master of business administration'],
      ['bca', 'bachelor of computer applications'],
      ['mca', 'master of computer applications'],
      ['phd', 'doctor of philosophy']
    ],
    branch: [
      ['cse', 'computer science', 'computer science engineering', 'computer science and engineering'],
      ['it', 'information technology'],
      ['ece', 'electronics and communication engineering', 'electronics and communication'],
      ['eee', 'electrical and electronics engineering', 'electrical and electronics'],
      ['me', 'mechanical engineering', 'mechanical'],
      ['ce', 'civil engineering', 'civil'],
      ['ee', 'electrical engineering', 'electrical'],
      ['aiml', 'artificial intelligence and machine learning', 'ai ml', 'ai and ml'],
      ['ds', 'data science']
    ]
  };

  /**
   * Lowercase, split camelCase, expand a few common concatenations, and remove
   * punctuation. This makes "E-mail Address", "emailAddress" and "Email address"
   * comparable while preserving meaningful words.
   */
  function normalize(value) {
    var text = String(value == null ? '' : value);
    text = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    text = text.toLowerCase();
    text = text
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\be[\s-]?mail\b/g, 'email')
      .replace(/\bc\s*\.?\s*g\s*\.?\s*p\s*\.?\s*a\b/g, 'cgpa')
      .replace(/\blinked\s*in\b/g, 'linkedin')
      .replace(/\bgit\s*hub\b/g, 'github')
      .replace(/\bemailaddress\b/g, 'email address')
      .replace(/\bphonenumber\b/g, 'phone number')
      .replace(/\bmobilenumber\b/g, 'mobile number')
      .replace(/\bfullname\b/g, 'full name')
      .replace(/\bgraduationyear\b/g, 'graduation year')
      .replace(/\blinkedinurl\b/g, 'linkedin url')
      .replace(/\bgithuburl\b/g, 'github url')
      .replace(/\bportfoliourl\b/g, 'portfolio url')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text;
  }

  function humanize(value) {
    var text = String(value == null ? '' : value);
    if (!text) return '';
    if (/^entry\.\d+$/i.test(text)) return '';
    return text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-.[\]{}:]+/g, ' ')
      .replace(/\d+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scoreSpec(spec, text, sourceWeight) {
    var normalized = normalize(text);
    if (!normalized) return 0;

    var best = 0;
    for (var i = 0; i < spec.patterns.length; i += 1) {
      if (hits(spec.patterns[i].re, normalized) && spec.patterns[i].weight > best) {
        best = spec.patterns[i].weight;
      }
    }
    if (!best) return 0;

    if (anyHit(spec.negatives, normalized)) return 0;
    if (anyHit(GLOBAL_NEGATIVES, normalized)) return 0;

    return best * (typeof sourceWeight === 'number' ? sourceWeight : 1);
  }

  function typeAllowed(spec, type) {
    var allowed = ALLOWED_TYPES[spec.key];
    if (!allowed) return false;
    return allowed.indexOf(type) !== -1;
  }

  function patternHits(spec, text) {
    var normalized = normalize(text);
    if (!normalized) return false;
    for (var i = 0; i < spec.patterns.length; i += 1) {
      if (hits(spec.patterns[i].re, normalized)) return true;
    }
    return false;
  }

  function specByKey(key) {
    for (var i = 0; i < SPECS.length; i += 1) {
      if (SPECS[i].key === key) return SPECS[i];
    }
    return null;
  }

  /**
   * Match one logical form field.
   *
   * @param {Array<{text: string, weight?: number, source?: string}>|string} texts
   * @param {{type?: string}} hints
   * @returns {{key: string, fieldLabel: string, score: number, question: string, source: string}|null}
   */
  function matchField(texts, hints) {
    hints = hints || {};
    var type = hints.type || 'text';

    var list = Array.isArray(texts)
      ? texts
      : [{ text: texts, weight: 1, source: 'label' }];

    list = list
      .filter(function (item) {
        if (!item || typeof item.text !== 'string' || !item.text.trim()) return false;
        return !GENERIC_TEXT.test(normalize(item.text));
      })
      .map(function (item) {
        return {
          text: item.text,
          weight: typeof item.weight === 'number' ? item.weight : 1,
          source: item.source || ''
        };
      });

    var allCandidates = [];
    var allowedCandidates = [];
    var hasStrongText = list.some(function (item) {
      return item.weight >= 0.8 && !!normalize(item.text);
    });

    for (var i = 0; i < SPECS.length; i += 1) {
      var spec = SPECS[i];
      var bestScore = 0;
      var bestText = '';
      var bestSource = '';

      for (var j = 0; j < list.length; j += 1) {
        var score = scoreSpec(spec, list[j].text, list[j].weight);
        if (score > bestScore) {
          bestScore = score;
          bestText = list[j].text;
          bestSource = list[j].source;
        }
      }

      if (bestScore > 0) {
        allCandidates.push({
          key: spec.key,
          labelScore: bestScore,
          question: bestText,
          source: bestSource
        });
      }

      if (!typeAllowed(spec, type)) continue;

      var finalScore = bestScore;
      var bonus = TYPE_BONUS[type] && TYPE_BONUS[type][spec.key];
      if (bonus) {
        var bonusSpec = specByKey(spec.key);
        var patternMentioned = bonusSpec && list.some(function (item) {
          return patternHits(bonusSpec, item.text);
        });

        // A type-only guess is safe only for a genuinely unlabeled field. If a
        // label exists but was rejected (for example "Alternate Phone Number"),
        // do not silently turn the input's type into an answer.
        var bonusAllowed = (!hasStrongText && !patternMentioned);
        if (bestScore > 0 || bonusAllowed) finalScore += bonus;
      }

      if (finalScore > 0) {
        allowedCandidates.push({
          key: spec.key,
          score: finalScore,
          labelScore: bestScore,
          question: bestText,
          source: bestSource
        });
      }
    }

    allCandidates.sort(function (a, b) { return b.labelScore - a.labelScore; });
    allowedCandidates.sort(function (a, b) { return b.score - a.score; });

    var bestAll = allCandidates[0];
    var bestAllowed = allowedCandidates[0];

    // If the label clearly describes an attribute that cannot live in this
    // control type, skip instead of forcing a type-based guess.
    if (bestAll && bestAll.labelScore >= MIN_SCORE) {
      if (!bestAllowed || bestAllowed.labelScore < MIN_SCORE) return null;
    }

    if (!bestAllowed || bestAllowed.score < MIN_SCORE) return null;

    var secondAllowed = allowedCandidates[1];
    if (secondAllowed && bestAllowed.score - secondAllowed.score < MIN_MARGIN) {
      return null;
    }

    return {
      key: bestAllowed.key,
      fieldLabel: FIELD_LABELS[bestAllowed.key],
      score: bestAllowed.score,
      question: bestAllowed.question,
      source: bestAllowed.source
    };
  }

  function extractYear(value) {
    var match = String(value == null ? '' : value).match(/(19|20)\d{2}/);
    return match ? match[0] : null;
  }

  function extractYears(value) {
    var found = String(value == null ? '' : value).match(/(19|20)\d{2}/g);
    return found || [];
  }

  function expandAliases(key, normalizedValue) {
    var variants = {};
    variants[normalizedValue] = true;
    var groups = ALIAS_GROUPS[key] || [];
    for (var i = 0; i < groups.length; i += 1) {
      var group = groups[i];
      var contains = false;
      for (var j = 0; j < group.length; j += 1) {
        if (group[j] === normalizedValue) {
          contains = true;
          break;
        }
      }
      if (contains) {
        for (var k = 0; k < group.length; k += 1) variants[group[k]] = true;
      }
    }
    return Object.keys(variants);
  }

  /**
   * Find exactly one option matching a profile value. Returns -1 when there is
   * no match or when more than one option matches (ambiguous).
   *
   * @param {string} key profile attribute key
   * @param {string} value saved profile value
   * @param {Array<{text: string, value?: string}>} options
   */
  function findOption(key, value, options) {
    var normalizedValue = normalize(value);
    if (!normalizedValue) return -1;

    var variants = expandAliases(key, normalizedValue);
    var exact = [];

    for (var i = 0; i < options.length; i += 1) {
      var option = options[i] || {};
      var texts = [normalize(option.text), normalize(option.value)].filter(Boolean);
      var matched = false;
      for (var j = 0; j < texts.length; j += 1) {
        for (var k = 0; k < variants.length; k += 1) {
          if (texts[j] === variants[k]) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) exact.push(i);
    }

    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return -1;

    if (key === 'graduationYear') {
      var year = extractYear(value);
      if (year) {
        var yearMatches = [];
        for (var y = 0; y < options.length; y += 1) {
          var o = options[y] || {};
          if (extractYears(o.text).indexOf(year) !== -1 ||
              extractYears(o.value).indexOf(year) !== -1) {
            yearMatches.push(y);
          }
        }
        if (yearMatches.length === 1) return yearMatches[0];
      }
      return -1;
    }

    if (key === 'cgpa') {
      var number = parseFloat(String(value).replace(/[^0-9.]/g, ''));
      if (!isNaN(number)) {
        var numberMatches = [];
        for (var n = 0; n < options.length; n += 1) {
          var text = String((options[n] || {}).text || '').replace(/,/g, '.');
          var found = text.match(/(?:^|\D)(\d+(?:\.\d+)?)(?:\D|$)/);
          if (found && Number(found[1]) === number) numberMatches.push(n);
        }
        if (numberMatches.length === 1) return numberMatches[0];
      }
      return -1;
    }

    // Degree/branch dropdowns are often grouped, for example
    // "BCA / B.Tech. / B.E. / B.Sc." or "Computer Science / IT". A unique
    // whole-phrase containment is useful; two or more matches stay ambiguous.
    if (key === 'degree' || key === 'branch') {
      var contained = [];
      for (var p = 0; p < options.length; p += 1) {
        var optionText = normalize((options[p] || {}).text);
        if (!optionText) continue;
        var paddedOption = ' ' + optionText + ' ';
        for (var v = 0; v < variants.length; v += 1) {
          if (variants[v].length >= 3 &&
              optionText !== variants[v] &&
              paddedOption.indexOf(' ' + variants[v] + ' ') !== -1) {
            contained.push(p);
            break;
          }
        }
      }
      if (contained.length === 1) return contained[0];
    }

    return -1;
  }

  /**
   * Detect a checkbox option that explicitly consents to recording the
   * respondent's email address with the response. This is intentionally narrow:
   * it only accepts wording that names email plus recording/inclusion, and
   * rejects negated options such as "Do not record my email address".
   */
  function isEmailConsentOption(value) {
    var text = normalize(value);
    if (!text) return false;
    if (/\b(do not|don t|dont|never|without|not)\b/.test(text)) return false;

    if (!/\bemail( address)?\b/.test(text)) return false;

    var mentionsResponse = /\b(response|submission)\b/.test(text);
    var ownEmail = /\b(my|your|respondent s)\s+email( address)?\b/.test(text);
    if (/\brecord(ed|ing|s)?\b/.test(text) && (mentionsResponse || ownEmail)) return true;
    if (/\binclude(d|s|ing)?\b/.test(text) && mentionsResponse) return true;
    return false;
  }

  /**
   * Convert a saved value into the form expected by a control. URLs without a
   * scheme are prefixed so they are accepted by type=url inputs.
   */
  function formatValue(key, value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    if (key === 'linkedin' || key === 'github' || key === 'portfolio') {
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && /\./.test(text)) {
        text = 'https://' + text;
      }
    }
    return text;
  }

  /**
   * Match one form field against a list of custom fields.
   *
   * Each entry in customFields must be { label: string, value: string }.
   * Returns the first entry whose normalized label matches any of the provided
   * text hints, or null when nothing matches confidently.
   *
   * Matching order:
   *   1. Exact normalized match against any hint text.
   *   2. The hint text contains the custom label as a whole word (substring).
   * If more than one custom field matches at the same level, returns null
   * (ambiguous).
   */
  function matchCustomField(customFields, texts, hints) {
    if (!Array.isArray(customFields) || !customFields.length) return null;
    if (!Array.isArray(texts) || !texts.length) return null;

    var hintTexts = texts
      .filter(function (item) { return item && typeof item.text === 'string' && item.text.trim(); })
      .map(function (item) { return normalize(item.text); })
      .filter(Boolean);

    if (!hintTexts.length) return null;

    // Pass 1: exact normalized match.
    var exactMatches = [];
    for (var i = 0; i < customFields.length; i += 1) {
      var cf = customFields[i];
      if (!cf || typeof cf.label !== 'string' || !cf.label.trim()) continue;
      var cfNorm = normalize(cf.label);
      if (!cfNorm) continue;
      for (var h = 0; h < hintTexts.length; h += 1) {
        if (hintTexts[h] === cfNorm) {
          exactMatches.push(cf);
          break;
        }
      }
    }
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) return null;

    // Pass 2: hint text contains the custom label as a bounded phrase.
    var subMatches = [];
    for (var i2 = 0; i2 < customFields.length; i2 += 1) {
      var cf2 = customFields[i2];
      if (!cf2 || typeof cf2.label !== 'string' || !cf2.label.trim()) continue;
      var cfNorm2 = normalize(cf2.label);
      if (!cfNorm2 || cfNorm2.length < 3) continue;
      for (var h2 = 0; h2 < hintTexts.length; h2 += 1) {
        var padded = ' ' + hintTexts[h2] + ' ';
        if (padded.indexOf(' ' + cfNorm2 + ' ') !== -1) {
          subMatches.push(cf2);
          break;
        }
      }
    }
    if (subMatches.length === 1) return subMatches[0];

    return null;
  }

  /**
   * Find an option index in a dropdown/radio list that matches a custom value.
   * Returns -1 when there is no match or the match is ambiguous.
   */
  function findCustomOption(value, options) {
    var normalizedValue = normalize(value);
    if (!normalizedValue) return -1;
    var matches = [];
    for (var i = 0; i < options.length; i += 1) {
      var option = options[i] || {};
      var texts = [normalize(option.text), normalize(option.value)].filter(Boolean);
      for (var j = 0; j < texts.length; j += 1) {
        if (texts[j] === normalizedValue) {
          matches.push(i);
          break;
        }
      }
    }
    if (matches.length === 1) return matches[0];
    return -1;
  }

  return {
    FIELD_LABELS: FIELD_LABELS,
    normalize: normalize,
    humanize: humanize,
    matchField: matchField,
    findOption: findOption,
    isEmailConsentOption: isEmailConsentOption,
    formatValue: formatValue,
    extractYear: extractYear,
    matchCustomField: matchCustomField,
    findCustomOption: findCustomOption
  };
});
