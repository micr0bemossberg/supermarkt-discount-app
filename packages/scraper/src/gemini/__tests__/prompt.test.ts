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

  it('includes key extraction concepts', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('title');
    expect(prompt).toContain('price');
    expect(prompt).toContain('Geldig');
    expect(prompt).toContain('requires_card');
    expect(prompt).toContain('per kg');
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

  it('includes extraction instructions for prices and dates', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toContain('YYYY-MM-DD');
    expect(prompt).toContain('decimal point');
  });

  it('includes Dutch language context', () => {
    const prompt = buildExtractionPrompt(context);
    expect(prompt).toMatch(/[Dd]utch|[Nn]ederlands|januari|februari/);
  });
});
