function topLevelKeys(yamlText) {
  const keys = [];
  const seen = new Set();
  for (const line of yamlText.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s|$)/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      keys.push(match[1]);
    }
  }
  return keys;
}

function secretRefs(yamlText) {
  const refs = [];
  const lines = yamlText.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const key of ['existingSecret', 'secretName']) {
      const match = line.match(new RegExp(`${key}:\\s*"?([^"#]+?)"?\\s*(?:#.*)?$`));
      if (match && match[1].trim()) {
        refs.push({ key, value: match[1].trim(), line: index + 1 });
      }
    }
  }
  return refs;
}

export function yamlFileInventory(relPath, read) {
  const text = read(relPath);
  return {
    path: relPath,
    topLevelKeys: topLevelKeys(text),
    secretReferences: secretRefs(text),
  };
}
