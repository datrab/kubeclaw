export async function execute(input, context) {
  if (input.mode === 'exit-rpc') {
    void context.invoke('test.read', { value: 'read' });
    setTimeout(() => process.exit(0), 30);
    await new Promise(() => {});
  }
  if (input.mode === 'early-result') {
    void context.invoke('test.read', {});
    return 'early';
  }
  if (input.mode === 'invalid') {
    process.stdout.write(Buffer.concat([Buffer.from('{"kind":"result","value":"'), Buffer.from(input.bytes), Buffer.from('"}\n')]));
    await new Promise(() => {});
  }
  if (input.mode === 'hang') {
    process.on('SIGTERM', () => {});
    await new Promise(() => { setInterval(() => {}, 1000); });
  }
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (value, ...args) => {
    const bytes = Buffer.from(value), start = bytes.indexOf(Buffer.from(input.character));
    if (start < 0) return write(value, ...args);
    const cut = start + input.split;
    write(bytes.subarray(0, cut));
    setTimeout(() => write(bytes.subarray(cut), ...args), 20);
    return true;
  };
  const response = await context.invoke('test.read', { text: input.character });
  await context.emit('test.event', {}, { text: input.character });
  return response.text;
}
