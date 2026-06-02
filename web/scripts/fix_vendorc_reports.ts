import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../drizzle/schema';
import { eq, gte } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function run() {
    console.log('Fetching QC results from the last 2 days...');
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Drizzle relations query
    const results = await db.query.qcResults.findMany({
        where: gte(schema.qcResults.timestamp, twoDaysAgo.toISOString()),
    });

    console.log(`Found ${results.length} recent reports.`);
    let fixedCount = 0;

    for (const report of results) {
        // Fetch test results for this report
        const testResults = await db.query.testResults.findMany({
            where: eq(schema.testResults.qcResultId, report.id)
        });

        const storageTest = testResults.find(t => t.testType === 'Storage' || t.testType === 'Smart');
        if (!storageTest || !Array.isArray(storageTest.detailsJson)) continue;

        const details = storageTest.detailsJson as string[];
        const hasVendorC = details.some(d => typeof d === 'string' && d.toLowerCase().includes('[smart] vendorc'));
        const isInconclusive = details.some(d => typeof d === 'string' && d.includes('Storage Inconclusive'));

        if (hasVendorC && isInconclusive) {
            console.log(`Fixing report ${report.reportId}...`);

            // Fix storageDetailsJson
            let storageDetails = report.storageDetailsJson as any;
            if (storageDetails) {
                storageDetails.isInconclusive = false;
                storageDetails.inconclusiveReason = '';
                if (Array.isArray(storageDetails.devices)) {
                    storageDetails.devices.forEach((d: any) => {
                        d.isInconclusive = false;
                        d.inconclusiveReason = '';
                    });
                }
            }

            // Fix storageTest
            const newDetails = details.filter(d => typeof d === 'string' && !d.includes('Storage Inconclusive'));
            let storageScore = 100;
            const smartMatch = details.find(d => typeof d === 'string' && d.toLowerCase().includes('[smart]') && !d.toLowerCase().includes('vendorc'));
            if (smartMatch) {
                const match = smartMatch.match(/\((\d+)%\)/);
                if (match) storageScore = parseInt(match[1], 10);
            }
            const storageGrade = storageScore >= 80 ? 'A' : storageScore >= 60 ? 'B' : storageScore >= 40 ? 'C' : 'F';

            // Recompute pramaan
            let newPramaanScore = report.pramaanScore;
            let newPramaanGrade = report.pramaanGrade;
            let catScores = report.pramaanCategoryScores as Record<string, number>;
            
            if (catScores) {
                catScores.storage = storageScore;
                const weights: Record<string, number> = { storage: 0.25, thermal: 0.20, battery: 0.20, cpu_ram: 0.15, physical_ports: 0.10, repair_modifier: 0.10 };
                let totalWeightedScore = 0;
                let totalWeight = 0;
                for (const [key, weight] of Object.entries(weights)) {
                    if (catScores[key] !== undefined) {
                        totalWeightedScore += catScores[key] * weight;
                        totalWeight += weight;
                    }
                }
                if (totalWeight > 0) {
                    newPramaanScore = Math.max(0, Math.min(Math.round(totalWeightedScore / totalWeight), 100));
                    newPramaanGrade = newPramaanScore >= 90 ? 'A+' : newPramaanScore >= 80 ? 'A' : newPramaanScore >= 65 ? 'B' : newPramaanScore >= 50 ? 'C' : 'Reject';
                }
            }

            // Update database
            await db.transaction(async (tx) => {
                await tx.update(schema.qcResults).set({
                    storageDetailsJson: storageDetails,
                    pramaanScore: newPramaanScore,
                    pramaanGrade: newPramaanGrade,
                    pramaanCategoryScores: catScores,
                }).where(eq(schema.qcResults.id, report.id));

                await tx.update(schema.testResults).set({
                    detailsJson: newDetails,
                    score: storageScore,
                    grade: storageGrade,
                    passed: true,
                    message: 'Healthy'
                }).where(eq(schema.testResults.id, storageTest.id));
            });

            fixedCount++;
        }
    }

    console.log(`Successfully fixed ${fixedCount} reports.`);
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
