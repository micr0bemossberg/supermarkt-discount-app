const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false }); // visible browser
  const page = await browser.newPage();

  console.log('Navigating...');
  await page.goto('https://www.jumbo.com/aanbiedingen', { waitUntil: 'networkidle', timeout: 90000 });

  console.log('Waiting 10 seconds for content to load...');
  await page.waitForTimeout(10000);

  // Try to find any product links
  const productLinks = await page.$$('a[href*="/producten/"]');
  console.log(`\nFound ${productLinks.length} product links`);

  if (productLinks.length > 0) {
    console.log('\n=== FIRST 3 PRODUCT LINKS ===');
    for (let i = 0; i < Math.min(3, productLinks.length); i++) {
      const link = productLinks[i];
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      console.log(`[${i}] href="${href}"`);
      console.log(`     text="${text?.trim()}"`);

      // Get HTML of this element
      const html = await link.evaluate(el => el.outerHTML);
      console.log(`     html preview: ${html.substring(0, 200)}...`);
    }
  }

  // Look at page structure
  console.log('\n=== CHECKING PAGE STRUCTURE ===');
  const hasArticles = await page.$$('article');
  console.log(`Articles on page: ${hasArticles.length}`);

  const hasDivProducts = await page.$$('div[class*="product"]');
  console.log(`Divs with "product" in class: ${hasDivProducts.length}`);

  await browser.close();
})();
