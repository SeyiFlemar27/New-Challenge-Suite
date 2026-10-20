import { readFileSync, writeFileSync } from 'node:fs';
import { assessHistoricalPublication } from '../lib/historical-publication-remediation.ts';
const args = process.argv.slice(2);
if (!args.includes('--dry-run') || args.includes('--apply')) throw new Error('Only --dry-run is supported. No database writes or publication actions exist in this tool.');
const inputPath = args[args.indexOf('--input') + 1], outputPath = args[args.indexOf('--output') + 1];
if (!args.includes('--input') || !inputPath) throw new Error('Use --dry-run --input <local-export.json> [--output <report.json>]. This tool does not connect to Production.');
const rows = JSON.parse(readFileSync(inputPath, 'utf8'));
if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Input must be an array of at most 10,000 exported candidate records.');
const results = rows.map(row => {
  if (!row || typeof row.id !== 'string' || !['challenges','tournaments'].includes(row.source) || !row.record || typeof row.record !== 'object') throw new Error('Invalid exported candidate.');
  return assessHistoricalPublication(row);
});
const report = { dryRun: true, productionWrites: false, publicationExecuted: false, generatedAt: new Date().toISOString(), candidateCount: results.filter(row => row.result === 'candidate_for_revalidation').length, needsAttentionCount: results.filter(row => row.result === 'needs_attention').length, results };
if (args.includes('--output')) writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ dryRun: true, publicationExecuted: false, candidateCount: report.candidateCount, needsAttentionCount: report.needsAttentionCount, ...(args.includes('--output') ? { outputPath } : { results }) }, null, 2));
