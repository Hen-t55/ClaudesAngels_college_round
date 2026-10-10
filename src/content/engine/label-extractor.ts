import { extractColorBucket } from './color';

/**
 * Normalizes text for voice-command matching:
 * - Decodes unicode diacritics
 * - Collapses whitespace
 * - Converts to lowercase
 * - Strips leading/trailing punctuation while preserving alphanumeric words
 */
export function normalizeLabel(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps CSS color strings (rgb, rgba, hex, named colors) to standard color names.
 */
export function extractColorName(element: Element): string | undefined {
  return extractColorBucket(element);
}

/**
 * Label extraction according to W3C Accessible Name Computation hierarchy:
 * 1. aria-labelledby
 * 2. aria-label
 * 3. associated <label> element or wrapping <label>
 * 4. placeholder
 * 5. title
 * 6. alt attribute (for images/icons)
 * 7. value (for input buttons, submit, reset)
 * 8. innerText / textContent
 * 9. nearby text (preceding/following siblings or headings)
 */
export function extractLabel(el: Element): { raw: string; normalized: string } {
  const doc = el.ownerDocument || document;

  // 1. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts: string[] = [];
    for (const id of labelledBy.trim().split(/\s+/)) {
      const target = doc.getElementById(id);
      if (target) {
        const text = (target as HTMLElement).innerText || target.textContent || '';
        if (text.trim()) parts.push(text.trim());
      }
    }
    if (parts.length > 0) {
      const raw = parts.join(' ');
      return { raw, normalized: normalizeLabel(raw) };
    }
  }

  // 2. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    const raw = ariaLabel.trim();
    return { raw, normalized: normalizeLabel(raw) };
  }

  // 3. Associated <label>
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    // label for="id"
    if (el.id) {
      try {
        const labelEl = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelEl) {
          const text = (labelEl as HTMLElement).innerText || labelEl.textContent || '';
          if (text.trim()) {
            const raw = text.trim();
            return { raw, normalized: normalizeLabel(raw) };
          }
        }
      } catch {
        // Fallback if querySelector fails
      }
    }

    // Wrapped in <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      // Clone label and remove input itself to get just the label text
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
      const text = clone.innerText || clone.textContent || '';
      if (text.trim()) {
        const raw = text.trim();
        return { raw, normalized: normalizeLabel(raw) };
      }
    }
  }

  // 4. placeholder
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const placeholder = el.placeholder;
    if (placeholder && placeholder.trim()) {
      return { raw: placeholder.trim(), normalized: normalizeLabel(placeholder) };
    }
  }

  // 5. title
  const title = el.getAttribute('title');
  if (title && title.trim()) {
    return { raw: title.trim(), normalized: normalizeLabel(title) };
  }

  // 6. alt (for img or input type="image")
  const alt = el.getAttribute('alt');
  if (alt && alt.trim()) {
    return { raw: alt.trim(), normalized: normalizeLabel(alt) };
  }

  // 7. value for submit/button/reset inputs
  if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) {
    if (el.value && el.value.trim()) {
      return { raw: el.value.trim(), normalized: normalizeLabel(el.value) };
    }
  }

  // 8. innerText or textContent (excluding hidden children)
  const anyEl = el as any;
  const visibleText = anyEl.innerText || anyEl.textContent || '';
  if (visibleText && typeof visibleText === 'string' && visibleText.trim()) {
    const raw = visibleText.trim();
    return { raw, normalized: normalizeLabel(raw) };
  }

  // 9. Nested SVG title
  const svgTitle = el.querySelector('svg title');
  if (svgTitle && svgTitle.textContent?.trim()) {
    const raw = svgTitle.textContent.trim();
    return { raw, normalized: normalizeLabel(raw) };
  }

  // 10. Nearby text (preceding sibling or parent text)
  if (el.previousElementSibling instanceof HTMLElement) {
    const prevText = el.previousElementSibling.innerText || el.previousElementSibling.textContent || '';
    if (prevText.trim() && prevText.length < 50) {
      const raw = prevText.trim();
      return { raw, normalized: normalizeLabel(raw) };
    }
  }

  return { raw: '', normalized: '' };
}
