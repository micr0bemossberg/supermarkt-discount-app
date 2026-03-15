import { parseGeminiResponse } from '../responseParser';

describe('parseGeminiResponse', () => {
  const baseProduct = {
    title: 'Karvan Cévitam',
    discount_price: 1.99,
    valid_from: '2026-03-16',
    valid_until: '2026-03-22',
  };

  it('parses valid JSON array into ScrapedProduct[]', () => {
    const raw = JSON.stringify([baseProduct]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Karvan Cévitam');
    expect(result[0].discount_price).toBe(1.99);
    expect(result[0].valid_from).toBeInstanceOf(Date);
    expect(result[0].valid_until).toBeInstanceOf(Date);
  });

  it('coerces Dutch comma-decimal prices to numbers', () => {
    const raw = JSON.stringify([{ ...baseProduct, discount_price: '1,99', original_price: '3,49' }]);
    const result = parseGeminiResponse(raw);
    expect(result[0].discount_price).toBe(1.99);
    expect(result[0].original_price).toBe(3.49);
  });

  it('filters out products missing required title', () => {
    const raw = JSON.stringify([{ discount_price: 1.99, valid_from: '2026-03-16', valid_until: '2026-03-22' }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('filters out products missing required discount_price', () => {
    const raw = JSON.stringify([{ title: 'Test', valid_from: '2026-03-16', valid_until: '2026-03-22' }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('filters out products with discount_price <= 0', () => {
    const raw = JSON.stringify([{ ...baseProduct, discount_price: 0 }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('filters out products where original_price < discount_price', () => {
    const raw = JSON.stringify([{ ...baseProduct, original_price: 0.99 }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(0);
  });

  it('falls back to current week Monday/Sunday when dates are null', () => {
    const raw = JSON.stringify([{ title: 'Test', discount_price: 2.99, valid_from: null, valid_until: null }]);
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(1);
    const from = result[0].valid_from;
    const until = result[0].valid_until;
    expect(from.getDay()).toBe(1); // Monday
    expect(until.getDay()).toBe(0); // Sunday
    expect(until.getTime()).toBeGreaterThan(from.getTime());
  });

  it('replaces invalid category_slug with overig', () => {
    const validSlugs = ['dranken', 'overig'];
    const raw = JSON.stringify([{ ...baseProduct, category_slug: 'nonexistent' }]);
    const result = parseGeminiResponse(raw, validSlugs);
    expect(result[0].category_slug).toBe('overig');
  });

  it('keeps valid category_slug unchanged', () => {
    const validSlugs = ['dranken', 'overig'];
    const raw = JSON.stringify([{ ...baseProduct, category_slug: 'dranken' }]);
    const result = parseGeminiResponse(raw, validSlugs);
    expect(result[0].category_slug).toBe('dranken');
  });

  it('computes discount_percentage when prices are present but percentage is missing', () => {
    const raw = JSON.stringify([{ ...baseProduct, original_price: 4.00, discount_price: 3.00 }]);
    const result = parseGeminiResponse(raw);
    expect(result[0].discount_percentage).toBe(25);
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseGeminiResponse('not json at all');
    expect(result).toEqual([]);
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const raw = '```json\n' + JSON.stringify([baseProduct]) + '\n```';
    const result = parseGeminiResponse(raw);
    expect(result).toHaveLength(1);
  });

  it('handles empty array', () => {
    const result = parseGeminiResponse('[]');
    expect(result).toEqual([]);
  });

  it('defaults requires_card to false when missing', () => {
    const raw = JSON.stringify([baseProduct]);
    const result = parseGeminiResponse(raw);
    expect(result[0].requires_card).toBe(false);
  });
});
