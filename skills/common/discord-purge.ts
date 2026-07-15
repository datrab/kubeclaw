#!/usr/bin/env node
import fs from 'fs';
import { fileURLToPath } from 'url';

type DiscordMessage = {
  id: string;
  timestamp: string;
};

type DiscordRateLimitBody = {
  retry_after?: number;
};

function isDiscordMessage(value: unknown): value is DiscordMessage {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { id?: unknown }).id === 'string'
    && typeof (value as { timestamp?: unknown }).timestamp === 'string';
}

async function readRateLimitBody(response: Response): Promise<DiscordRateLimitBody> {
  const body: unknown = await response.json();
  return typeof body === 'object' && body !== null ? body as DiscordRateLimitBody : {};
}

async function deepPurge(channelId: string, botToken: string): Promise<number> {
  if (!/^[0-9]+$/.test(channelId)) {
    throw new Error('Invalid Discord channel id.');
  }

  const encodedChannelId = encodeURIComponent(channelId);
  let totalDeleted = 0;
  // Logging via stderr to keep stdout clean for JSON output
  console.error(`[Purge] Starting bulk purge for channel: ${channelId}`);

  const authHeader = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`;
  const headers = { 'Authorization': authHeader, 'Content-Type': 'application/json' };

  const twoWeeksAgo = Date.now() - (13.9 * 24 * 60 * 60 * 1000);

  while (true) {
    const res = await fetch(`https://discord.com/api/v10/channels/${encodedChannelId}/messages?limit=100`, { headers });
    if (res.status === 429) {
      const err = await readRateLimitBody(res);
      const retryAfter = err.retry_after ?? 2;
      console.error(`[Purge] Rate limit (Fetch)! Waiting ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
    const rawMessages: unknown = await res.json();

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      console.error('[Purge] No more messages found.');
      break;
    }

    const messages = rawMessages.filter(isDiscordMessage);
    const bulkIds = messages
      .filter(m => new Date(m.timestamp).getTime() > twoWeeksAgo)
      .map(m => m.id);
    
    const oldMessagesCount = messages.length - bulkIds.length;

    if (bulkIds.length === 0) {
       console.error(`[Purge] ${oldMessagesCount} messages are older than 14 days. Bulk delete not possible. Aborting.`);
       break;
    }

    if (bulkIds.length === 1) {
       const delRes = await fetch(`https://discord.com/api/v10/channels/${encodedChannelId}/messages/${bulkIds[0]}`, { method: 'DELETE', headers });
       if (delRes.ok) {
         totalDeleted++;
       } else if (delRes.status === 429) {
         const err = await readRateLimitBody(delRes);
         const retryAfter = err.retry_after ?? 2;
         console.error(`[Purge] Rate limit (Single)! Waiting ${retryAfter}s...`);
         await new Promise(r => setTimeout(r, retryAfter * 1000));
         continue;
       } else {
         throw new Error(`Single Delete failed: ${delRes.status} ${await delRes.text()}`);
       }
    } else {
       console.error(`[Purge] Deleting batch of ${bulkIds.length} messages...`);
       const bulkRes = await fetch(`https://discord.com/api/v10/channels/${encodedChannelId}/messages/bulk-delete`, {
         method: 'POST',
         headers,
         body: JSON.stringify({ messages: bulkIds })
       });

       if (!bulkRes.ok) {
         if (bulkRes.status === 429) {
            const err = await readRateLimitBody(bulkRes);
            const retryAfter = err.retry_after ?? 2;
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
  const channel = process.argv[2] !== undefined ? process.argv[2] : process.env.DISCORD_CHANNEL;
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
