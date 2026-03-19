#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

async function visualAudit(url, channelId, botToken, mode = 'image') {
  const isVideo = mode === 'video';
  const outputDir = path.join('/tmp', `audit-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });
  
  console.error(`[Audit] 📸 Starting headless audit (${mode}) of ${url}...`);

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  
  // Only enable recordVideo parameter in context for video mode
  const contextOptions = isVideo ? { recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } } } : {};
  const context = await browser.newContext(contextOptions);

  const page = await context.newPage();
  let fileToSend = null;
  let fileName = '';
  let mimeType = '';
  let messageContent = '';

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    
    if (isVideo) {
      // Video path: scroll, wait, and close context (forces Playwright to save)
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight || 1000));
      await page.waitForTimeout(3000); 
      await context.close(); 
      
      const files = fs.readdirSync(outputDir);
      const videoFile = files.find(f => f.endsWith('.webm'));
      if (!videoFile) throw new Error("Video could not be generated.");
      
      fileToSend = path.join(outputDir, videoFile);
      fileName = 'audit.webm';
      mimeType = 'video/webm';
      messageContent = `🎥 **Visual Audit Video Report**\n**Target:** \`${url}\``;
    } else {
      // Screenshot path: trigger fullpage screenshot directly
      fileToSend = path.join(outputDir, 'screenshot.png');
      await page.screenshot({ path: fileToSend, fullPage: true });
      await context.close();
      
      fileName = 'screenshot.png';
      mimeType = 'image/png';
      messageContent = `📸 **Visual Audit Image Report**\n**Target:** \`${url}\``;
    }
  } catch (e) {
    console.error(`[Audit] Warning while loading page: ${e.message}`);
  } finally {
    // Fallback in case the browser is still open
    if (browser.isConnected()) await browser.close();
  }

  // Validate that a file was produced
  if (!fileToSend || !fs.existsSync(fileToSend)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    throw new Error(`Audit file (${mode}) was not created.`);
  }

  // 25 MB Discord Limit Check
  const stats = fs.statSync(fileToSend);
  const fileSizeMB = stats.size / (1024 * 1024);

  console.error(`[Audit] 🚀 File generated (${fileSizeMB.toFixed(2)} MB). Sending to Discord...`);

  if (fileSizeMB > 25) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    throw new Error(`File is ${fileSizeMB.toFixed(2)} MB — too large for Discord (max 25 MB).`);
  }

  // Build payload
  const fileBuffer = fs.readFileSync(fileToSend);
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('files[0]', blob, fileName);
  formData.append('payload_json', JSON.stringify({ content: messageContent }));

  const authHeader = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`;
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': authHeader },
    body: formData
  });

  // Cleanup
  fs.rmSync(outputDir, { recursive: true, force: true });

  if (!res.ok) throw new Error(`Discord API Fehler: ${res.status} ${await res.text()}`);
  
  console.error(`[Audit] ✅ ${mode} sent successfully.`);
  return { status: "success", target_url: url, mode: mode, size_mb: fileSizeMB.toFixed(2) };
}

// --- CLI WRAPPER ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1])) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
  const args = process.argv.slice(2);
  // Find the URL (the first argument that doesn't start with '--')
  const url = args.find(a => !a.startsWith('--'));
  const modeFlagIndex = args.indexOf('--mode');
  const mode = modeFlagIndex > -1 && args[modeFlagIndex + 1] ? args[modeFlagIndex + 1] : 'image';

  const channel = process.env.DISCORD_CHANNEL;
  const token = process.env.DISCORD_TOKEN;

  if (!url) {
    console.log(JSON.stringify({ status: "error", error: "URL required as parameter." }));
    process.exit(1);
  }
  if (!channel || !token) {
    console.log(JSON.stringify({ status: "error", error: "DISCORD_TOKEN and DISCORD_CHANNEL are missing." }));
    process.exit(1);
  }
  if (!['image', 'video'].includes(mode)) {
    console.log(JSON.stringify({ status: "error", error: "--mode must be 'image' or 'video'." }));
    process.exit(1);
  }

  visualAudit(url, channel, token, mode).then(result => {
    console.log(JSON.stringify(result));
    process.exit(0);
  }).catch(err => {
    console.log(JSON.stringify({ status: "error", error: err.message }));
    process.exit(1);
  });
}

export default visualAudit;
