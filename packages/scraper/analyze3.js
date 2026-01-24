const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://www.jumbo.com/aanbiedingen', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(10000);

  // Focus on the 23 article elements
  const articles = await page.$$('article[class*="jum-card"]');
  console.log(`Found ${articles.length} article.jum-card elements\n`);

  if (articles.length > 0) {
    console.log('=== ANALYZING FIRST ARTICLE ===\n');
    const article = articles[0];

    // Get the entire inner HTML
    const innerHTML = await article.evaluate(el => el.innerHTML);

    // Try to extract text content after a delay
    const text = await article.textContent();
    console.log('Text content:', text?.trim()?.substring(0, 500));

    // Look for nested elements
    const allElements = await article.$$('*');
    console.log(`\nTotal nested elements: ${allElements.length}`);

    // Find all text-containing elements
    console.log('\n=== ELEMENTS WITH TEXT ===');
    for (let i = 0; i < Math.min(allElements.length, 50); i++) {
      const el = allElements[i];
      const tagName = await el.evaluate(e => e.tagName);
      const className = await el.getAttribute('class');
      const text = await el.textContent();

      if (text && text.trim() && text.trim().length < 100 && text.trim().length > 0) {
        console.log(`${tagName}.${className}: "${text.trim()}"`);
      }
    }

    // Look for links within article
    const links = await article.$$('a');
    console.log(`\n=== ${links.length} LINKS IN ARTICLE ===`);
    for (let i = 0; i < Math.min(links.length, 5); i++) {
      const href = await links[i].getAttribute('href');
      const text = await links[i].textContent();
      console.log(`[${i}] ${href} - "${text?.trim()}"`);
    }
  }

  await browser.close();
})();
