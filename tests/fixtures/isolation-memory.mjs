export async function execute(input) {
  const retained = [];
  if (input.mode === 'buffer') {
    for (;;) retained.push(Buffer.alloc(8 * 1024 * 1024, 1));
  }
  if (input.mode === 'heap') {
    for (;;) retained.push(Array.from({ length: 100000 }, (_, index) => ({ value: index, label: String(index) })));
  }
  return { memory: process.memoryUsage().rss };
}
