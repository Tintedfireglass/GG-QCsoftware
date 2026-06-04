/**
 * Quick smoke-test for GET /api/qc-results/export/sample
 * Run with: node test_sample_export.mjs <JWT_TOKEN>
 *
 * Saves the downloaded files to the current directory.
 */

import { writeFile } from 'node:fs/promises';

const token = process.argv[2];
if (!token) {
    console.error('Usage: node test_sample_export.mjs <JWT_TOKEN>');
    process.exit(1);
}

const BASE = 'http://localhost:3000';
const HEADERS = { Authorization: `Bearer ${token}` };

async function downloadFile(url, description) {
    console.log(`\n⬇  ${description}`);
    console.log(`   URL: ${url}`);
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
        const text = await res.text();
        console.error(`   ✗ HTTP ${res.status}: ${text.slice(0, 200)}`);
        return;
    }
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || 'downloaded_file';
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(filename, buf);
    console.log(`   ✓ Saved as: ${filename}  (${(buf.length / 1024).toFixed(1)} KB)`);
}

await downloadFile(
    `${BASE}/api/qc-results/export/sample?format=xlsx&goodCount=90&poorCount=10`,
    'Excel export (100 rows: 90 good + 10 poor)'
);

await downloadFile(
    `${BASE}/api/qc-results/export/sample?format=zip&goodCount=90&poorCount=10`,
    'ZIP export (100 individual PDFs)'
);

console.log('\nDone.\n');
