#!/usr/bin/env node
import { fileURLToPath } from 'url';
import fs from 'fs';

async function deepPurge(channelId, botToken) {
  let totalDeleted = 0;
  // Logging via stderr to keep stdout clean for JSON output
  console.error(`[Purge] Starting bulk purge for channel: ${channelId}`);

  const authHeader = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`;
  const headers = { 'Authorization': authHeader, 'Content-Type': 'application/json' };

  const twoWeeksAgo = Date.now() - (13.9 * 24 * 60 * 60 * 1000);

  while (true) {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=100`, { headers });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
    const messages = await res.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      console.error('[Purge] No more messages found.');
      break;
    }

    const bulkIds = messages
      .filter(m => new Date(m.timestamp).getTime() > twoWeeksAgo)
      .map(m => m.id);
    
    const oldMessagesCount = messages.length - bulkIds.length;

    if (bulkIds.length === 0) {
       console.error(`[Purge] ${oldMessagesCount} messages are older than 14 days. Bulk delete not possible. Aborting.`);
       break;
    }

    if (bulkIds.length === 1) {
       const delRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${bulkIds[0]}`, { method: 'DELETE', headers });
       if (delRes.ok) {
         totalDeleted++;
       } else if (delRes.status === 429) {
         const err = await delRes.json();
         const retryAfter = err.retry_after || 2;
         console.error(`[Purge] Rate limit (Single)! Waiting ${retryAfter}s...`);
         await new Promise(r => setTimeout(r, retryAfter * 1000));
         continue;
       }
    } else {
       console.error(`[Purge] Deleting batch of ${bulkIds.length} messages...`);
       const bulkRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/bulk-delete`, {
         method: 'POST',
         headers,
         body: JSON.stringify({ messages: bulkIds })
       });

       if (!bulkRes.ok) {
         if (bulkRes.status === 429) {
            const err = await bulkRes.json();
            const retryAfter = err.retry_after || 2;
            console.error(`[Purge] Rate limit (Bulk)! Waiting ${retryAfter}s...`);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            continue; 
         }
         throw new Error(`Bulk Delete failed: ${bulkRes.status} ${await bulkRes.text()}`);
       }
       totalDeleted += bulkIds.length;
    }

    if (oldMessagesCount > 0) {
        console.error(`[Purge] ${oldMessagesCount} messages skipped (older than 14 days).`);
        break; 
    }

    await new Promise(r => setTimeout(r, 1500)); 
  }
  return totalDeleted;
}

// --- CLI WRAPPER (Robust: Symlink-Aware & Safe Check) ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1])) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
  const channel = process.argv[2] || process.env.DISCORD_CHANNEL;
  const token = process.env.DISCORD_TOKEN; 

  if (!channel || !token) {
    console.log(JSON.stringify({ status: "error", error: "DISCORD_TOKEN and DISCORD_CHANNEL required." }));
    process.exit(1);
  }

  deepPurge(channel, token).then(count => {
    console.log(JSON.stringify({ status: "success", deleted_count: count }));
    process.exit(0);
  }).catch(err => {
    console.log(JSON.stringify({ status: "error", error: err.message }));
    process.exit(1);
  });
}

export default deepPurge;
