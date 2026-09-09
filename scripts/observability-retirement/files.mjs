import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const digest = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
export const identityHash = value => digest(Buffer.from(String(value)));
export function requireIdentity(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value)) throw new Error('IDENTITY_INVALID');
  return value;
}
export function stableStat(stat) { return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`; }

export class Inventory {
  roots = [];
  files = new Map();
  directories = new Map();
  blockers = [];
  bytesHashed = 0;
  paths = new Set();
  constructor(limits = {}) {
    this.limits = { maximumFiles: 10000, maximumTotalBytes: 256 * 1024 * 1024, maximumSnapshotBytes: 32 * 1024 * 1024, ...limits };
    for (const value of Object.values(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('INVENTORY_LIMIT_INVALID');
    }
  }
  block(code, subject) {
    const item = { code, subject };
    if (!this.blockers.some(existing => existing.code === code && existing.subject === subject)) this.blockers.push(item);
  }
  root(directory, owner, scan = true) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('ABSOLUTE_ROOT_REQUIRED');
    const canonical = path.resolve(directory);
    let cursor = path.parse(canonical).root;
    for (const segment of canonical.slice(cursor.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('ROOT_DIRECTORY_INVALID');
      this.pinDirectory(cursor, stat);
    }
    const existing = this.roots.find(root => root.path === canonical);
    if (existing) existing.scan ||= scan;
    else this.roots.push({ owner, path: canonical, scan });
    if (scan) this.walk(canonical);
    return canonical;
  }
  pinDirectory(directory, stat = fs.lstatSync(directory)) {
    const identity = `${stat.dev}:${stat.ino}`;
    if (!stat.isDirectory() || stat.isSymbolicLink()
      || (this.directories.has(directory) && this.directories.get(directory) !== identity)) throw new Error('SNAPSHOT_CHANGED');
    this.directories.set(directory, identity);
  }
  checkParents(file) {
    let directory = path.dirname(file);
    while (directory !== path.dirname(directory)) {
      if (this.directories.has(directory)) this.pinDirectory(directory);
      directory = path.dirname(directory);
    }
  }
  walk(directory, depth = 0) {
    this.checkParents(directory);
    this.pinDirectory(directory);
    if (depth > 64) { this.block('INVENTORY_DEPTH_LIMIT', directory); return; }
    const entries = [];
    const handle = fs.opendirSync(directory);
    try {
      for (;;) {
        const entry = handle.readSync();
        if (!entry) break;
        if (entries.length >= this.limits.maximumFiles) { this.block('INVENTORY_FILE_LIMIT', directory); break; }
        entries.push(entry.name);
      }
    } finally { handle.closeSync(); }
    entries.sort();
    for (const name of entries) {
      const file = path.join(directory, name);
      if (this.files.has(file)) continue;
      if (!this.paths.has(file) && this.paths.size >= this.limits.maximumFiles) { this.block('INVENTORY_FILE_LIMIT', directory); return; }
      this.paths.add(file);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) { this.block('NON_REGULAR_PATH', file); continue; }
      if (stat.isDirectory()) { this.walk(file, depth + 1); continue; }
      const item = { path: file, bytes: stat.size, hash: null, stamp: stableStat(stat), disposition: 'retain' };
      this.files.set(file, item);
      if (stat.size > this.limits.maximumTotalBytes - this.bytesHashed) { this.block('INVENTORY_BYTE_LIMIT', file); continue; }
      item.hash = this.hashFile(file, stat);
      this.bytesHashed += stat.size;
    }
  }
  hashFile(file, before) {
    this.checkParents(file);
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (stableStat(fs.fstatSync(fd)) !== stableStat(before)) throw new Error('SNAPSHOT_CHANGED');
      const hash = crypto.createHash('sha256');
      const buffer = Buffer.alloc(65536);
      let size = 0;
      for (;;) {
        const read = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (!read) break;
        size += read;
        if (size > before.size) throw new Error('SNAPSHOT_CHANGED');
        hash.update(buffer.subarray(0, read));
      }
      if (size !== before.size || stableStat(fs.fstatSync(fd)) !== stableStat(before)) throw new Error('SNAPSHOT_CHANGED');
      return `sha256:${hash.digest('hex')}`;
    } finally { fs.closeSync(fd); }
  }
  text(file) {
    this.checkParents(file);
    const item = this.files.get(file);
    if (!item?.hash) throw new Error('UNINVENTORIED_REFERENCE');
    if (item.bytes > this.limits.maximumSnapshotBytes) throw new Error('SNAPSHOT_BYTE_LIMIT');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (stableStat(fs.fstatSync(fd)) !== item.stamp) throw new Error('SNAPSHOT_CHANGED');
      const bytes = Buffer.alloc(item.bytes);
      let offset = 0;
      while (offset < bytes.length) {
        const read = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
        if (!read) throw new Error('SNAPSHOT_CHANGED');
        offset += read;
      }
      if (fs.readSync(fd, Buffer.alloc(1), 0, 1, null)) throw new Error('SNAPSHOT_CHANGED');
      if (digest(bytes) !== item.hash || stableStat(fs.fstatSync(fd)) !== item.stamp) throw new Error('SNAPSHOT_CHANGED');
      return bytes.toString('utf8');
    } finally { fs.closeSync(fd); }
  }
  json(file) { return JSON.parse(this.text(file)); }
  verifyUnchanged() {
    for (const directory of this.directories.keys()) {
      try { this.checkParents(directory); this.pinDirectory(directory); }
      catch { this.block('SNAPSHOT_CHANGED', directory); return; }
    }
    const before = new Set(this.files.keys());
    for (const root of this.roots) if (root.scan) {
      try { this.walk(root.path); } catch { this.block('SNAPSHOT_CHANGED', root.path); }
    }
    if (this.files.size !== before.size) this.block('SNAPSHOT_CHANGED', 'inventory');
    for (const item of this.files.values()) {
      try {
        const stat = fs.lstatSync(item.path);
        if (!stat.isFile() || stableStat(stat) !== item.stamp) this.block('SNAPSHOT_CHANGED', item.path);
      } catch { this.block('SNAPSHOT_CHANGED', item.path); }
    }
  }
  output() { return [...this.files.values()].map(({ stamp, ...item }) => item); }
}
