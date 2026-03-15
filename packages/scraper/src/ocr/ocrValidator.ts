/**
 * Compare Gemini-extracted products with text-extracted products.
 * Produces a validation report showing matches, mismatches, and missing items.
 */

import type { GeminiProduct } from './ocrClient';

export interface TextProduct {
  name: string;
  price: number | null;
  originalPrice: number | null;
  dealType: string | null;
  pageNum?: number;
}

export interface MatchResult {
  geminiProduct: GeminiProduct & { pageNum: number };
  textProduct: TextProduct | null;
  nameScore: number;        // 0-1 similarity
  priceMatch: boolean;
  status: 'matched' | 'price_mismatch' | 'gemini_only' | 'text_only';
}

export interface ValidationReport {
  totalGemini: number;
  totalText: number;
  matched: number;
  priceMismatches: number;
  geminiOnly: number;        // Found by Gemini but not by text parser
  textOnly: number;           // Found by text parser but not by Gemini
  accuracy: number;           // 0-1 overall score
  matches: MatchResult[];
  geminiOnlyProducts: Array<GeminiProduct & { pageNum: number }>;
  textOnlyProducts: TextProduct[];
}

/**
 * Dice coefficient for string similarity (bigram-based).
 * Returns 0-1 where 1 is identical.
 */
