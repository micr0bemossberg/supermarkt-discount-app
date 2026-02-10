import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let spreadsData: any = null;

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('spreads.json')) {
      try {
        spreadsData = await response.json();
        console.log('Got spreads.json with', Object.keys(spreadsData).length, 'entries');
      } catch (e) {}
    }
  });

  console.log('Loading Publitas viewer...');
  await page.goto('https://view.publitas.com/folder-deze-week', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (!spreadsData) {
    console.log('No spreads.json found');
    await browser.close();
    return;
  }

  // Extract page UUIDs and build image URLs
  const baseUrl = 'https://view.publitas.com/96403/2822585/pages';
  const pages: { pageNum: number; uuid: string; imageUrl: string }[] = [];

  for (const [key, value] of Object.entries(spreadsData)) {
    const pageNum = parseInt(key);
    const spread = value as any;
    // Each entry has page data - extract UUID
    if (spread && spread.pages) {
      for (const p of spread.pages) {
        pages.push({
          pageNum: p.pageNumber || pageNum,
          uuid: p.uuid,
          imageUrl: `${baseUrl}/${p.uuid}-at1200.jpg`
        });
      }
    } else if (spread && spread.uuid) {
      pages.push({
        pageNum,
        uuid: spread.uuid,
        imageUrl: `${baseUrl}/${spread.uuid}-at1200.jpg`
      });
    }
  }

  // If pages extraction didn't work, try raw structure
  if (pages.length === 0) {
    console.log('Trying raw structure...');
    console.log('Sample entry [0]:', JSON.stringify(spreadsData['0']).substring(0, 1000));
    console.log('Sample entry [1]:', JSON.stringify(spreadsData['1']).substring(0, 1000));
  }

  console.log(`\nExtracted ${pages.length} page image URLs:`);
  for (const p of pages.slice(0, 5)) {
    console.log(`  Page ${p.pageNum}: ${p.imageUrl}`);
  }

  // Save full spreads data for analysis
  const outPath = path.join(__dirname, 'spreads_data.json');
  fs.writeFileSync(outPath, JSON.stringify(spreadsData, null, 2));
  console.log(`\nFull data saved to ${outPath}`);

  await browser.close();
}

main().catch(console.error);
