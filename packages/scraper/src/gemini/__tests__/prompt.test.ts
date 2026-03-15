import { buildExtractionPrompt } from '../prompt';
import type { ExtractionContext } from '../types';

describe('buildExtractionPrompt', () => {
  const context: ExtractionContext = {
    supermarketSlug: 'dirk',
    supermarketName: 'Dirk van den Broek',
    categorySlugList: ['dranken', 'zuivel-eieren', 'overig'],
  };

  it('includes supermarket name in prompt', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('Dirk van den Broek');
  });

  it('includes all required field names', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('title');
    expect(prompt).toContain('discount_price');
    expect(prompt).toContain('original_price');
    expect(prompt).toContain('valid_from');
    expect(prompt).toContain('valid_until');
    expect(prompt).toContain('category_slug');
    expect(prompt).toContain('requires_card');
    expect(prompt).toContain('unit_info');
  });

  it('includes category slugs in prompt', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('dranken');
    expect(prompt).toContain('zuivel-eieren');
    expect(prompt).toContain('overig');
  });

  it('appends prompt hints when provided', () => {
    const withHints: ExtractionContext = {
      ...context,
      promptHints: 'This supermarket uses starburst badges for discounts.',
    };
    const prompt = buildExtractionPrompt(withHints);
    expect(prompt).toContain('starburst badges');
  });

  it('includes instruction to return JSON array', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('array');
  });

  it('includes Dutch language context', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toMatch(/[Dd]utch|[Nn]ederlands/);
  });
});
