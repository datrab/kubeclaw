/** Browser-side checks. Keep each callback self-contained for Playwright serialization. */
export function interactiveFindings(elements: Element[]): string[] {
  return elements.flatMap((element, index) => {
    const labels =
      "labels" in element
        ? Array.from((element as HTMLInputElement).labels ?? [])
            .map((label) => label.textContent?.trim() ?? "")
            .join(" ")
            .trim()
        : "";
    let name = element.getAttribute("aria-label");
    if (!name) name = labels;
    if (!name) name = element.textContent?.trim() ?? "";
    if (!name) name = element.getAttribute("placeholder");
    if (!name) name = "";
    const findings: string[] = [];
    if (!name) findings.push(`interactive-${index}-missing-name`);
    if (element.getAttribute("tabindex") === "-1")
      findings.push(`interactive-${index}-not-keyboard-focusable`);
    const rect = (element as HTMLElement).getBoundingClientRect();
    if (rect.width < 24 || rect.height < 24) findings.push(`interactive-${index}-touch-target-too-small`);
    return findings;
  });
}

export function contrastFindings(): string[] {
  const parse = (value: string) => {
    const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/u);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]),
      match[4] === undefined ? 1 : Number(match[4])] as const : null;
  };
  const composite = (front: readonly number[], back: readonly number[]) => {
    const alpha = front[3] ?? 1, backAlpha = back[3] ?? 1;
    const outAlpha = alpha + backAlpha * (1 - alpha);
    return [0, 1, 2].map(index => outAlpha
      ? ((front[index] ?? 0) * alpha + (back[index] ?? 0) * backAlpha * (1 - alpha)) / outAlpha
      : 0).concat(outAlpha);
  };
  const lum = (rgb: readonly number[]) => {
    const c = rgb.map(v => { const n = v / 255; return n <= .03928 ? n / 12.92 : Math.pow((n + .055) / 1.055, 2.4); });
    return .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  };
  return Array.from(window.document.querySelectorAll<HTMLElement>(
    "h1,h2,h3,h4,h5,h6,p,label,button,a,[role=link],[role=tab]",
  )).flatMap((element, index) => {
    const s = getComputedStyle(element), fg = parse(s.color);
    let parent: HTMLElement | null = element, bg: readonly number[] | null = null;
    while (parent) {
      const parsed = parse(getComputedStyle(parent).backgroundColor);
      if (parsed && parsed[3] > 0) {
        bg = bg ? composite(bg, parsed) : parsed;
        if ((bg[3] ?? 0) >= 1) break;
      }
      parent = parent.parentElement;
    }
    if (!fg || !bg) return [];
    const effectiveFg = composite(fg, bg), a = lum(effectiveFg), b = lum(bg);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const size = Number.parseFloat(s.fontSize), weight = Number.parseInt(s.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700), minimum = large ? 3 : 4.5;
    return ratio < minimum ? [`content-${index}-contrast-${ratio.toFixed(2)}-minimum-${minimum}`] : [];
  });
}
