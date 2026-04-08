/**
 * One-time script: parse Google Voice HTML files and upload to Supabase.
 *
 * Usage:
 *   node upload.mjs "C:/path/to/Takeout/Voice/Calls"
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { JSDOM } from "jsdom";

const SUPABASE_URL = "https://tlbglqreblkvypoocscq.supabase.co";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYmdscXJlYmxrdnlwb29jc2NxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY2NDkwOSwiZXhwIjoyMDkxMjQwOTA5fQ.oW7hvhz7zo0yEdLp1ybSHUuhCCxr-TmK8QgRBjdTJhI";

// --- Parser (same logic as the app) ---
function parseGVoiceHTML(htmlString, fileName) {
  const dom = new JSDOM(htmlString);
  const doc = dom.window.document;
  const messages = [];

  const messageDivs = doc.querySelectorAll(".message, .hChatLog .message");
  if (messageDivs.length > 0) {
    messageDivs.forEach((div) => {
      const senderEl =
        div.querySelector(".sender, cite, .fn") ||
        div.querySelector('[class*="sender"]');
      const timeEl =
        div.querySelector(".dt, abbr, time") ||
        div.querySelector('[class*="time"]');
      const bodyEl =
        div.querySelector(".SMS, .sms, q, .message-text") ||
        div.querySelector('[class*="text"]');

      const sender = senderEl?.textContent?.trim() || "Unknown";
      const timeStr =
        timeEl?.getAttribute("title") ||
        timeEl?.getAttribute("datetime") ||
        timeEl?.textContent?.trim() ||
        "";
      const body = bodyEl?.textContent?.trim() || div.textContent?.trim() || "";

      if (body) messages.push({ sender, time: timeStr, body, file: fileName });
    });
  }

  if (messages.length === 0) {
    const rows = doc.querySelectorAll("div.haudio, div[class*='message']");
    rows.forEach((row) => {
      const sender =
        row.querySelector("span.fn, cite")?.textContent?.trim() || "Unknown";
      const timeStr =
        row.querySelector("abbr")?.getAttribute("title") ||
        row.querySelector("abbr")?.textContent?.trim() ||
        "";
      const body =
        row.querySelector("q, span.sms-text, div.sms-text")?.textContent?.trim() || "";
      if (body) messages.push({ sender, time: timeStr, body, file: fileName });
    });
  }

  if (messages.length === 0) {
    const allDivs = doc.querySelectorAll("div");
    let currentSender = "";
    let currentTime = "";
    allDivs.forEach((div) => {
      const citeEl = div.querySelector("cite");
      const abbrEl = div.querySelector("abbr");
      const qEl = div.querySelector("q");
      if (citeEl) currentSender = citeEl.textContent.trim();
      if (abbrEl) currentTime = abbrEl.getAttribute("title") || abbrEl.textContent.trim();
      if (qEl && qEl.textContent.trim()) {
        messages.push({
          sender: currentSender || "Unknown",
          time: currentTime,
          body: qEl.textContent.trim(),
          file: fileName,
        });
      }
    });
  }

  let contact = fileName.replace(/\.html$/i, "");
  const dashParts = contact.split(" - ");
  if (dashParts.length >= 2) contact = dashParts[0].trim();

  return { messages, contact };
}

// --- Upload logic ---
async function uploadBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Usage: node upload.mjs <path-to-Calls-folder>");
    process.exit(1);
  }

  console.log(`Reading HTML files from: ${dir}`);
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".html"));
  console.log(`Found ${files.length} HTML files`);

  let totalMessages = 0;
  let batch = [];
  const BATCH_SIZE = 500;

  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const html = await readFile(join(dir, fileName), "utf-8");
    const { messages, contact } = parseGVoiceHTML(html, fileName);

    for (const msg of messages) {
      const date = msg.time ? new Date(msg.time) : null;
      batch.push({
        sender: msg.sender,
        body: msg.body,
        time_str: msg.time || null,
        date: date && !isNaN(date) ? date.toISOString() : null,
        file: msg.file,
        contact,
      });

      if (batch.length >= BATCH_SIZE) {
        await uploadBatch(batch);
        totalMessages += batch.length;
        batch = [];
        process.stdout.write(`\r  ${i + 1}/${files.length} files · ${totalMessages.toLocaleString()} messages uploaded`);
      }
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  ${i + 1}/${files.length} files · ${totalMessages.toLocaleString()} messages uploaded`);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await uploadBatch(batch);
    totalMessages += batch.length;
  }

  console.log(`\nDone! Uploaded ${totalMessages.toLocaleString()} messages from ${files.length} files.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
