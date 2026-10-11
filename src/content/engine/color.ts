/**
 * Convert RGB to HSL and map into named color buckets:
 * red, orange, yellow, green, cyan, blue, purple, magenta, pink, black, white, gray
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
}

export function hslToColorBucket(h: number, s: number, l: number): string {
  // Achromatic checks (black, white, gray)
  if (l <= 0.15) return 'black';
  if (l >= 0.90) return 'white';
  if (s <= 0.15) return 'gray';

  // Chromatic hue buckets (0 - 360)
  if (h >= 345 || h < 15) return 'red';
  if (h >= 15 && h < 45) return 'orange';
  if (h >= 45 && h < 70) return 'yellow';
  if (h >= 70 && h < 165) return 'green';
  if (h >= 165 && h < 195) return 'cyan';
  if (h >= 195 && h < 260) return 'blue';
  if (h >= 260 && h < 290) return 'purple';
  if (h >= 290 && h < 330) return 'magenta';
  if (h >= 330 && h < 345) return 'pink';

  return 'gray';
}

export function extractColorBucket(element: Element): string | undefined {
  try {
    const win = element.ownerDocument?.defaultView || window;
    const style = win.getComputedStyle(element);

    const inlineStyle = element.getAttribute('style') || '';
    for (const colStr of [style.backgroundColor, style.color, style.borderColor, inlineStyle]) {
      if (!colStr) continue;
      const match = colStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
        if (a < 0.1 && colStr === style.backgroundColor) continue;

        const { h, s, l } = rgbToHsl(r, g, b);
        return hslToColorBucket(h, s, l);
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}
