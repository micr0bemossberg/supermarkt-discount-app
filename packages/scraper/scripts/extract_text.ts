import * as fs from 'fs';
import * as path from 'path';

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'spreads_data.json'), 'utf8'));

for (const spread of data) {
  if (!spread.pages) continue;
  for (const page of spread.pages) {
    if (page.text && page.text.trim()) {
      console.log(`\n===== PAGE ${page.number} =====`);
      console.log(page.text);
    }
  }
}