function diceCoefficient(a: string, b: string): number {
  const aNorm = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bNorm = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (aNorm === bNorm) return 1;
  if (aNorm.length < 2 || bNorm.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < aNorm.length - 1; i++) {
    bigramsA.add(aNorm.slice(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < bNorm.length - 1; i++) {
    bigramsB.add(bNorm.slice(i, i + 2));
  }

  let intersection = 0;
  bigramsA.forEach(bg => {
    if (bigramsB.has(bg)) intersection++;
  });

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Check if one name is a substring/prefix of the other (normalized).
 */
function isSubstringMatch(a: string, b: string): boolean {
  const aNorm = a.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const bNorm = b.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  return aNorm.includes(bNorm) || bNorm.includes(aNorm);
}

/**
 * Check if first significant word matches between two names.
 */
function firstWordMatches(a: string, b: string): boolean {
  const wordsA = a.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/);
  const wordsB = b.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/);

  const sigA = wordsA.find(w => w.length > 2);
  const sigB = wordsB.find(w => w.length > 2);

  if (!sigA || !sigB) return false;
  return sigA.toLowerCase() === sigB.toLowerCase();
}

const NAME_MATCH_THRESHOLD = 0.45;
const PRICE_TOLERANCE = 0.10;

type GeminiProductWithPage = GeminiProduct & { pageNum: number };

/**
 * Find the best matching text product for a Gemini product.
 */
function findBestMatch(
  geminiProduct: GeminiProductWithPage,
  textProducts: TextProduct[],
  usedIndices: Set<number>,
): { index: number; score: number } | null {
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < textProducts.length; i++) {
    if (usedIndices.has(i)) continue;

    const tp = textProducts[i];
    let score = diceCoefficient(geminiProduct.name, tp.name);

    if (firstWordMatches(geminiProduct.name, tp.name)) {
      score = Math.max(score, 0.5);
    }

    if (isSubstringMatch(geminiProduct.name, tp.name)) {
      score = Math.max(score, 0.6);
    }

    if (tp.pageNum !== undefined && tp.pageNum === geminiProduct.pageNum) {
      score += 0.05;
    }

    if (geminiProduct.discountPrice !== null && tp.price !== null &&
        Math.abs(geminiProduct.discountPrice - tp.price) < 0.01) {
      score += 0.1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestScore >= NAME_MATCH_THRESHOLD) {
    return { index: bestIdx, score: bestScore };
  }
  return null;
}

/**
 * Compare Gemini products with text-extracted products.
 */
export function validateProducts(
  geminiProducts: GeminiProductWithPage[],
  textProducts: TextProduct[],
): ValidationReport {
  const matches: MatchResult[] = [];
  const usedTextIndices = new Set<number>();
  const usedGeminiIndices = new Set<number>();

  for (let gi = 0; gi < geminiProducts.length; gi++) {
    const gProd = geminiProducts[gi];
    const match = findBestMatch(gProd, textProducts, usedTextIndices);

    if (match) {
      const textProd = textProducts[match.index];
      usedTextIndices.add(match.index);
      usedGeminiIndices.add(gi);

      const priceMatch = gProd.discountPrice !== null && textProd.price !== null
        ? Math.abs(gProd.discountPrice - textProd.price) <= PRICE_TOLERANCE
        : gProd.discountPrice === null && textProd.price === null;

      matches.push({
        geminiProduct: gProd,
        textProduct: textProd,
        nameScore: match.score,
        priceMatch,
        status: priceMatch ? 'matched' : 'price_mismatch',
      });
    }
  }

  const geminiOnlyProducts: GeminiProductWithPage[] = [];
  for (let gi = 0; gi < geminiProducts.length; gi++) {
    if (!usedGeminiIndices.has(gi)) {
      geminiOnlyProducts.push(geminiProducts[gi]);
    }
  }

  const textOnlyProducts: TextProduct[] = [];
  for (let ti = 0; ti < textProducts.length; ti++) {
    if (!usedTextIndices.has(ti)) {
      textOnlyProducts.push(textProducts[ti]);
    }
  }

  const matched = matches.filter(m => m.status === 'matched').length;
  const priceMismatches = matches.filter(m => m.status === 'price_mismatch').length;
  const total = Math.max(geminiProducts.length, textProducts.length);
  const accuracy = total > 0 ? matched / total : 1;

  return {
    totalGemini: geminiProducts.length,
    totalText: textProducts.length,
    matched,
    priceMismatches,
    geminiOnly: geminiOnlyProducts.length,
    textOnly: textOnlyProducts.length,
    accuracy,
    matches,
    geminiOnlyProducts,
    textOnlyProducts,
  };
}

/**
 * Format a validation report as a human-readable string.
 */
export function formatReport(report: ValidationReport): string {
  const lines: string[] = [];

  lines.push('========================================================');
  lines.push('       VOMAR VALIDATION REPORT (Gemini Flash)           ');
  lines.push('========================================================');
  lines.push('');
  lines.push(`Gemini products found:  ${report.totalGemini}`);
  lines.push(`Text products found:    ${report.totalText}`);
  lines.push(`Matched:                ${report.matched}`);
  lines.push(`Price mismatches:       ${report.priceMismatches}`);
  lines.push(`Gemini-only (missed):   ${report.geminiOnly}`);
  lines.push(`Text-only (extra):      ${report.textOnly}`);
  lines.push(`Accuracy:               ${(report.accuracy * 100).toFixed(1)}%`);
  lines.push('');

  if (report.matches.length > 0) {
    lines.push('--- MATCHED PRODUCTS ------------------------------------');
    for (const m of report.matches) {
      const priceInfo = m.priceMatch
        ? `OK E${m.geminiProduct.discountPrice?.toFixed(2)}`
        : `MISMATCH Gemini:E${m.geminiProduct.discountPrice?.toFixed(2)} vs Text:E${m.textProduct?.price?.toFixed(2)}`;
      lines.push(`  [${(m.nameScore * 100).toFixed(0)}%] "${m.geminiProduct.name}" <-> "${m.textProduct?.name}" ${priceInfo}`);
    }
    lines.push('');
  }

  if (report.geminiOnlyProducts.length > 0) {
    lines.push('--- GEMINI-ONLY (missed by text parser) -----------------');
    lines.push('  Products found by Gemini but NOT by the text parser.');
    lines.push('  These are likely real products the scraper is missing.');
    lines.push('');
    for (const p of report.geminiOnlyProducts) {
      const deal = p.dealType ? ` [${p.dealType}]` : '';
      const voucher = p.isVoucher ? ' (VOUCHER)' : '';
      lines.push(`  [pg ${p.pageNum}] "${p.name}" E${p.discountPrice?.toFixed(2) ?? '?'}${deal}${voucher}`);
    }
    lines.push('');
  }

  if (report.textOnlyProducts.length > 0) {
    lines.push('--- TEXT-ONLY (not confirmed by Gemini) -----------------');
    lines.push('  Products from text parser but NOT found by Gemini.');
    lines.push('  These may be false positives (junk names, merged products).');
    lines.push('');
    for (const p of report.textOnlyProducts) {
      lines.push(`  [pg ${p.pageNum ?? '?'}] "${p.name}" E${p.price?.toFixed(2) ?? '?'}`);
    }
    lines.push('');
  }

  const mismatches = report.matches.filter(m => m.status === 'price_mismatch');
  if (mismatches.length > 0) {
    lines.push('--- PRICE MISMATCHES ------------------------------------');
    for (const m of mismatches) {
      lines.push(`  "${m.geminiProduct.name}": Gemini E${m.geminiProduct.discountPrice?.toFixed(2)} vs Text E${m.textProduct?.price?.toFixed(2)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
