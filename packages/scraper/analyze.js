const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.jumbo.com/aanbiedingen', { waitUntil: 'networkidle', timeout: 90000 });

  // Find all article elements
  const articles = await page.$$('article[data-testid="jum-card-promotion-regular"]');
  console.log(`Found ${articles.length} articles`);

  if (articles.length > 0) {
    const first = articles[0];

    // Get all text content first
    const allText = await first.textContent();
    console.log('\n=== ALL TEXT FROM FIRST ARTICLE ===');
    console.log(allText.trim());

    // Try to find title
    const h3 = await first.$('h3');
    if (h3) {
      const titleText = await h3.textContent();
      console.log('\n=== TITLE (h3) ===');
      console.log(titleText);
    }

    // Find image
    const img = await first.$('img');
    if (img) {
      const src = await img.getAttribute('src');
      const alt = await img.getAttribute('alt');
      console.log('\n=== IMAGE ===');
      console.log('src:', src);
      console.log('alt:', alt);
    }

    // Try common price patterns
    const spans = await first.$$('span');
    console.log(`\n=== FOUND ${spans.length} SPAN ELEMENTS ===`);
    for (let i = 0; i < Math.min(10, spans.length); i++) {
      const text = await spans[i].textContent();
      const className = await spans[i].getAttribute('class');
      if (text && text.trim()) {
        console.log(`[${i}] class="${className}" text="${text.trim()}"`);
      }
    }
  }

  await browser.close();
})();
