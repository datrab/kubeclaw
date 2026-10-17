/** Read actual PNG IHDR dimensions, not viewport/fullPage assumptions. No image allocation. */
export function pngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 33 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii',12,16) !== 'IHDR') throw new Error('PRISM_RENDER_PNG_DIMENSIONS_INVALID');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 2147483647 || height > 2147483647) throw new Error('PRISM_RENDER_PNG_DIMENSIONS_INVALID');
  return {width, height};
}
