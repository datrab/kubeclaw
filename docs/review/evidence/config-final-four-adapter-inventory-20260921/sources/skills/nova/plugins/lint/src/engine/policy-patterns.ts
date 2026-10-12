function globRegex(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern.charAt(index);
    if (char === '*' && pattern[index + 1] === '*') {
      const followedBySlash = pattern[index + 2] === '/';
      source += followedBySlash ? '(?:.*/)?' : '.*';
      index += followedBySlash ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else source += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

export function matchesPolicyPattern(file: string, pattern: string): boolean {
  return globRegex(pattern).test(file.replace(/\\/g, '/').replace(/^\.\//, ''));
}

export function policyIncludesFile(file: string, tool: Record<string, any>, globalExclusions: string[]): boolean {
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const targeted = tool.targets.some((target: string) => target === '.' || normalized === target || normalized.startsWith(`${target.replace(/\/$/, '')}/`));
  if (!targeted) return false;
  if ([...globalExclusions, ...tool.exclude].some((pattern: any) => matchesPolicyPattern(normalized, pattern))) return false;
  return tool.include.length === 0 || tool.include.some((pattern: string) => matchesPolicyPattern(normalized, pattern));
}
