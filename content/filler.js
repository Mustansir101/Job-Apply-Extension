/**
 * Page-side autofill logic.
 *
 * Injected only after the user clicks "Fill Current Form". It reads the DOM,
 * matches labels with lib/matcher.js, fills only confident matches, and returns
 * a serializable summary. It never submits a form or clicks navigation controls.
 */
(function () {
  'use strict';

  var M = globalThis.AutofillMatcher;

  if (!M) {
    globalThis.AutofillFiller = {
      run: function () {
        return { error: 'The matching module did not load. Reload the extension and try again.' };
      }
    };
    return;
  }

  var MAX_LABEL_LENGTH = 90;
  var MAX_OPTIONS = 500;
  var nodeIds = new WeakMap();
  var nextNodeId = 1;

  function nodeId(node) {
    if (!node) return 0;
    if (!nodeIds.has(node)) {
      nodeIds.set(node, nextNodeId);
      nextNodeId += 1;
    }
    return nodeIds.get(node);
  }

  function clean(text) {
    return String(text == null ? '' : text)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanQuestion(text) {
    return clean(text)
      .replace(/\s*\*\s*$/, '')
      .replace(/\s*\((required|optional)\)\s*$/i, '')
      .replace(/\s+(required|optional)\s*$/i, '')
      .trim();
  }

  function truncate(text, max) {
    var value = clean(text);
    if (value.length <= max) return value;
    return value.slice(0, max - 1).trim() + '\u2026';
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function visibleBasics(el) {
    if (!el || !el.isConnected) return false;
    var style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (!visibleBasics(el)) {
      // A visually hidden native radio/checkbox often has a visible label.
      if (el.matches && el.matches('input[type="radio"], input[type="checkbox"]')) {
        var labels = el.labels ? Array.prototype.slice.call(el.labels) : [];
        if (labels.some(visibleBasics)) return true;
        var wrapper = el.closest('label, [role="radio"], [role="checkbox"]');
        if (wrapper && wrapper !== el && visibleBasics(wrapper)) return true;
      }
      return false;
    }
    return true;
  }

  function isExcluded(el) {
    if (el.closest('header, nav, footer, [role="search"], [aria-hidden="true"], [inert], script, style, noscript, template')) {
      return true;
    }
    return false;
  }

  function textWithoutControls(el) {
    if (!el) return '';
    var clone = el.cloneNode(true);
    var removable = clone.querySelectorAll(
      'input, textarea, select, button, script, style, [role="radio"], [role="checkbox"], [role="option"]'
    );
    Array.prototype.forEach.call(removable, function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    return clean(clone.textContent);
  }

  function addText(list, text, weight, source) {
    var value = cleanQuestion(text);
    if (!value || value.length > 400) return;
    var normalized = M.normalize(value);
    if (!normalized) return;

    // "Your answer" and similar placeholders are not question labels. They are
    // intentionally ignored so Google Forms relies on the surrounding heading.
    if ((source === 'placeholder' || source === 'aria-label') &&
        /^(your answer|answer|enter your answer|type your answer|type here|write here|search|search\s*)$/.test(normalized)) {
      return;
    }

    for (var i = 0; i < list.length; i += 1) {
      if (M.normalize(list[i].text) === normalized) {
        if (weight > list[i].weight) {
          list[i].weight = weight;
          list[i].source = source;
        }
        return;
      }
    }
    list.push({ text: value, weight: weight, source: source });
  }

  function getQuestionRoot(el) {
    if (!el) return null;
    return el.closest('[role="listitem"]') ||
      el.closest('.freebirdFormviewerComponentsQuestionBaseRoot') ||
      null;
  }

  function isGoogleGrid(root) {
    return !!(root && root.querySelector('[role="grid"]'));
  }

  function resolveLabelledBy(idText) {
    if (!idText) return [];
    var root = document;
    return String(idText)
      .split(/\s+/)
      .map(function (id) { return root.getElementById(id); })
      .filter(Boolean);
  }

  function nearbyText(base, maxDepth) {
    var out = [];
    var node = base;
    var depthLimit = typeof maxDepth === 'number' ? maxDepth : 2;

    for (var depth = 0; depth < depthLimit; depth += 1) {
      var parent = node.parentElement;
      if (!parent) break;
      var children = Array.prototype.slice.call(parent.children);
      var index = children.indexOf(node);
      for (var i = index - 1; i >= 0 && i >= index - 2; i -= 1) {
        var sibling = children[i];
        if (sibling.matches('input, textarea, select, button, [role="button"], [role="radio"], [role="checkbox"], [role="option"]')) {
          continue;
        }
        if (sibling.querySelector('input, textarea, select, button, [role="button"], [role="radio"], [role="checkbox"]')) {
          continue;
        }
        var value = clean(sibling.innerText || sibling.textContent);
        if (value && value.length <= 180) {
          addText(out, value, depth === 0 ? 0.45 : 0.25, 'nearby');
          break;
        }
      }
      node = parent;
    }
    return out;
  }

  /**
   * Collect possible question labels for one control or one radio/checkbox group.
   * For Google Forms the heading inside the question's [role=listitem] is the
   * authoritative label; placeholders like "Your answer" are only a weak hint.
   */
  function collectLabelTexts(anchor, options) {
    options = options || {};
    var groupEl = options.groupEl || null;
    var isGroup = !!options.isGroup;
    var sourceEl = groupEl || anchor;
    var out = [];
    var root = getQuestionRoot(anchor) || (groupEl ? getQuestionRoot(groupEl) : null);

    if (root) {
      if (isGoogleGrid(root)) {
        return { texts: [], grid: true };
      }
      var heading = root.querySelector('[role="heading"]');
      if (heading) {
        addText(out, textWithoutControls(heading), 1, 'question');
      }
      var description = root.querySelector(
        '[class*="QuestionBaseDescription"], [data-testid*="description"], [class*="questionDescription"]'
      );
      if (description) {
        addText(out, textWithoutControls(description), 0.35, 'description');
      }
    }

    var labelledBy = sourceEl.getAttribute('aria-labelledby') || anchor.getAttribute('aria-labelledby');
    resolveLabelledBy(labelledBy).forEach(function (node) {
      addText(out, textWithoutControls(node), 1, 'aria-labelledby');
    });

    addText(out, sourceEl.getAttribute('aria-label'), 0.9, 'aria-label');
    if (anchor !== sourceEl) addText(out, anchor.getAttribute('aria-label'), 0.9, 'aria-label');

    if (!isGroup) {
      if (anchor.labels) {
        Array.prototype.forEach.call(anchor.labels, function (label) {
          addText(out, textWithoutControls(label), 1, 'label');
        });
      }
      if (anchor.id) {
        var escapedId = window.CSS && window.CSS.escape ? window.CSS.escape(anchor.id) : anchor.id.replace(/"/g, '\\"');
        var explicitLabels = document.querySelectorAll('label[for="' + escapedId + '"]');
        Array.prototype.forEach.call(explicitLabels, function (label) {
          addText(out, textWithoutControls(label), 1, 'label');
        });
      }
      addText(out, anchor.getAttribute('placeholder'), 0.5, 'placeholder');
      addText(out, anchor.getAttribute('title'), 0.35, 'title');
      addText(out, M.humanize(anchor.getAttribute('name')), 0.55, 'name');
      addText(out, M.humanize(anchor.id), 0.55, 'id');
    } else {
      addText(out, M.humanize(sourceEl.getAttribute('name')), 0.55, 'name');
      addText(out, M.humanize(sourceEl.id), 0.55, 'id');
    }

    var fieldset = sourceEl.closest('fieldset');
    if (fieldset) {
      var legend = fieldset.querySelector('legend');
      if (legend) addText(out, textWithoutControls(legend), 1, 'legend');
    }

    nearbyText(sourceEl).forEach(function (item) {
      addText(out, item.text, item.weight, item.source);
    });

    return { texts: out, grid: false };
  }

  function pickQuestion(texts, fallbackEl) {
    var sorted = texts.slice().sort(function (a, b) { return b.weight - a.weight; });
    for (var i = 0; i < sorted.length; i += 1) {
      var value = cleanQuestion(sorted[i].text);
      if (value && value.length >= 2) return truncate(value, MAX_LABEL_LENGTH);
    }
    if (fallbackEl) {
      var fallback = M.humanize(fallbackEl.getAttribute && (fallbackEl.getAttribute('name') || fallbackEl.id));
      if (fallback) return truncate(fallback, MAX_LABEL_LENGTH);
    }
    return 'Unnamed field';
  }

  function optionInfo(el) {
    var dataValue = el.getAttribute('data-value') || el.getAttribute('data-value-text') || '';
    var nativeValue = '';
    if (el.matches('input[type="radio"], input[type="checkbox"]')) {
      nativeValue = el.getAttribute('value') || '';
      if (nativeValue === 'on') nativeValue = '';
    }

    var text = clean(el.getAttribute('aria-label'));
    if (!text) {
      if (el.labels && el.labels.length) {
        var labelled = textWithoutControls(el.labels[0]);
        if (labelled) text = labelled;
      }
    }
    if (!text) {
      var wrapper = el.closest('label');
      if (wrapper && wrapper !== el) text = textWithoutControls(wrapper);
    }
    if (!text) text = textWithoutControls(el);
    if (!text && el.parentElement) text = clean(el.parentElement.innerText || el.parentElement.textContent);
    if (!text) text = dataValue || nativeValue;

    return {
      text: truncate(text, 160),
      value: dataValue || nativeValue
    };
  }

  function isOptionSelected(el) {
    if (el.matches('input[type="radio"], input[type="checkbox"]')) return !!el.checked;
    if (el.getAttribute('aria-checked') === 'true') return true;
    if (el.getAttribute('data-checked') === 'true') return true;
    var native = el.querySelector('input[type="radio"], input[type="checkbox"]');
    return !!(native && native.checked);
  }

  function groupContainer(el, kind) {
    var container = el.closest('[role="radiogroup"], [role="group"]');
    if (container) return container;
    var root = getQuestionRoot(el);
    if (root) return root;
    return el.parentElement || el;
  }

  function groupKey(el, kind) {
    if (el.name) {
      return kind + ':name:' + nodeId(el.form) + ':' + el.name;
    }
    return kind + ':node:' + nodeId(groupContainer(el, kind));
  }

  function nativeOptions(select) {
    return Array.prototype.map.call(select.options, function (option) {
      return { text: clean(option.textContent), value: option.value };
    });
  }

  function getSelectedOptionText(control) {
    if (control.tagName === 'INPUT' && typeof control.value === 'string' && control.value.trim()) {
      return clean(control.value);
    }
    var selected = control.querySelector('[role="option"][aria-selected="true"]');
    if (selected) return clean(selected.textContent);
    var options = control.querySelectorAll('[role="option"]');
    if (options.length === 1) return clean(options[0].textContent);
    return '';
  }

  function isPlaceholderOption(text) {
    var normalized = M.normalize(text);
    return !normalized ||
      normalized === 'choose' ||
      normalized === 'select' ||
      normalized === 'select an option' ||
      normalized === 'please select' ||
      normalized === 'none' ||
      normalized.indexOf('select ') === 0;
  }

  function visibleRoleOptions(control) {
    var selector = '[role="option"], [role="menuitemradio"], [role="menuitem"]';
    var nodes = [];
    var seen = new Set();

    function add(node) {
      if (seen.has(node)) return;
      seen.add(node);
      nodes.push(node);
    }

    if (control) {
      Array.prototype.forEach.call(control.querySelectorAll(selector), add);
    }

    // Portaled menus (including the local fixture) live outside the control.
    // Do not pull in options from a different, still-closed ARIA listbox.
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (node) {
      if (control && control.contains(node)) return;
      var owner = node.closest('[role="listbox"], [role="combobox"]');
      if (owner && owner !== control && owner.getAttribute('aria-expanded') === 'false') return;
      add(node);
    });

    var out = [];
    nodes.forEach(function (node) {
      if (out.length >= MAX_OPTIONS) return;
      if (!isVisible(node)) return;
      var text = clean(node.innerText || node.textContent);
      if (!text) return;
      out.push({
        element: node,
        text: truncate(text, 160),
        value: node.getAttribute('data-value') || ''
      });
    });
    return out;
  }

  function simulateClick(el) {
    if (!el) return;
    if (el.matches('input[type="radio"], input[type="checkbox"], button, a')) {
      el.click();
      return;
    }
    var options = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new MouseEvent('mousedown', options));
      el.dispatchEvent(new MouseEvent('mouseup', options));
      el.dispatchEvent(new MouseEvent('click', options));
    } catch (ignored) {
      try { el.click(); } catch (alsoIgnored) { /* ignore */ }
    }
  }

  function closeCustomDropdown(control, root) {
    try {
      var event = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(event);
      control.dispatchEvent(event);
    } catch (ignored) {
      // Synthetic Escape is best-effort only.
    }
    var heading = root ? root.querySelector('[role="heading"]') : null;
    if (heading) {
      try { heading.click(); } catch (ignored) { /* ignore */ }
    }
  }

  function dispatchTextEvents(el, value) {
    try {
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: value
      }));
    } catch (ignored) {
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function setNativeValue(el, value) {
    var prototype = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  function validateTextValue(key, value, el) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return { ok: false, reason: 'Saved value is empty' };

    if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return { ok: false, reason: 'Saved email does not look valid' };
    }

    if (key === 'phone' && /[a-z]/i.test(text)) {
      return { ok: false, reason: 'Saved phone contains letters' };
    }

    if (key === 'graduationYear' && !/^(19|20)\d{2}$/.test(text)) {
      return { ok: false, reason: 'Saved graduation year is not a four-digit year' };
    }

    if (key === 'cgpa' && (text.match(/[^0-9.]/g) || !isFinite(Number(text)))) {
      return { ok: false, reason: 'Saved CGPA is not numeric' };
    }

    if (el && el.maxLength > 0 && text.length > el.maxLength) {
      return { ok: false, reason: 'Value is longer than this field allows' };
    }

    if (el && el.pattern) {
      try {
        var pattern = new RegExp('^(?:' + el.pattern + ')$');
        if (!pattern.test(text)) {
          return { ok: false, reason: 'Value does not match this field\u2019s pattern' };
        }
      } catch (ignored) {
        // A malformed page pattern should not block filling.
      }
    }

    return { ok: true, value: text };
  }

  function isLikelyAuthField(el) {
    var form = el.closest('form');
    if (!form || !form.querySelector('input[type="password"]')) return false;
    var count = form.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'
    ).length;
    return count <= 4;
  }

  function collectDescriptors() {
    var nodes = document.querySelectorAll(
      'input, textarea, select, [role="radio"], [role="checkbox"], [role="combobox"], [role="listbox"]'
    );
    var descriptors = [];
    var groups = new Map();
    var seen = new Set();
    var ignored = 0;

    function addGroup(el, kind) {
      var key = groupKey(el, kind);
      var container = groupContainer(el, kind);
      var group = groups.get(key);
      if (!group) {
        group = { kind: kind, container: container, elements: [] };
        groups.set(key, group);
      }
      if (group.elements.indexOf(el) === -1) group.elements.push(el);
      seen.add(el);
    }

    Array.prototype.forEach.call(nodes, function (el) {
      if (!el || !el.isConnected || seen.has(el)) return;
      if (isExcluded(el) || !isVisible(el)) return;

      var tag = el.tagName;
      var role = (el.getAttribute('role') || '').toLowerCase();

      if (tag === 'INPUT') {
        var type = (el.getAttribute('type') || 'text').toLowerCase();
        if (type === 'radio' || type === 'checkbox') {
          addGroup(el, type);
          return;
        }
        if (type === 'search') {
          ignored += 1;
          return;
        }
        if (['hidden', 'submit', 'reset', 'button', 'image', 'file', 'password', 'date', 'time',
          'datetime-local', 'month', 'week', 'color', 'range'].indexOf(type) !== -1) {
          if (type !== 'hidden') ignored += 1;
          return;
        }
        if (['text', 'email', 'tel', 'url', 'number'].indexOf(type) === -1) {
          ignored += 1;
          return;
        }
        var inputLabels = collectLabelTexts(el);
        if (inputLabels.grid) {
          ignored += 1;
          return;
        }
        descriptors.push({
          kind: 'text',
          element: el,
          inputType: type,
          hintType: type,
          texts: inputLabels.texts,
          label: pickQuestion(inputLabels.texts, el)
        });
        seen.add(el);
        return;
      }

      if (tag === 'TEXTAREA') {
        if (el.readOnly || el.disabled) return;
        var areaLabels = collectLabelTexts(el);
        if (areaLabels.grid) {
          ignored += 1;
          return;
        }
        descriptors.push({
          kind: 'text',
          element: el,
          inputType: 'textarea',
          hintType: 'textarea',
          texts: areaLabels.texts,
          label: pickQuestion(areaLabels.texts, el)
        });
        seen.add(el);
        return;
      }

      if (tag === 'SELECT') {
        if (el.multiple) {
          ignored += 1;
          return;
        }
        var selectLabels = collectLabelTexts(el);
        if (selectLabels.grid) {
          ignored += 1;
          return;
        }
        descriptors.push({
          kind: 'select',
          element: el,
          hintType: 'select',
          texts: selectLabels.texts,
          label: pickQuestion(selectLabels.texts, el),
          options: nativeOptions(el)
        });
        seen.add(el);
        return;
      }

      if (role === 'radio' || role === 'checkbox') {
        // Prefer a native input nested inside a styled option if one exists.
        if (el.querySelector('input[type="radio"], input[type="checkbox"]')) return;
        addGroup(el, role);
        return;
      }

      if (role === 'combobox' || role === 'listbox') {
        if (role === 'listbox' && el.closest('[role="combobox"]')) return;
        if (role === 'listbox' && el.getAttribute('aria-expanded') === null &&
            !el.closest('.quantumWizMenuPaperselectEl')) {
          return;
        }
        var selectLabelsCustom = collectLabelTexts(el);
        if (selectLabelsCustom.grid) {
          ignored += 1;
          return;
        }
        descriptors.push({
          kind: 'custom-select',
          element: el,
          hintType: 'select',
          texts: selectLabelsCustom.texts,
          label: pickQuestion(selectLabelsCustom.texts, el)
        });
        seen.add(el);
      }
    });

    groups.forEach(function (group) {
      var visibleElements = group.elements.filter(function (el) {
        return el.isConnected && (isVisible(el) || isOptionSelected(el));
      });
      if (!visibleElements.length) return;
      var first = visibleElements[0];
      var collected = collectLabelTexts(first, {
        groupEl: group.container,
        isGroup: true
      });
      if (collected.grid) {
        ignored += 1;
        return;
      }
      descriptors.push({
        kind: group.kind,
        elements: visibleElements,
        hintType: group.kind,
        texts: collected.texts,
        label: pickQuestion(collected.texts, group.container),
        options: visibleElements.map(optionInfo)
      });
    });

    return { descriptors: descriptors, ignored: ignored };
  }

  function fillText(descriptor, match, profile, overwrite) {
    var el = descriptor.element;
    var key = match.key;
    var raw = profile[key];
    if (!raw || !String(raw).trim()) {
      return { ok: false, reason: 'No saved ' + match.fieldLabel.toLowerCase() };
    }
    if (el.disabled || el.readOnly) {
      return { ok: false, reason: 'Field is read-only or disabled' };
    }
    if (!overwrite && String(el.value || '').trim()) {
      return { ok: false, reason: 'Already contains a value' };
    }
    if (isLikelyAuthField(el)) {
      return { ok: false, reason: 'Looks like a login/signup form' };
    }

    var value = M.formatValue(key, raw);
    var validation = validateTextValue(key, value, el);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    value = validation.value;

    if (el.type === 'url') {
      try {
        new URL(value);
      } catch (ignored) {
        return { ok: false, reason: 'Saved URL is not valid for this field' };
      }
    }

    try {
      el.focus({ preventScroll: true });
      setNativeValue(el, value);
      dispatchTextEvents(el, value);
    } catch (ignored) {
      return { ok: false, reason: 'Browser blocked setting this field' };
    }

    if (String(el.value || '').trim() !== value.trim()) {
      return { ok: false, reason: 'Field did not accept the value' };
    }

    return { ok: true, detail: match.fieldLabel };
  }

  function fillNativeSelect(descriptor, match, profile, overwrite) {
    var el = descriptor.element;
    var key = match.key;
    var raw = profile[key];
    if (!raw || !String(raw).trim()) {
      return { ok: false, reason: 'No saved ' + match.fieldLabel.toLowerCase() };
    }
    if (el.disabled) return { ok: false, reason: 'Field is disabled' };
    if (!overwrite && el.value && !isPlaceholderOption(getSelectedOptionText(el))) {
      return { ok: false, reason: 'Already has a selection' };
    }

    var options = nativeOptions(el);
    var index = M.findOption(key, raw, options);
    if (index === -1) return { ok: false, reason: 'No confident option match' };

    var option = el.options[index];
    if (!option || option.disabled) return { ok: false, reason: 'Matching option is disabled' };

    try {
      var descriptorValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
      if (descriptorValue && descriptorValue.set) {
        descriptorValue.set.call(el, option.value);
      }
      el.selectedIndex = index;
      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    } catch (ignored) {
      return { ok: false, reason: 'Browser blocked setting this field' };
    }

    if (el.selectedIndex !== index) {
      return { ok: false, reason: 'Dropdown did not accept the option' };
    }
    return { ok: true, detail: match.fieldLabel };
  }

  async function fillChoiceGroup(descriptor, match, profile, overwrite) {
    var key = match.key;
    var raw = profile[key];
    if (!raw || !String(raw).trim()) {
      return { ok: false, reason: 'No saved ' + match.fieldLabel.toLowerCase() };
    }

    var selected = descriptor.elements.filter(isOptionSelected);
    if (selected.length && !overwrite) {
      return { ok: false, reason: 'Already has a selection' };
    }

    var index = M.findOption(key, raw, descriptor.options);
    if (index === -1) return { ok: false, reason: 'No confident option match' };

    var target = descriptor.elements[index];
    if (!target) return { ok: false, reason: 'Matching option is unavailable' };

    try {
      simulateClick(target);
    } catch (ignored) {
      return { ok: false, reason: 'Browser blocked selecting this option' };
    }

    if (!isOptionSelected(target)) {
      try {
        var label = target.closest('label') || (target.labels && target.labels[0]);
        if (label && label !== target) simulateClick(label);
      } catch (ignored) {
        // Best effort.
      }
    }

    await sleep(40);

    return {
      ok: isOptionSelected(target),
      reason: isOptionSelected(target) ? '' : 'Option could not be selected',
      detail: match.fieldLabel
    };
  }

  async function fillCheckboxGroup(descriptor, profile, overwrite) {
    // A checkbox that explicitly consents to recording the respondent's email
    // address is checked automatically. It is not a profile-value match, and it
    // deliberately runs before the general multi-select heuristics.
    var consentMatched = 0;
    var consentAlready = 0;
    var consentChecked = 0;
    for (var consentIndex = 0; consentIndex < descriptor.options.length; consentIndex += 1) {
      if (!M.isEmailConsentOption(descriptor.options[consentIndex].text)) continue;
      consentMatched += 1;
      var consentEl = descriptor.elements[consentIndex];
      if (!consentEl) continue;
      if (isOptionSelected(consentEl)) {
        consentAlready += 1;
        continue;
      }
      try {
        simulateClick(consentEl);
        await sleep(25);
        if (isOptionSelected(consentEl)) consentChecked += 1;
      } catch (ignored) {
        // Best effort.
      }
    }

    function consentFailureReason() {
      if (consentMatched && consentAlready === consentMatched) return 'Email consent already checked';
      return 'Email consent could not be checked';
    }

    var context = M.normalize(descriptor.texts.map(function (item) { return item.text; }).join(' '));
    var multiSelectHint = /\b(which|select|choose|have|links?|profiles?|accounts?|platforms?|online|tools?|technolog)/.test(context);
    if (!multiSelectHint) {
      if (consentChecked) return { ok: true, detail: 'Checked email consent' };
      if (consentMatched) return { ok: false, reason: consentFailureReason() };
      return { ok: false, reason: 'Checkbox group is not a clear multi-select question' };
    }

    var changed = 0;
    var matched = 0;

    for (var index = 0; index < descriptor.options.length; index += 1) {
      var option = descriptor.options[index];
      var optionMatch = M.matchField([{ text: option.text, weight: 1 }], { type: 'checkbox' });
      if (!optionMatch) continue;
      var value = profile[optionMatch.key];
      if (!value || !String(value).trim()) continue;
      matched += 1;

      var el = descriptor.elements[index];
      if (isOptionSelected(el)) continue;
      try {
        simulateClick(el);
        await sleep(25);
        if (isOptionSelected(el)) changed += 1;
      } catch (ignored) {
        // Best effort.
      }
    }

    if (!matched) {
      if (consentChecked) return { ok: true, detail: 'Checked email consent' };
      if (consentMatched) return { ok: false, reason: consentFailureReason() };
      return { ok: false, reason: 'No confident option match' };
    }
    if (!changed) {
      if (consentChecked) return { ok: true, detail: 'Checked email consent' };
      return { ok: false, reason: 'Options were already selected' };
    }
    return {
      ok: true,
      detail: 'Checked ' + changed + ' option' + (changed === 1 ? '' : 's') +
        (consentChecked ? ' and email consent' : '')
    };
  }

  async function fillCustomSelect(descriptor, match, profile, overwrite) {
    var el = descriptor.element;
    var key = match.key;
    var raw = profile[key];
    if (!raw || !String(raw).trim()) {
      return { ok: false, reason: 'No saved ' + match.fieldLabel.toLowerCase() };
    }
    if (el.getAttribute('aria-disabled') === 'true') {
      return { ok: false, reason: 'Field is disabled' };
    }

    var current = getSelectedOptionText(el);
    if (!overwrite && current && !isPlaceholderOption(current)) {
      return { ok: false, reason: 'Already has a selection' };
    }

    var root = getQuestionRoot(el);
    var expanded = el.getAttribute('aria-expanded');

    // Google Forms keeps every option in the DOM while the menu is closed.
    // Open the control first so the option is actually interactive.
    if (expanded !== 'true') {
      try {
        simulateClick(el);
      } catch (ignored) {
        return { ok: false, reason: 'Browser blocked opening this dropdown' };
      }
      await sleep(180);
    }

    var existing = visibleRoleOptions(el);
    var index = M.findOption(key, raw, existing);

    if (index === -1) {
      closeCustomDropdown(el, root);
      return { ok: false, reason: 'No confident option match' };
    }

    var target = existing[index];
    if (!target) {
      closeCustomDropdown(el, root);
      return { ok: false, reason: 'Matching option is unavailable' };
    }

    try {
      simulateClick(target.element);
    } catch (ignored) {
      closeCustomDropdown(el, root);
      return { ok: false, reason: 'Browser blocked selecting this option' };
    }

    await sleep(120);
    var after = getSelectedOptionText(el);
    var normalizedAfter = M.normalize(after);
    var normalizedTarget = M.normalize(target.text);
    var selectedOkay = target.element.getAttribute('aria-selected') === 'true' ||
      (!!normalizedAfter && (
        normalizedAfter.indexOf(normalizedTarget) !== -1 ||
        normalizedTarget.indexOf(normalizedAfter) !== -1
      ));

    if (!selectedOkay) closeCustomDropdown(el, root);

    return {
      ok: selectedOkay,
      reason: selectedOkay ? '' : 'Dropdown did not show the selected option',
      detail: match.fieldLabel
    };
  }

  function summaryLabel(descriptor) {
    return truncate(cleanQuestion(descriptor.label) || 'Unnamed field', MAX_LABEL_LENGTH);
  }

  async function run(profile, overwrite, customFields) {
    profile = profile || {};
    overwrite = !!overwrite;
    customFields = Array.isArray(customFields) ? customFields : [];

    var summary = {
      ok: true,
      platform: 'Standard HTML form',
      url: location.href,
      title: document.title,
      detected: 0,
      filled: [],
      skipped: [],
      ignored: 0,
      notes: []
    };

    if (location.hostname === 'docs.google.com' && location.pathname.indexOf('/forms/') !== -1) {
      summary.platform = 'Google Forms';
    } else if (document.querySelector('[role="listitem"] [role="heading"]') &&
               document.querySelector('input[placeholder="Your answer"], textarea[placeholder="Your answer"]')) {
      summary.platform = 'Google Forms markup';
    }

    if (window.top !== window.self) {
      summary.notes.push('This result came from an embedded frame.');
    }

    var collected = collectDescriptors();
    summary.detected = collected.descriptors.length;
    summary.ignored = collected.ignored;

    for (var i = 0; i < collected.descriptors.length; i += 1) {
      var descriptor = collected.descriptors[i];
      var label = summaryLabel(descriptor);

      var result;

      // Checkbox groups are multi-select questions. They are handled by matching
      // each option to a saved profile value, so they do not need one group-level
      // attribute match.
      if (descriptor.kind === 'checkbox') {
        try {
          result = await fillCheckboxGroup(descriptor, profile, overwrite);
        } catch (error) {
          result = { ok: false, reason: 'Unexpected error while filling this field' };
        }
        if (result.ok) {
          summary.filled.push({ label: label, field: result.detail || 'Checkbox options' });
        } else {
          summary.skipped.push({ label: label, reason: result.reason || 'Skipped' });
        }
        continue;
      }

      if (!descriptor.texts.length && descriptor.hintType !== 'email' && descriptor.hintType !== 'tel') {
        summary.skipped.push({ label: label, reason: 'Could not determine a question label' });
        continue;
      }

      var match = M.matchField(descriptor.texts, { type: descriptor.hintType });

      // If the built-in matcher finds nothing, try custom fields.
      if (!match && descriptor.texts.length) {
        var cfMatch = M.matchCustomField(customFields, descriptor.texts);
        if (cfMatch) {
          // Treat the custom field as a virtual match.
          var cfValue = String(cfMatch.value || '').trim();
          if (cfValue) {
            try {
              var cfResult;
              if (descriptor.kind === 'text') {
                // Reuse fillText logic inline: respect overwrite, write value.
                var el = descriptor.element;
                if (el.disabled || el.readOnly) {
                  cfResult = { ok: false, reason: 'Field is read-only or disabled' };
                } else if (!overwrite && String(el.value || '').trim()) {
                  cfResult = { ok: false, reason: 'Already contains a value' };
                } else {
                  try {
                    el.focus({ preventScroll: true });
                    setNativeValue(el, cfValue);
                    dispatchTextEvents(el, cfValue);
                    cfResult = String(el.value || '').trim() === cfValue
                      ? { ok: true, detail: cfMatch.label }
                      : { ok: false, reason: 'Field did not accept the value' };
                  } catch (ignored) {
                    cfResult = { ok: false, reason: 'Browser blocked setting this field' };
                  }
                }
              } else if (descriptor.kind === 'select') {
                var selEl = descriptor.element;
                if (selEl.disabled) {
                  cfResult = { ok: false, reason: 'Field is disabled' };
                } else if (!overwrite && selEl.value && !isPlaceholderOption(getSelectedOptionText(selEl))) {
                  cfResult = { ok: false, reason: 'Already has a selection' };
                } else {
                  var cfOptIdx = M.findCustomOption(cfValue, nativeOptions(selEl));
                  if (cfOptIdx === -1) {
                    cfResult = { ok: false, reason: 'No confident option match' };
                  } else {
                    var cfOpt = selEl.options[cfOptIdx];
                    if (!cfOpt || cfOpt.disabled) {
                      cfResult = { ok: false, reason: 'Matching option is disabled' };
                    } else {
                      try {
                        var selDesc = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
                        if (selDesc && selDesc.set) selDesc.set.call(selEl, cfOpt.value);
                        selEl.selectedIndex = cfOptIdx;
                        selEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                        selEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                        cfResult = selEl.selectedIndex === cfOptIdx
                          ? { ok: true, detail: cfMatch.label }
                          : { ok: false, reason: 'Dropdown did not accept the option' };
                      } catch (ignored) {
                        cfResult = { ok: false, reason: 'Browser blocked setting this field' };
                      }
                    }
                  }
                }
              } else if (descriptor.kind === 'radio') {
                var selected = descriptor.elements.filter(isOptionSelected);
                if (selected.length && !overwrite) {
                  cfResult = { ok: false, reason: 'Already has a selection' };
                } else {
                  var cfRadioIdx = M.findCustomOption(cfValue, descriptor.options);
                  if (cfRadioIdx === -1) {
                    cfResult = { ok: false, reason: 'No confident option match' };
                  } else {
                    var cfTarget = descriptor.elements[cfRadioIdx];
                    if (!cfTarget) {
                      cfResult = { ok: false, reason: 'Matching option is unavailable' };
                    } else {
                      try { simulateClick(cfTarget); } catch (ignored) { /* best effort */ }
                      await sleep(40);
                      cfResult = isOptionSelected(cfTarget)
                        ? { ok: true, detail: cfMatch.label }
                        : { ok: false, reason: 'Option could not be selected' };
                    }
                  }
                }
              } else if (descriptor.kind === 'custom-select') {
                var csEl = descriptor.element;
                var csCurrent = getSelectedOptionText(csEl);
                if (!overwrite && csCurrent && !isPlaceholderOption(csCurrent)) {
                  cfResult = { ok: false, reason: 'Already has a selection' };
                } else {
                  var csRoot = getQuestionRoot(csEl);
                  if (csEl.getAttribute('aria-expanded') !== 'true') {
                    try { simulateClick(csEl); } catch (ignored) { /* ignore */ }
                    await sleep(180);
                  }
                  var csExisting = visibleRoleOptions(csEl);
                  var csIdx = M.findCustomOption(cfValue, csExisting);
                  if (csIdx === -1) {
                    closeCustomDropdown(csEl, csRoot);
                    cfResult = { ok: false, reason: 'No confident option match' };
                  } else {
                    var csTarget = csExisting[csIdx];
                    if (!csTarget) {
                      closeCustomDropdown(csEl, csRoot);
                      cfResult = { ok: false, reason: 'Matching option is unavailable' };
                    } else {
                      try { simulateClick(csTarget.element); } catch (ignored) { /* ignore */ }
                      await sleep(120);
                      var csAfter = M.normalize(getSelectedOptionText(csEl));
                      var csExpected = M.normalize(csTarget.text);
                      var csOk = csTarget.element.getAttribute('aria-selected') === 'true' ||
                        (!!csAfter && (csAfter.indexOf(csExpected) !== -1 || csExpected.indexOf(csAfter) !== -1));
                      if (!csOk) closeCustomDropdown(csEl, csRoot);
                      cfResult = csOk
                        ? { ok: true, detail: cfMatch.label }
                        : { ok: false, reason: 'Dropdown did not show the selected option' };
                    }
                  }
                }
              } else {
                cfResult = { ok: false, reason: 'Unsupported field type' };
              }
            } catch (error) {
              cfResult = { ok: false, reason: 'Unexpected error while filling this field' };
            }
            if (cfResult.ok) {
              summary.filled.push({ label: label, field: cfResult.detail || cfMatch.label });
            } else {
              summary.skipped.push({ label: label, reason: cfResult.reason || 'Skipped' });
            }
            continue;
          }
        }
      }

      if (!match) {
        summary.skipped.push({ label: label, reason: 'No matching profile field' });
        continue;
      }

      try {
        if (descriptor.kind === 'text') {
          result = fillText(descriptor, match, profile, overwrite);
        } else if (descriptor.kind === 'select') {
          result = fillNativeSelect(descriptor, match, profile, overwrite);
        } else if (descriptor.kind === 'radio') {
          result = await fillChoiceGroup(descriptor, match, profile, overwrite);
        } else if (descriptor.kind === 'custom-select') {
          result = await fillCustomSelect(descriptor, match, profile, overwrite);
        } else {
          result = { ok: false, reason: 'Unsupported field type' };
        }
      } catch (error) {
        result = { ok: false, reason: 'Unexpected error while filling this field' };
      }

      if (result.ok) {
        summary.filled.push({
          label: label,
          field: result.detail || match.fieldLabel
        });
      } else {
        summary.skipped.push({
          label: label,
          reason: result.reason || 'Skipped'
        });
      }
    }

    if (!summary.detected) {
      summary.notes.push('No visible fillable fields were found in this frame.');
    }

    summary.notes.push('Autofill does not submit forms. Review every answer before submitting.');

    return summary;
  }

  globalThis.AutofillFiller = { run: run };
})();
