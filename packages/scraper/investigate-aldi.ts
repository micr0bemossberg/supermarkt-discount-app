import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto('https://www.aldi.nl/aanbiedingen.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Loaded');
    await page.waitForTimeout(3000);
    try { await page.locator('#onetrust-accept-btn-handler').first().click({ timeout: 3000 }); console.log('Cookie ok'); } catch {}
    console.log('Wait 10s'); await page.waitForTimeout(10000);
    // Selector scan
    const sels = [".mod-article-tile","[class*=\"article-tile\"]","[data-entry-type=\"article\"]","a[href*=\"/aanbiedingen/\"]",".mod-product-tile","[class*=\"product-tile\"]","[class*=\"product-card\"]","[class*=\"offer\"]",".tile","article"];
    console.log("SELECTOR_SCAN");
    for (const sel of sels) { const c = await page.locator(sel).count(); if (c > 0) console.log("  "+sel+": "+c); }
    // Dump first 5 product elements
    console.log("PRODUCT_DUMP");
    const data = await page.evaluate(() => {
      const sels = [".mod-article-tile","a[href*="/aanbiedingen/"]","[class*="product"]","article"];
      for (const sel of sels) {
        const els = document.querySelectorAll(sel);
        if (els.length > 2) {
          return Array.from(els).slice(0, 5).map((el, i) => ({
            i, sel,
            tag: el.tagName + "." + el.className,
            html: el.innerHTML,
            text: el.textContent?.trim(),
            imgs: Array.from(el.querySelectorAll("img")).map(img => ({ alt: img.alt, src: (img.src||"").substring(0,100) })),
          }));
        }
      }
      return null;
    });

    if (data) {
      for (const d of data) {
        console.log("
=== ELEMENT " + d.i + " (" + d.sel + ") ===");
        console.log("TAG: " + d.tag);
        console.log("TEXT: " + JSON.stringify(d.text));
        console.log("IMGS: " + JSON.stringify(d.imgs));
        console.log("HTML:");
        console.log(d.html);
      }
    } else {
      console.log("No product elements found");
