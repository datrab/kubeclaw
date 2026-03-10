#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

async function visualAudit(url, channelId, botToken, mode = 'image') {
  const isVideo = mode === 'video';
  const outputDir = path.join('/tmp', `audit-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });
  
  console.error(`[Audit] 📸 Starte Headless-Audit (${mode}) von ${url}...`);

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  
  // Nur bei Video den recordVideo Parameter im Kontext aktivieren
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
      // Video-Pfad: Scrollen, Warten und Kontext schließen (zwingt Playwright zum Speichern)
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight || 1000));
      await page.waitForTimeout(3000); 
      await context.close(); 
      
      const files = fs.readdirSync(outputDir);
      const videoFile = files.find(f => f.endsWith('.webm'));
      if (!videoFile) throw new Error("Video konnte nicht generiert werden.");
      
      fileToSend = path.join(outputDir, videoFile);
      fileName = 'audit.webm';
      mimeType = 'video/webm';
      messageContent = `🎥 **Visual Audit Video Report**\n**Ziel:** \`${url}\``;
    } else {
      // Screenshot-Pfad: Fullpage-Screenshot direkt auslösen
      fileToSend = path.join(outputDir, 'screenshot.png');
      await page.screenshot({ path: fileToSend, fullPage: true });
      await context.close();
      
      fileName = 'screenshot.png';
      mimeType = 'image/png';
      messageContent = `📸 **Visual Audit Image Report**\n**Ziel:** \`${url}\``;
    }
  } catch (e) {
    console.error(`[Audit] Warnung beim Laden der Seite: ${e.message}`);
  } finally {
    // Fallback, falls der Browser noch offen ist
    if (browser.isConnected()) await browser.close();
  }

  // Validierung, ob eine Datei erzeugt wurde
  if (!fileToSend || !fs.existsSync(fileToSend)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    throw new Error(`Audit-Datei (${mode}) wurde nicht erstellt.`);
  }

  // 25 MB Discord Limit Check
  const stats = fs.statSync(fileToSend);
  const fileSizeMB = stats.size / (1024 * 1024);

  console.error(`[Audit] 🚀 Datei generiert (${fileSizeMB.toFixed(2)} MB). Sende an Discord...`);

  if (fileSizeMB > 25) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    throw new Error(`Datei ist mit ${fileSizeMB.toFixed(2)} MB zu gross für Discord (Max 25 MB).`);
  }

  // Payload zusammenbauen
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
  
  console.error(`[Audit] ✅ ${mode} erfolgreich gesendet.`);
  return { status: "success", target_url: url, mode: mode, size_mb: fileSizeMB.toFixed(2) };
}

// --- CLI WRAPPER ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1])) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
  const args = process.argv.slice(2);
  // Suche die URL (das erste Argument, das nicht mit '--' beginnt)
  const url = args.find(a => !a.startsWith('--'));
  const modeFlagIndex = args.indexOf('--mode');
  const mode = modeFlagIndex > -1 && args[modeFlagIndex + 1] ? args[modeFlagIndex + 1] : 'image';

  const channel = process.env.DISCORD_CHANNEL;
  const token = process.env.DISCORD_TOKEN;

  if (!url) {
    console.log(JSON.stringify({ status: "error", error: "URL als Parameter erforderlich." }));
    process.exit(1);
  }
  if (!channel || !token) {
    console.log(JSON.stringify({ status: "error", error: "DISCORD_TOKEN und DISCORD_CHANNEL fehlen." }));
    process.exit(1);
  }
  if (!['image', 'video'].includes(mode)) {
    console.log(JSON.stringify({ status: "error", error: "--mode muss 'image' oder 'video' sein." }));
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
