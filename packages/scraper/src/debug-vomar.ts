/**
 * Debug script for Vomar scraper
 * Dumps raw Publitas page texts and parsed products for manual verification.
 *
 * Usage: npx ts-node src/debug-vomar.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';

async function main() {
  console.log('=== Vomar Debug: Fetching Publitas spreads.json ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let spreadsData: any = null;

  page.on('response', async (response) => {
    if (response.url().includes('spreads.json')) {
      try {
        spreadsData = await response.json();
        console.log(`✓ Captured spreads.json (${JSON.stringify(spreadsData).length} bytes)`);
      } catch (e) {
        console.error('Failed to parse spreads.json');
      }
    }
  });

  console.log('Loading Publitas viewer...');
  await page.goto('https://view.publitas.com/folder-deze-week', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  await browser.close();

  if (!spreadsData) {
    console.error('Failed to capture spreads.json');
    process.exit(1);
  }

  const spreads = Array.isArray(spreadsData) ? spreadsData : Object.values(spreadsData);

  // Extract all page texts
  const pages: Array<{ pageNum: number; text: string }> = [];
  for (const spread of spreads as any[]) {
    if (!spread?.pages) continue;
    for (const pg of spread.pages) {
      if (pg.text && pg.text.trim()) {
        pages.push({ pageNum: pg.number || 0, text: pg.text });
      }
    }
  }

  console.log(`\nTotal pages with text: ${pages.length}\n`);

  // Dump each page's text
  const output: string[] = [];
  output.push(`=== VOMAR FOLDER DEBUG — ${new Date().toISOString()} ===\n`);
  output.push(`Total pages with text: ${pages.length}\n`);

  for (const { pageNum, text } of pages) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    output.push(`\n${'='.repeat(60)}`);
    output.push(`PAGE ${pageNum} (${lines.length} lines)`);
    output.push('='.repeat(60));

    // Flag special content
    if (/voucher/i.test(text)) output.push('[VOUCHER PAGE]');
    if (/spelvoorwaarden/i.test(text)) output.push('[CONTEST PAGE]');
    if (/Concurrentieprijzen/i.test(text)) output.push('[PRICE COMPARISON PAGE]');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let annotation = '';

      // Annotate deal keywords
      if (/^\d\+\d$/.test(line)) annotation = ' ← X+X deal marker';
      else if (/GRATIS/i.test(line)) annotation = ' ← GRATIS';
      else if (/KORTING/i.test(line)) annotation = ' ← KORTING';
      else if (/\d+\s*%/.test(line)) annotation = ' ← percentage';
      else if (/VOOR/i.test(line) && /^\d/.test(line)) annotation = ' ← X VOOR deal';
      else if (/OP\s*=\s*OP/i.test(line)) annotation = ' ← OP=OP';
      else if (/VOUCHER/i.test(line)) annotation = ' ← VOUCHER';
      else if (/ACTIE/i.test(line)) annotation = ' ← ACTIE';
      // Annotate prices
      else if (/^\d{1,2}[a-z]$/i.test(line)) {
        const decoded = decodePriceCode(line);
        annotation = decoded ? ` ← CODED PRICE: €${decoded.toFixed(2)}` : ' ← coded price (unknown)';
      }
      else if (/^[¤€]?\s*\d+[.,]\d{1,2}$/.test(line)) annotation = ' ← EXPLICIT PRICE';
      else if (/^\d+[.,]\d{2}\s*-\s*\d+[.,]\d{2}$/.test(line)) annotation = ' ← PRICE RANGE';
      // Annotate unit info
      else if (/^(PER\s|ALLE\s|\d+\s*(GRAM|KILO|ML|STUKS|PAKKEN|LITER))/i.test(line)) annotation = ' ← UNIT INFO';

      output.push(`  ${String(i).padStart(3)}| ${line}${annotation}`);
    }
  }

  const outFile = 'vomar-debug-output.txt';
  fs.writeFileSync(outFile, output.join('\n'), 'utf-8');
  console.log(`\nDumped to ${outFile} (${output.length} lines)`);
  console.log('Review this file to see what text the folder contains per page.');
}

const PRICE_CODES: Record<string, number> = {
  'a': 0, 'b': 9, 'c': 15, 'd': 19, 'e': 25, 'f': 29,
  'g': 35, 'h': 39, 'i': 40, 'j': 49, 'k': 50, 'l': 55,
  'm': 59, 'n': 65, 'o': 69, 'p': 79, 'q': 85, 'r': 89,
  's': 95, 't': 99,
};

function decodePriceCode(code: string): number | undefined {
  const match = code.match(/^(\d{1,2})([a-z])$/i);
  if (!match) return undefined;
  const euros = parseInt(match[1]);
  const letter = match[2].toLowerCase();
  const cents = PRICE_CODES[letter];
  if (cents === undefined) return undefined;
  return euros + cents / 100;
}

main().catch(console.error);
