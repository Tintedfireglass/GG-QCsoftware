import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { AuthenticatedUser } from '@/lib/auth-middleware';
import { SELF_ONLY_ROLES } from '@/lib/shared/domain/visibility';
import { ValidationError, ForbiddenError } from '@/lib/http/errors';
import { parseWindowsVersion, cleanWindowsProductName, deduplicateAntivirus, formatDateDMY, toAppZoneDateStamp } from '@/lib/utils';
import { APP_TIME_ZONE, parseDbTimestamp } from '@/lib/timezone';
import * as repo from '@/lib/platforms/windows/repositories/qc-results.repo';
import { getBranding, type Branding } from '@/lib/shared/services/branding.service';
import { getBrandingForHost } from '@/lib/shared/services/reseller-branding.service';

type IssueKey = 'criticalStorage' | 'lowStorage' | 'tampered' | 'inactiveWindows' | 'thermal' | 'stale';
type JsonRecord = Record<string, unknown>;
type StorageVolume = { totalBytes?: number; freeBytes?: number };
type StorageDevice = { deviceName?: string; healthPercent?: number; isTampered?: boolean };
type StorageInfo = { volumes?: StorageVolume[]; devices?: StorageDevice[]; isTampered?: boolean };

type ExportRow = {
    rowValues: (string | number)[];
    freePercent: number | null;
    isWindowsInactive: boolean;
    isTampered: boolean;
    hasThermalIssue: boolean;
    isStale: boolean;
    computerName: string;
    compactProcessor: string;
    serialNo: string;
};

const STALE_DAYS = 30;

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(1);
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function toArrayBuffer(data: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (data instanceof ArrayBuffer) return data;
    const bytes = new Uint8Array(data);
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    return arrayBuffer;
}

function toOrdinal(value: number): string {
    const v = Math.abs(value);
    const mod100 = v % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
    switch (v % 10) {
        case 1: return `${v}st`;
        case 2: return `${v}nd`;
        case 3: return `${v}rd`;
        default: return `${v}th`;
    }
}

function toCompactProcessor(cpuModel: string | null | undefined): string {
    if (!cpuModel) return '';
    const model = cpuModel.trim();

    const intelUltraMatch = model.match(/\bIntel(?:\(R\))?\s+Core(?:\s+Ultra)?\s+([3579])\s+([0-9]{3,5}[A-Z]{0,3})\b/i);
    if (intelUltraMatch) {
        const [, tier, sku] = intelUltraMatch;
        const skuDigits = sku.replace(/[^0-9]/g, '');
        const generation = skuDigits.length >= 3 ? Number(skuDigits.slice(0, 1)) : null;
        if (generation && Number.isFinite(generation)) return `Core Ultra ${tier} (${toOrdinal(generation)} Gen)`;
        return `Core Ultra ${tier} ${sku.toUpperCase()}`;
    }

    const intelCoreNamedMatch = model.match(/\bIntel(?:\(R\))?\s+Core(?:\(TM\))?\s+i([3579])[-\s]*([0-9]{4,5}[A-Z]{0,3})\b/i);
    if (intelCoreNamedMatch) {
        const [, tier, sku] = intelCoreNamedMatch;
        const skuDigits = sku.replace(/[^0-9]/g, '');
        const generation = skuDigits.length >= 5 ? Number(skuDigits.slice(0, 2)) : Number(skuDigits.slice(0, 1));
        if (Number.isFinite(generation) && generation > 0) return `i${tier} ${toOrdinal(generation)} Gen`;
        return `i${tier} ${sku.toUpperCase()}`;
    }

    const intelCoreMatch = model.match(/\b(i[3579])[-\s]*([0-9]{4,5}[a-zA-Z0-9]*)\b/i);
    if (intelCoreMatch) {
        const [, series, sku] = intelCoreMatch;
        const skuDigits = sku.replace(/[^0-9]/g, '');
        const generation = skuDigits.length >= 5 ? Number(skuDigits.slice(0, 2)) : Number(skuDigits.slice(0, 1));
        if (Number.isFinite(generation) && generation > 0) return `${series.toLowerCase()} ${toOrdinal(generation)} Gen`;
        return series.toLowerCase();
    }

    const intelNSeriesMatch = model.match(/\bIntel(?:\(R\))?\s+Processor\s+([Nn][0-9]{3})\b/);
    if (intelNSeriesMatch) return `Intel ${intelNSeriesMatch[1].toUpperCase()}`;

    const ryzenMatch = model.match(/\b(Ryzen)\s*(3|5|7|9)\s*([0-9]{4,5}[A-Z]{0,3})\b/i);
    if (ryzenMatch) {
        const [, , tier, sku] = ryzenMatch;
        return `R${tier} ${sku.toUpperCase()}`;
    }

    const amdSeriesMatch = model.match(/\bAMD\s+(Ryzen(?:\s+Threadripper)?|Athlon|EPYC|A[-\s]*Series)?\s*([3579])?\s*([0-9]{4,5}[A-Z]{0,3})\b/i);
    if (amdSeriesMatch) {
        const family = (amdSeriesMatch[1] || 'AMD').replace(/\s+/g, ' ').trim();
        const tier = amdSeriesMatch[2] ? amdSeriesMatch[2].trim() : '';
        const sku = amdSeriesMatch[3].toUpperCase();
        const shortFamily = family
            .replace(/Ryzen Threadripper/gi, 'TR')
            .replace(/Ryzen/gi, 'R')
            .replace(/Athlon/gi, 'Athlon')
            .replace(/EPYC/gi, 'EPYC');
        const label = tier ? `${shortFamily}${shortFamily === 'R' ? tier : ` ${tier}`} ${sku}` : `${shortFamily} ${sku}`;
        return label.replace(/\s+/g, ' ').trim().slice(0, 24);
    }

    const amdRyzenAiMatch = model.match(/\bAMD\s+Ryzen\s+AI\s+([579])\s+([0-9]{3,4})\b/i);
    if (amdRyzenAiMatch) {
        const [, tier, sku] = amdRyzenAiMatch;
        return `Ryzen AI ${tier} ${sku}`;
    }

    const appleMatch = model.match(/\bApple\s+(M[1-4](?:\s+Pro|\s+Max|\s+Ultra)?)\b/i);
    if (appleMatch) return `Apple ${appleMatch[1].toUpperCase()}`;

    return model.split(',')[0].slice(0, 24);
}

function getStorageHealthSummary(storageInfo: StorageInfo): { label: string; isTampered: boolean } {
    const devices = Array.isArray(storageInfo?.devices) ? storageInfo.devices : [];
    const isStorageTampered = storageInfo?.isTampered === true;
    const anyDeviceTampered = devices.some((d) => d?.isTampered === true);
    const isTampered = isStorageTampered || anyDeviceTampered;

    if (devices.length === 0) return { label: isTampered ? 'Tampered' : '', isTampered };

    const driveHealth = devices.map((d, idx: number) => {
        const rawName = typeof d?.deviceName === 'string' ? d.deviceName : '';
        const driveName = rawName || `Drive ${idx + 1}`;
        const healthPercent = typeof d?.healthPercent === 'number' ? `${Math.round(d.healthPercent)}%` : 'N/A';
        const suffix = d?.isTampered === true ? ' (Tampered)' : '';
        return `${driveName}: ${healthPercent}${suffix}`;
    });

    return { label: driveHealth.join(', '), isTampered };
}

function getIssueSummaryRows(issueMap: Record<IssueKey, Set<string>>): string[][] {
    const issueRows: { label: string; key: IssueKey }[] = [
        { label: `Stale Reports (>${STALE_DAYS} days)`, key: 'stale' },
        { label: 'Critical Storage (<=10% free)', key: 'criticalStorage' },
        { label: 'Low Storage (<25% free)', key: 'lowStorage' },
        { label: 'Storage Tamper Flags', key: 'tampered' },
        { label: 'Inactive Windows', key: 'inactiveWindows' },
        { label: 'Thermal Cooling Issues', key: 'thermal' },
    ];

    return issueRows.map((issue) => {
        const affected = Array.from(issueMap[issue.key]).filter(Boolean).sort((a, b) => a.localeCompare(b));
        return [issue.label, String(affected.length), affected.length > 0 ? affected.join(', ') : '-'];
    });
}

function formatShiftDate(value: string | Date | null | undefined, timeZone: string): string {
    const d = parseDbTimestamp(value);
    if (!d) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone });
}

function formatGeneratedDateTime(timeZone: string): string {
    return new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone,
    });
}

/**
 * Embeds the configured brand logo into `pdf`.
 *
 * Prefers the admin-uploaded artwork (fetched from object storage), falling back
 * to the artwork bundled in /public so exports still carry a mark on a fresh
 * install. pdf-lib can only embed PNG and JPEG, so an SVG upload falls back too.
 */
async function embedBrandLogo(pdf: PDFDocument, branding: Branding): Promise<PDFImage | null> {
    // An uploaded asset is served by /api/branding/asset, i.e. as a path rather
    // than an absolute URL — the bucket is private, so the app streams it. Give
    // it an origin so it is fetchable from here; the bundled defaults stay
    // relative and are read off disk below instead.
    const logoUrl = branding.logoUrl.startsWith('/api/')
        ? `${branding.appUrl}${branding.logoUrl}`
        : branding.logoUrl;
    if (/^https?:\/\//i.test(logoUrl)) {
        try {
            const res = await fetch(logoUrl);
            if (res.ok) {
                const bytes = new Uint8Array(await res.arrayBuffer());
                const type = (res.headers.get('content-type') || '').toLowerCase();
                if (type.includes('png')) return await pdf.embedPng(bytes);
                if (type.includes('jpeg') || type.includes('jpg')) return await pdf.embedJpg(bytes);
            }
        } catch {
            // Unreachable storage must not fail the export — fall back below.
        }
    }
    const candidates = ['prmn_logo.png', 'Pramaan_logo_F1.png', 'loginImg.png'];
    for (const fileName of candidates) {
        try {
            const file = await readFile(path.join(process.cwd(), 'public', fileName));
            return await pdf.embedPng(new Uint8Array(file));
        } catch {
            // Try next candidate
        }
    }
    return null;
}

function truncateToWidth(text: string, maxWidth: number, textSize: number, activeFont: PDFFont): string {
    if (activeFont.widthOfTextAtSize(text, textSize) <= maxWidth) return text;
    let result = text;
    while (result.length > 1 && activeFont.widthOfTextAtSize(`${result}...`, textSize) > maxWidth) {
        result = result.slice(0, -1);
    }
    return `${result}...`;
}

async function buildPdfBuffer(
    rows: ExportRow[],
    issueRows: string[][],
    timeZone: string,
    // Resolved by the caller from the requesting user, so a reseller's export
    // carries the reseller's wordmark rather than the platform one.
    branding: Branding
): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logoImage = await embedBrandLogo(pdf, branding);

    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 28;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    let pageNumber = 1;

    const RED = rgb(0.78, 0.10, 0.10);
    const RED_BG = rgb(1.0, 0.91, 0.91);
    const AMBER = rgb(0.75, 0.45, 0.07);

    const drawPageFooter = () => {
        page.drawLine({ start: { x: margin, y: margin - 6 }, end: { x: pageWidth - margin, y: margin - 6 }, color: rgb(0.82, 0.84, 0.87), thickness: 0.8 });
        page.drawText(`Page ${pageNumber}`, { x: margin, y: margin - 20, size: 9, font, color: rgb(0.42, 0.46, 0.52) });
    };

    const addNewPage = () => {
        drawPageFooter();
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        pageNumber += 1;
    };

    // Header band
    page.drawRectangle({ x: 0, y: pageHeight - 88, width: pageWidth, height: 88, color: rgb(0.10, 0.24, 0.44) });
    if (logoImage) {
        const logoHeight = 38;
        const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
        page.drawImage(logoImage, { x: margin, y: pageHeight - 64, width: logoWidth, height: logoHeight });
    }
    page.drawText(branding.siteName.toUpperCase(), { x: margin + 60, y: pageHeight - 42, size: 20, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('Professional Device Quality Assessment', { x: margin + 60, y: pageHeight - 58, size: 10, font, color: rgb(0.88, 0.92, 0.98) });
    page.drawText(`Generated: ${formatGeneratedDateTime(timeZone)}`, { x: pageWidth - 220, y: pageHeight - 46, size: 9, font, color: rgb(0.93, 0.95, 0.99) });

    y = pageHeight - 108;
    page.drawText('Executive Summary', { x: margin, y, size: 13, font: boldFont, color: rgb(0.1, 0.2, 0.3) });
    y -= 18;

    const staleCount = Number(issueRows[0]?.[1] || 0);
    const summaryTotalIssues = issueRows.reduce((sum, row) => sum + Number(row[1]), 0);
    const cards = [
        { title: 'Systems Analyzed', value: String(rows.length), color: rgb(0.13, 0.45, 0.75) },
        { title: 'Issue Flags Raised', value: String(summaryTotalIssues), color: rgb(0.75, 0.27, 0.24) },
        { title: 'Tampered Systems', value: issueRows[3]?.[1] || '0', color: rgb(0.53, 0.19, 0.64) },
        { title: `Stale Reports (>${STALE_DAYS}d)`, value: String(staleCount), color: staleCount > 0 ? rgb(0.78, 0.10, 0.10) : rgb(0.22, 0.58, 0.26) },
    ];
    const cardWidth = (pageWidth - margin * 2 - 24) / 4;
    cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + 8);
        page.drawRectangle({ x, y: y - 48, width: cardWidth, height: 48, color: rgb(0.97, 0.98, 1), borderColor: rgb(0.88, 0.90, 0.94), borderWidth: 1 });
        page.drawRectangle({ x, y: y - 48, width: 4, height: 48, color: card.color });
        page.drawText(card.title, { x: x + 10, y: y - 18, size: 8.5, font, color: rgb(0.38, 0.42, 0.48) });
        page.drawText(card.value, { x: x + 10, y: y - 38, size: 16, font: boldFont, color: rgb(0.14, 0.18, 0.24) });
    });
    y -= 66;

    page.drawText('Issue Breakdown', { x: margin, y, size: 12, font: boldFont, color: rgb(0.1, 0.2, 0.3) });
    y -= 8;
    const issueCols = { issue: 200, count: 56, systems: pageWidth - margin * 2 - 256 };
    page.drawRectangle({ x: margin, y: y - 14, width: pageWidth - margin * 2, height: 14, color: rgb(0.15, 0.32, 0.54) });
    page.drawText('Issue', { x: margin + 6, y: y - 10, size: 8, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('Count', { x: margin + issueCols.issue + 6, y: y - 10, size: 8, font: boldFont, color: rgb(1, 1, 1) });
    page.drawText('Affected Systems', { x: margin + issueCols.issue + issueCols.count + 6, y: y - 10, size: 8, font: boldFont, color: rgb(1, 1, 1) });
    y -= 16;
    issueRows.forEach((row, index) => {
        const issue = row[0];
        const count = row[1];
        const affected = row[2] || '-';
        const lines: string[] = [];
        const words = affected.split(', ');
        let line = '';
        words.forEach((word) => {
            const candidate = line ? `${line}, ${word}` : word;
            if (font.widthOfTextAtSize(candidate, 8) <= issueCols.systems - 10) line = candidate;
            else {
                if (line) lines.push(line);
                line = word;
            }
        });
        if (line) lines.push(line);
        const rowHeight = Math.max(14, lines.length * 10 + 4);
        if (y < margin + rowHeight + 28) addNewPage();
        const isStaleRow = index === 0;
        page.drawRectangle({
            x: margin, y: y - rowHeight, width: pageWidth - margin * 2, height: rowHeight,
            color: isStaleRow && Number(count) > 0 ? RED_BG : index % 2 === 0 ? rgb(0.985, 0.992, 1) : rgb(1, 1, 1),
            borderColor: rgb(0.88, 0.90, 0.94), borderWidth: 0.6,
        });
        const issueColor = isStaleRow && Number(count) > 0 ? RED : rgb(0.17, 0.2, 0.25);
        page.drawText(issue, { x: margin + 6, y: y - 10, size: 8, font, color: issueColor });
        page.drawText(count, { x: margin + issueCols.issue + 10, y: y - 10, size: 8, font: boldFont, color: issueColor });
        lines.forEach((ln, i) => {
            page.drawText(ln, { x: margin + issueCols.issue + issueCols.count + 6, y: y - 10 - i * 10, size: 8, font, color: issueColor });
        });
        y -= rowHeight + 2;
    });

    y -= 8;
    if (y < margin + 170) addNewPage();
    page.drawText('Detailed Device Assessment', { x: margin, y, size: 12, font: boldFont, color: rgb(0.1, 0.2, 0.3) });
    y -= 4;

    page.drawRectangle({ x: margin, y: y - 12, width: 10, height: 10, color: RED_BG, borderColor: RED, borderWidth: 0.6 });
    page.drawText('Red row = QC not run in over 30 days', { x: margin + 14, y: y - 10, size: 7.5, font, color: RED });
    y -= 18;

    const columns = [
        { key: 'serial', title: 'Serial No.', width: 84 },
        { key: 'computer', title: 'Computer', width: 92 },
        { key: 'device', title: 'Device ID', width: 74 },
        { key: 'date', title: 'Shift Date', width: 56 },
        { key: 'proc', title: 'Processor', width: 84 },
        { key: 'ram', title: 'RAM', width: 32 },
        { key: 'os', title: 'OS', width: 54 },
        { key: 'windows', title: 'Windows', width: 50 },
        { key: 'free', title: 'Free %', width: 38 },
        { key: 'tamper', title: 'Tamper', width: 44 },
        { key: 'thermal', title: 'Thermal', width: 42 },
        { key: 'grade', title: 'Grade', width: 36 },
        { key: 'user', title: 'Client', width: 74 },
    ];
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);

    const drawTableHeader = () => {
        page.drawRectangle({ x: margin, y: y - 16, width: tableWidth, height: 16, color: rgb(0.16, 0.35, 0.58) });
        let x = margin + 4;
        columns.forEach((col) => {
            page.drawText(col.title, { x, y: y - 12, size: 7.5, font: boldFont, color: rgb(1, 1, 1) });
            x += col.width;
        });
        y -= 18;
    };
    drawTableHeader();

    rows.forEach((entry, index) => {
        if (y < margin + 36) {
            addNewPage();
            page.drawText('Detailed Device Assessment (cont.)', { x: margin, y, size: 12, font: boldFont, color: rgb(0.1, 0.2, 0.3) });
            y -= 18;
            drawTableHeader();
        }
        const values = entry.rowValues;
        const baseRowColor = entry.isStale ? RED_BG : index % 2 === 0 ? rgb(0.99, 0.995, 1) : rgb(1, 1, 1);
        page.drawRectangle({
            x: margin, y: y - 14, width: tableWidth, height: 14, color: baseRowColor,
            borderColor: entry.isStale ? rgb(0.88, 0.22, 0.22) : rgb(0.90, 0.92, 0.95), borderWidth: entry.isStale ? 0.8 : 0.5,
        });
        const freePercentLabel = entry.freePercent == null ? '-' : `${entry.freePercent.toFixed(1)}%`;
        // Indices follow HEADERS / rowValues order.
        const cells = [
            entry.serialNo || String(values[17] || '-'),
            String(values[1] || '-'),
            String(values[2] || '-'),
            String(values[3] || '-'),
            String(entry.compactProcessor || '-'),
            String(values[9] || '-'),
            String(values[4] || '-'),
            String(values[5] || '-'),
            freePercentLabel,
            entry.isTampered ? 'Tampered' : 'Clean',
            entry.hasThermalIssue ? 'Risk' : 'OK',
            String(values[15] || '-'),
            String(values[21] || '-'),
        ];

        let x = margin + 4;
        cells.forEach((cell, cellIndex) => {
            const colWidth = columns[cellIndex].width - 6;
            let fillColor: ReturnType<typeof rgb> | null = null;
            let txtColor = entry.isStale ? RED : rgb(0.15, 0.19, 0.24);

            if (cellIndex === 8 && entry.freePercent != null) {
                if (entry.freePercent <= 10) { fillColor = rgb(0.91, 0.20, 0.16); txtColor = rgb(1, 1, 1); }
                else if (entry.freePercent < 25) { fillColor = rgb(0.98, 0.90, 0.25); txtColor = rgb(0.3, 0.2, 0.0); }
            } else if (cellIndex === 9 && entry.isTampered) {
                fillColor = rgb(0.91, 0.20, 0.16); txtColor = rgb(1, 1, 1);
            } else if (cellIndex === 10 && entry.hasThermalIssue) {
                fillColor = rgb(0.98, 0.90, 0.25); txtColor = AMBER;
            } else if (cellIndex === 7 && entry.isWindowsInactive) {
                fillColor = rgb(0.91, 0.20, 0.16); txtColor = rgb(1, 1, 1);
            }

            if (fillColor) {
                page.drawRectangle({ x: x - 2, y: y - 13, width: columns[cellIndex].width - 2, height: 12, color: fillColor });
            }

            const fontSize = cellIndex === 1 || cellIndex === 2 ? 6.8 : 7.5;
            const finalText = truncateToWidth(cell, colWidth, fontSize, font);
            page.drawText(finalText, { x, y: y - 10, size: fontSize, font, color: txtColor });
            x += columns[cellIndex].width;
        });
        y -= 14;
    });

    drawPageFooter();
    return pdf.save();
}

const HEADERS = [
    'S.No', 'Computer Name', 'Device ID', 'Shift Date', 'OS Edition', 'Windows', 'Version', 'Windows Last Updated',
    'Processor', 'RAM (GB)', 'Antivirus', 'Total Storage (GB)', 'Free Storage (GB)', 'Disk Health (Per Drive)',
    'Tamper Status', 'Grade', 'Score', 'Serial No', 'MAC Address', 'Manufacturer', 'Model', 'Client',
    'Physical Condition', 'Scratches & Dents',
];

export interface ExportOptions {
    search?: string;
    userIdParam?: string | null;
    format: string;
    timeZone: string;
    /** Host the export was requested on — selects the branding it carries. */
    host?: string | null;
}

export interface ExportResult {
    body: ArrayBuffer;
    contentType: string;
    filename: string;
}

export async function exportQcResults(user: AuthenticatedUser, opts: ExportOptions): Promise<ExportResult> {
    let userId: number | undefined;
    if (opts.userIdParam) {
        const requested = parseInt(opts.userIdParam, 10);
        if (!Number.isFinite(requested)) throw new ValidationError('Invalid userId');
        if (SELF_ONLY_ROLES.includes(user.role) && requested !== user.id) {
            throw new ForbiddenError('You can only filter your own results');
        }
        userId = requested;
    }

    const results = await repo.listLatestPerMachineForExport(user, { search: opts.search, userId });

    const issueMap: Record<IssueKey, Set<string>> = {
        stale: new Set(), criticalStorage: new Set(), lowStorage: new Set(),
        tampered: new Set(), inactiveWindows: new Set(), thermal: new Set(),
    };
    const now = new Date();
    const staleThresholdMs = STALE_DAYS * 24 * 60 * 60 * 1000;

    const exportRows: ExportRow[] = results.map((resultRow, index) => {
        const r = resultRow as JsonRecord;
        const sysInfo = (r.system_info_json as JsonRecord | null) || {};
        const storageInfo = (r.storage_details_json as StorageInfo | null) || {};

        const volumes = Array.isArray(storageInfo.volumes) ? storageInfo.volumes : [];
        const totalStorageBytes = volumes.reduce((sum, vol) => sum + (typeof vol?.totalBytes === 'number' ? vol.totalBytes : 0), 0);
        const freeStorageBytes = volumes.reduce((sum, vol) => sum + (typeof vol?.freeBytes === 'number' ? vol.freeBytes : 0), 0);
        const freePercent = totalStorageBytes > 0 ? (freeStorageBytes / totalStorageBytes) * 100 : null;

        const { label: diskHealthLabel, isTampered } = getStorageHealthSummary(storageInfo);

        const isActivated = sysInfo.isWindowsActivated;
        const activationLabel = typeof isActivated === 'boolean'
            ? isActivated ? 'Active' : 'Not Active'
            : ((sysInfo.windowsActivationStatus as string | undefined) || '');
        const isWindowsInactive = activationLabel.toLowerCase().includes('not active') || activationLabel.toLowerCase().includes('inactive');

        const { edition: parsedEdition, release: winRelease } = parseWindowsVersion(
            (sysInfo.osVersion as string | undefined) || '',
            (sysInfo.windowsProductName as string | undefined) || ''
        ) ?? { edition: '', release: '' };
        const windowsProductName = (sysInfo.windowsProductName as string | undefined) || '';
        const osEdition = windowsProductName ? cleanWindowsProductName(windowsProductName, parsedEdition) : parsedEdition;
        const rawAntivirus = (sysInfo.antivirusStatus as string | undefined) || '';
        const antivirus = deduplicateAntivirus(rawAntivirus);
        const ramTotal = toFiniteNumber(r.ram_total) ?? 0;
        const ramGb = ramTotal > 0 ? Math.round(ramTotal / (1024 * 1024 * 1024)) : '';
        const compactProcessor = toCompactProcessor((r.cpu_model as string | null | undefined) || '');
        const computerName = ((r.computer_name as string | undefined) || (r.machine_identifier as string | undefined) || `Machine ${index + 1}`);
        const riskFlags = (r.risk_flags as JsonRecord | null) || {};
        const hasThermalIssue = riskFlags.thermal === true;
        const serialNo = (r.system_serial as string | undefined) || '';

        const lastReportDate = parseDbTimestamp(r.timestamp as string | Date | null | undefined);
        const isStale = lastReportDate ? (now.getTime() - lastReportDate.getTime()) > staleThresholdMs : false;

        if (isStale) issueMap.stale.add(computerName);
        if (freePercent != null && freePercent <= 10) issueMap.criticalStorage.add(computerName);
        if (freePercent != null && freePercent < 25) issueMap.lowStorage.add(computerName);
        if (isTampered) issueMap.tampered.add(computerName);
        if (isWindowsInactive) issueMap.inactiveWindows.add(computerName);
        if (hasThermalIssue) issueMap.thermal.add(computerName);

        const rowValues = [
            String(index + 1),
            (r.computer_name as string | undefined) || '',
            // machine_identifier is machines.machine_id; r.machine_id is the FK integer.
            (r.machine_identifier as string | undefined) || '',
            formatShiftDate((r.timestamp as string | Date | null | undefined) || null, opts.timeZone),
            osEdition,
            activationLabel,
            winRelease,
            formatShiftDate((sysInfo.windowsLastUpdatedAt as string | Date | null | undefined) || null, opts.timeZone),
            compactProcessor,
            String(ramGb),
            antivirus,
            totalStorageBytes > 0 ? formatBytes(totalStorageBytes) : '',
            freeStorageBytes > 0 ? formatBytes(freeStorageBytes) : '',
            diskHealthLabel,
            isTampered ? 'Tampered' : 'Clean',
            (r.health_grade as string | undefined) || '',
            r.health_score != null ? String(r.health_score) : '',
            serialNo,
            (r.mac_address as string | undefined) || '',
            (r.system_manufacturer as string | undefined) || '',
            (r.system_model as string | undefined) || '',
            (r.technician_name as string | undefined) || (r.technician_username as string | undefined) || '',
            (r.physical_condition as string | undefined) || '',
            (r.scratches_and_dents as string | undefined) || '',
        ];

        return { rowValues, freePercent, isWindowsInactive, isTampered, hasThermalIssue, isStale, computerName, compactProcessor, serialNo };
    });

    const issueRows = getIssueSummaryRows(issueMap);
    const dateStamp = toAppZoneDateStamp();

    if (opts.format === 'pdf') {
        const pdfBuffer = await buildPdfBuffer(exportRows, issueRows, opts.timeZone, await getBrandingForHost(opts.host));
        return {
            body: toArrayBuffer(pdfBuffer),
            contentType: 'application/pdf',
            filename: `qc_results_export_${dateStamp}.pdf`,
        };
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('QC Results');
    worksheet.addRow(HEADERS);
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    // One entry per HEADERS column, in the same order.
    worksheet.columns = [
        { width: 8 }, { width: 24 }, { width: 22 }, { width: 14 }, { width: 24 }, { width: 14 },
        { width: 12 }, { width: 16 }, { width: 22 }, { width: 10 }, { width: 20 }, { width: 16 },
        { width: 16 }, { width: 36 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 20 },
        { width: 20 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 },
    ];

    // 1-based column positions in HEADERS.
    const freeStorageColumnIndex = 13;
    const windowsColumnIndex = 6;
    const diskHealthColumnIndex = 14;
    const tamperStatusColumnIndex = 15;

    exportRows.forEach((entry) => {
        const row = worksheet.addRow(entry.rowValues);
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            };
            cell.alignment = { vertical: 'middle', wrapText: true };
        });

        if (entry.isStale) {
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } };
                cell.font = { color: { argb: 'FF8B0000' } };
            });
        } else if (row.number % 2 === 0) {
            row.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
            });
        }

        const freeStorageCell = worksheet.getCell(row.number, freeStorageColumnIndex);
        if (entry.freePercent != null && entry.freePercent <= 10) {
            freeStorageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
            freeStorageCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        } else if (entry.freePercent != null && entry.freePercent < 25) {
            freeStorageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
            freeStorageCell.font = { color: { argb: 'FF000000' }, bold: true };
        }

        if (entry.isWindowsInactive) {
            const windowsCell = worksheet.getCell(row.number, windowsColumnIndex);
            windowsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
            windowsCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        }

        if (entry.isTampered) {
            const diskHealthCell = worksheet.getCell(row.number, diskHealthColumnIndex);
            const tamperCell = worksheet.getCell(row.number, tamperStatusColumnIndex);
            [diskHealthCell, tamperCell].forEach((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            });
        } else if (entry.hasThermalIssue) {
            const diskHealthCell = worksheet.getCell(row.number, diskHealthColumnIndex);
            diskHealthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        }
    });

    const summarySheet = workbook.addWorksheet('Issue Summary');
    summarySheet.addRow(['Issue Type', 'Count', 'Affected Systems']);
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F6000' } };
    summarySheet.columns = [{ width: 34 }, { width: 12 }, { width: 110 }];

    issueRows.forEach((row) => {
        const added = summarySheet.addRow(row);
        added.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            };
            cell.alignment = { vertical: 'top', wrapText: true };
        });
    });

    const fileBuffer = await workbook.xlsx.writeBuffer();
    return {
        body: toArrayBuffer(fileBuffer as ArrayBuffer),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `qc_results_export_${dateStamp}.xlsx`,
    };
}

// ────────────────────────────────────────────────────────────────────────────────
// Individual report PDF (mirrors /report/[id] page layout)
// ────────────────────────────────────────────────────────────────────────────────

type TestResultRow = {
    test_type: string;
    grade: string;
    score: number | null;
    passed: boolean;
    message: string | null;
    details_json: unknown;
};

type SampleRecord = Record<string, unknown>;

function safeStr(v: unknown): string {
    if (v == null) return '';
    const str = String(v);
    // pdf-lib's StandardFonts use WinAnsiEncoding which can't handle full Unicode.
    // Replace common unsupported characters with ASCII equivalents, and default to '?' for others.
    return str.replace(/[^\x00-\x7F\xA0-\xFF]/g, (char) => {
        switch (char) {
            case '✓': return '[Pass]';
            case '✗': return '[Fail]';
            case '—':
            case '–': return '-';
            case '“':
            case '”': return '"';
            case '‘':
            case '’': return "'";
            case '©': return '(c)';
            case '®': return '(r)';
            case '™': return '(tm)';
            case '°': return ' deg';
            default: return '?';
        }
    });
}

function safeNum(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function formatDbDateTimeSimple(value: unknown, timeZone = APP_TIME_ZONE): string {
    const d = parseDbTimestamp(value as string | Date | null | undefined);
    if (!d) return '-';
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone });
}

function formatDbDateSimple(value: unknown, timeZone = APP_TIME_ZONE): string {
    const d = parseDbTimestamp(value as string | Date | null | undefined);
    if (!d) return '-';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone });
}

function gradeColorRgb(grade: string): [number, number, number] {
    switch (grade) {
        case 'A+': return [0.07, 0.53, 0.31];
        case 'A':  return [0.13, 0.55, 0.23];
        case 'B':  return [0.09, 0.52, 0.52];
        case 'C':  return [0.70, 0.40, 0.05];
        case 'D':  return [0.78, 0.28, 0.00];
        default:   return [0.50, 0.50, 0.50];
    }
}

function gradeBgRgb(grade: string): [number, number, number] {
    switch (grade) {
        case 'A+': return [0.88, 0.98, 0.93];
        case 'A':  return [0.90, 0.98, 0.89];
        case 'B':  return [0.88, 0.97, 0.97];
        case 'C':  return [1.00, 0.95, 0.80];
        case 'D':  return [1.00, 0.92, 0.82];
        default:   return [0.94, 0.94, 0.94];
    }
}

function gradeLabelStr(grade: string): string {
    switch (grade) {
        case 'A+': return 'Certified Premium';
        case 'A':  return 'Certified';
        case 'B':  return 'Good Condition';
        case 'C':  return 'Acceptable';
        case 'D':  return 'Below Average';
        default:   return 'Unknown';
    }
}

function winActivationText(sysInfo: JsonRecord): string {
    const isActivated = sysInfo.isWindowsActivated;
    const status = safeStr(sysInfo.windowsActivationStatus);
    if (typeof isActivated === 'boolean') {
        return isActivated ? `Activated${status ? ` (${status})` : ''}` : `Not Activated${status ? ` (${status})` : ''}`;
    }
    return status || 'Unknown';
}

function winVersionText(sysInfo: JsonRecord): string {
    const osRaw = safeStr(sysInfo.osVersion);
    const prodName = safeStr(sysInfo.windowsProductName);
    const { edition, release } = parseWindowsVersion(osRaw, prodName) ?? { edition: '', release: '' };
    const finalEdition = prodName ? cleanWindowsProductName(prodName, edition) : edition;
    if (release) return `${finalEdition} ${release}`;
    return finalEdition || 'Unknown';
}

function antivirusTextStr(sysInfo: JsonRecord): string {
    const healthy = sysInfo.isAntivirusHealthy;
    const rawStatus = safeStr(sysInfo.antivirusStatus);
    const status = deduplicateAntivirus(rawStatus);
    if (typeof healthy === 'boolean') {
        return healthy ? `Healthy${status ? ` (${status})` : ''}` : `Not Healthy${status ? ` (${status})` : ''}`;
    }
    return status || 'Unknown';
}

function storageTotalLabelStr(storageJson: unknown): string {
    const st = (storageJson as JsonRecord | null) || {};
    const vols = Array.isArray(st.volumes) ? (st.volumes as StorageVolume[]) : [];
    const totalBytes = vols.reduce((s, v) => s + (typeof v?.totalBytes === 'number' ? v.totalBytes : 0), 0);
    if (totalBytes > 0) return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    const cap = safeNum(st.totalCapacityGB);
    return cap ? `${cap.toFixed(0)} GB` : 'N/A';
}

/** Build a single-page A4-portrait PDF replicating the /report/[id] layout. */
export async function buildIndividualReportPdf(
    rec: SampleRecord,
    testResults: TestResultRow[],
    timeZone = APP_TIME_ZONE,
    /** Caller-resolved branding; falls back to the platform brand. */
    resolvedBranding?: Branding
): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const branding = resolvedBranding ?? await getBranding();
    // A4 portrait: 595 x 842 pts
    const PW = 595;
    const PH = 842;
    const page = pdf.addPage([PW, PH]);
    const font      = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont  = await pdf.embedFont(StandardFonts.HelveticaBold);
    const monoFont  = await pdf.embedFont(StandardFonts.Courier);

    const M = 36; // margin
    const contentW = PW - M * 2;
    let y = PH - M;

    const drawText = (text: string, x: number, yy: number, size: number, f: PDFFont, color = rgb(0.1, 0.1, 0.1)) =>
        page.drawText(text, { x, y: yy, size, font: f, color });

    const hRule = (yy: number, thick = 0.8, clr = rgb(0.7, 0.7, 0.7)) =>
        page.drawLine({ start: { x: M, y: yy }, end: { x: PW - M, y: yy }, thickness: thick, color: clr });

    const twoColRow = (
        label: string, value: string, x1: number, x2: number, yy: number,
        labelSz = 8, valSz = 8
    ) => {
        drawText(label, x1, yy, labelSz, font, rgb(0.4, 0.4, 0.4));
        const maxW = (PW - M) - x2 - 4;
        let v = value;
        while (v.length > 0 && font.widthOfTextAtSize(v, valSz) > maxW) v = v.slice(0, -1);
        if (v !== value) v += '…';
        drawText(v, x2, yy, valSz, font, rgb(0.1, 0.1, 0.1));
        const lineY = yy - 4;
        for (let lx = x1; lx < PW - M; lx += 4) {
            page.drawLine({ start: { x: lx, y: lineY }, end: { x: Math.min(lx + 2, PW - M), y: lineY }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
        }
    };

    // ── HEADER BAND ──────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: PH - 52, width: PW, height: 52, color: rgb(0.06, 0.10, 0.18) });
    drawText('QC Certificate', M, PH - 22, 16, boldFont, rgb(1, 1, 1));
    drawText('Quality Control Report', M, PH - 36, 8, font, rgb(0.7, 0.8, 0.9));
    const testId = `Test ID: #${safeStr(rec.id)}`;
    const testIdW = boldFont.widthOfTextAtSize(testId, 9);
    drawText(testId, PW - M - testIdW, PH - 22, 9, boldFont, rgb(1, 1, 1));
    const tsStr = formatDbDateTimeSimple(rec.timestamp, timeZone);
    const tsW = font.widthOfTextAtSize(tsStr, 8);
    drawText(tsStr, PW - M - tsW, PH - 36, 8, font, rgb(0.7, 0.8, 0.9));
    y = PH - 64;

    // ── GRADE HERO PANEL ──────────────────────────────────────────────────────────
    const grade = safeStr(rec.health_grade);
    const score = safeNum(rec.health_score);
    const [gr, gg, gb2] = gradeColorRgb(grade);
    const [bgr, bgg, bgb] = gradeBgRgb(grade);
    page.drawRectangle({ x: M, y: y - 58, width: contentW, height: 58, color: rgb(bgr, bgg, bgb), borderColor: rgb(gr, gg, gb2), borderWidth: 1 });
    drawText(`${branding.siteName} Health Score`, M + 10, y - 14, 7.5, font, rgb(0.35, 0.35, 0.35));
    drawText(grade || 'N/A', M + 10, y - 38, 26, boldFont, rgb(gr, gg, gb2));
    drawText(gradeLabelStr(grade), M + 10, y - 50, 8, font, rgb(0.35, 0.35, 0.35));
    if (score !== null) drawText(`${score}/100`, M + 68, y - 42, 14, boldFont, rgb(gr, gg, gb2));

    // Device ID on right
    const devId = safeStr(rec.machine_identifier || rec.machine_id);
    drawText('Device ID', PW - M - 120, y - 14, 7, font, rgb(0.4, 0.4, 0.4));
    drawText(devId.slice(0, 20), PW - M - 120, y - 28, 8, monoFont, rgb(0.1, 0.1, 0.1));
    const reportId = safeStr(rec.report_id);
    if (reportId) {
        drawText('Report ID', PW - M - 120, y - 42, 7, font, rgb(0.4, 0.4, 0.4));
        const shortId = reportId.length > 18 ? reportId.slice(0, 18) + '…' : reportId;
        drawText(shortId, PW - M - 120, y - 55, 7, monoFont, rgb(0.3, 0.3, 0.3));
    }
    y -= 68;

    // ── SYSTEM INFO GRID (two columns) ────────────────────────────────────────────
    const col1x = M;
    const col2x = M + contentW / 2 + 8;
    const colW  = contentW / 2 - 10;
    const labelX1 = col1x;
    const valX1   = col1x + colW * 0.42;
    const labelX2 = col2x;
    const valX2   = col2x + colW * 0.42;

    const drawSectionHeader = (text: string, xPos: number, yy: number) => {
        drawText(text.toUpperCase(), xPos, yy, 6.5, boldFont, rgb(0.15, 0.15, 0.15));
        page.drawLine({ start: { x: xPos, y: yy - 4 }, end: { x: xPos + colW, y: yy - 4 }, thickness: 1, color: rgb(0.15, 0.15, 0.15) });
    };

    drawSectionHeader('System Specification', col1x, y);
    drawSectionHeader('Hardware Details', col2x, y);
    y -= 14;

    const sysInfo = ((rec.system_info_json as JsonRecord | null) || {});
    const storageJson = rec.storage_details_json;
    const battJson = (rec.battery_details_json as JsonRecord | null);
    const ramGbRaw = safeNum(rec.ram_total);
    const ramGbVal = ramGbRaw ? `${Math.round(ramGbRaw / (1024 * 1024 * 1024))} GB` : 'N/A';
    const battWear = battJson ? (battJson.isTampered ? 'Tampered' : `Wear: ${safeStr(battJson.wearLevelPercent)}%`) : 'N/A';
    const battBrand = battJson ? safeStr(battJson.manufactureName || battJson.name || battJson.partNumber) : '';

    const leftRows: [string, string][] = [
        ['Manufacturer', safeStr(rec.system_manufacturer)],
        ['Model',        safeStr(rec.system_model)],
        ['Computer',     safeStr(rec.computer_name)],
        ['Serial No.',   safeStr(rec.system_serial)],
        ['MAC Address',  safeStr(rec.mac_address)],
        ['Windows',      winVersionText(sysInfo)],
        ['Win Updated',  formatDbDateSimple(sysInfo.windowsLastUpdatedAt, timeZone)],
        ['Activation',   winActivationText(sysInfo)],
        ['Antivirus',    antivirusTextStr(sysInfo)],
    ];

    const rightRows: [string, string][] = [
        ['Processor',    safeStr(rec.cpu_model)],
        ['RAM',          ramGbVal],
        ['Storage',      storageTotalLabelStr(storageJson)],
        ['Battery',      battWear],
        ['Phys. Condition', safeStr(rec.physical_condition)],
        ['Scratches/Dents', safeStr(rec.scratches_and_dents)],
    ];
    if (battBrand) rightRows.push(['Bat. Brand', battBrand]);

    const rowH = 14;
    const startY = y;
    leftRows.forEach((row, i) => {
        twoColRow(row[0], row[1], labelX1, valX1, startY - i * rowH);
    });
    rightRows.forEach((row, i) => {
        twoColRow(row[0], row[1], labelX2, valX2, startY - i * rowH);
    });
    y = startY - Math.max(leftRows.length, rightRows.length) * rowH - 10;

    // ── DIAGNOSTIC RESULTS TABLE ──────────────────────────────────────────────────
    hRule(y + 6, 1.2, rgb(0.06, 0.10, 0.18));
    drawText('DIAGNOSTIC RESULTS', M, y - 2, 6.5, boldFont, rgb(0.1, 0.1, 0.1));
    y -= 14;

    const colWidths = [130, 44, 44, contentW - 218];
    const colHeaders = ['Test Component', 'Grade', 'Score', 'Notes / Details'];
    page.drawRectangle({ x: M, y: y - 13, width: contentW, height: 13, color: rgb(0.93, 0.94, 0.96) });
    let hx = M + 4;
    colHeaders.forEach((h, ci) => {
        drawText(h, hx, y - 10, 7.5, boldFont, rgb(0.2, 0.2, 0.3));
        hx += colWidths[ci];
    });
    y -= 15;

    // Filter out SMART if Storage present (same logic as report page)
    const rawTests = Array.isArray(testResults) ? testResults : [];
    const hasStorage = rawTests.some(t => safeStr(t.test_type).toLowerCase() === 'storage');
    const filteredTests = rawTests.filter(t => !(hasStorage && safeStr(t.test_type).toLowerCase() === 'smart'));

    for (const [idx, test] of filteredTests.entries()) {
        if (y < M + 40) break;
        const tGrade = safeStr(test.grade);
        const [tgr, tgg, tgb] = tGrade ? gradeColorRgb(tGrade) : [0.3, 0.3, 0.3];
        const [tbgr, tbgg, tbgb] = tGrade ? gradeBgRgb(tGrade) : [0.95, 0.95, 0.95];
        const rowBg = idx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.975, 0.978, 0.985);
        const rH = 13;
        page.drawRectangle({ x: M, y: y - rH, width: contentW, height: rH, color: rowBg, borderColor: rgb(0.88, 0.88, 0.92), borderWidth: 0.3 });

        let cx = M + 4;
        drawText(safeStr(test.test_type), cx, y - 10, 7.5, font, rgb(0.15, 0.15, 0.15));
        cx += colWidths[0];

        if (tGrade) {
            page.drawRectangle({ x: cx, y: y - rH + 2, width: 34, height: rH - 4, color: rgb(tbgr, tbgg, tbgb) });
            const gw = boldFont.widthOfTextAtSize(tGrade, 7);
            drawText(tGrade, cx + (34 - gw) / 2, y - 9, 7, boldFont, rgb(tgr, tgg, tgb));
        } else {
            const passTxt = test.passed ? 'PASS' : 'FAIL';
            const pClr = test.passed ? rgb(0.13, 0.55, 0.23) : rgb(0.75, 0.10, 0.10);
            const pw2 = boldFont.widthOfTextAtSize(passTxt, 7);
            drawText(passTxt, cx + (34 - pw2) / 2, y - 9, 7, boldFont, pClr);
        }
        cx += colWidths[1];

        const scoreStr = test.score != null ? String(test.score) : '—';
        const sw = font.widthOfTextAtSize(scoreStr, 7.5);
        drawText(scoreStr, cx + (colWidths[2] - sw) / 2, y - 9, 7.5, font, rgb(0.2, 0.2, 0.2));
        cx += colWidths[2];

        const notesW = colWidths[3] - 6;
        let noteText = safeStr(test.message);
        if (Array.isArray(test.details_json) && (test.details_json as unknown[]).length > 0) {
            const extra = safeStr((test.details_json as unknown[])[0]);
            if (extra && extra !== noteText) noteText += (noteText ? ' · ' : '') + extra;
        }
        while (noteText.length > 0 && font.widthOfTextAtSize(noteText, 7) > notesW) noteText = noteText.slice(0, -1);
        if (noteText.length < safeStr(test.message).length) noteText += '…';
        drawText(noteText, cx, y - 9, 7, font, rgb(0.35, 0.35, 0.35));

        y -= rH + 1;
    }

    // ── TECHNICIAN NOTES ─────────────────────────────────────────────────────────
    const techNotes = safeStr(rec.technician_notes);
    if (techNotes && y > M + 50) {
        y -= 8;
        page.drawRectangle({ x: M, y: y - 28, width: contentW, height: 28, color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.82, 0.82, 0.82), borderWidth: 0.6 });
        drawText('TECHNICIAN NOTES', M + 6, y - 8, 6, boldFont, rgb(0.4, 0.4, 0.4));
        let nt = techNotes;
        while (nt.length > 0 && font.widthOfTextAtSize(nt, 7.5) > contentW - 12) nt = nt.slice(0, -1);
        if (nt !== techNotes) nt += '…';
        drawText(nt, M + 6, y - 20, 7.5, font, rgb(0.25, 0.25, 0.25));
    }

    // ── FOOTER ───────────────────────────────────────────────────────────────────
    hRule(M + 22, 0.6, rgb(0.75, 0.75, 0.75));
    const footerItems: [string, number][] = [
        [`Generated by ${branding.siteName}`, M],
        [`App Version: ${(safeStr(rec.app_version) || 'Unknown').split('+')[0]}`, M + 120],
        [`Test ID: #${safeStr(rec.id)}`, M + 270],
        [`Date Printed: ${formatDateDMY(new Date())}`, M + 370],
    ];
    footerItems.forEach(([txt, x]) => drawText(txt, x, M + 12, 6.5, font, rgb(0.5, 0.5, 0.5)));

    return pdf.save();
}

// ────────────────────────────────────────────────────────────────────────────────
// Sample dataset export: 90 good + 10 poor, ZIP of PDFs or XLSX
// ────────────────────────────────────────────────────────────────────────────────

export interface SampleExportOptions {
    goodCount?: number;
    poorCount?: number;
    format: 'zip' | 'xlsx' | 'json';
    timeZone: string;
    /** Host the export was requested on — selects the branding it carries. */
    host?: string | null;
}

export interface SampleExportResult {
    body: ArrayBuffer;
    contentType: string;
    filename: string;
}

const GOOD_GRADES = ['A+', 'A', 'B'];
const POOR_GRADES = ['C', 'D'];

export async function exportSampleDataset(
    user: AuthenticatedUser,
    opts: SampleExportOptions
): Promise<SampleExportResult> {
    const goodCount = opts.goodCount ?? 90;
    const poorCount = opts.poorCount ?? 10;

    const results = await repo.listResultsByGradesForSample(user, {
        goodGrades: GOOD_GRADES,
        goodCount,
        poorGrades: POOR_GRADES,
        poorCount,
    });

    // ── JSON export (Client-Side Rendering Data) ───────────────────────────────────
    if (opts.format === 'json') {
        const resultIds = results.map(r => r.id as number).filter(Boolean);
        const allTestRows = await repo.listTestResultsForIds(resultIds);
        const testsByResultId = new Map<number, TestResultRow[]>();
        allTestRows.forEach((tr) => {
            const rid = tr.qc_result_id as number;
            if (!testsByResultId.has(rid)) testsByResultId.set(rid, []);
            testsByResultId.get(rid)!.push(tr as unknown as TestResultRow);
        });
        const combined = results.map(rec => ({
            ...rec,
            test_results: testsByResultId.get(rec.id as number) || []
        }));
        
        const jsonStr = JSON.stringify(combined);
        const encoder = new TextEncoder();
        
        return {
            body: encoder.encode(jsonStr).buffer as ArrayBuffer,
            contentType: 'application/json',
            filename: 'sample_data.json',
        };
    }

    const dateStamp = toAppZoneDateStamp();

    // ── XLSX export ────────────────────────────────────────────────────────────────
    if (opts.format === 'xlsx') {
        const issueMap: Record<IssueKey, Set<string>> = {
            stale: new Set(), criticalStorage: new Set(), lowStorage: new Set(),
            tampered: new Set(), inactiveWindows: new Set(), thermal: new Set(),
        };
        const now = new Date();
        const staleThresholdMs = STALE_DAYS * 24 * 60 * 60 * 1000;

        const exportRows: ExportRow[] = results.map((resultRow, index) => {
            const r = resultRow as JsonRecord;
            const sysInfo = (r.system_info_json as JsonRecord | null) || {};
            const storageInfo = (r.storage_details_json as StorageInfo | null) || {};

            const volumes = Array.isArray(storageInfo.volumes) ? storageInfo.volumes : [];
            const totalStorageBytes = volumes.reduce((sum, vol) => sum + (typeof vol?.totalBytes === 'number' ? vol.totalBytes : 0), 0);
            const freeStorageBytes = volumes.reduce((sum, vol) => sum + (typeof vol?.freeBytes === 'number' ? vol.freeBytes : 0), 0);
            const freePercent = totalStorageBytes > 0 ? (freeStorageBytes / totalStorageBytes) * 100 : null;

            const { label: diskHealthLabel, isTampered } = getStorageHealthSummary(storageInfo);

            const isActivated = sysInfo.isWindowsActivated;
            const activationLabel = typeof isActivated === 'boolean'
                ? isActivated ? 'Active' : 'Not Active'
                : ((sysInfo.windowsActivationStatus as string | undefined) || '');
            const isWindowsInactive = activationLabel.toLowerCase().includes('not active') || activationLabel.toLowerCase().includes('inactive');

            const { edition: parsedEdition, release: winRelease } = parseWindowsVersion(
                (sysInfo.osVersion as string | undefined) || '',
                (sysInfo.windowsProductName as string | undefined) || ''
            ) ?? { edition: '', release: '' };
            const windowsProductName = (sysInfo.windowsProductName as string | undefined) || '';
            const osEdition = windowsProductName ? cleanWindowsProductName(windowsProductName, parsedEdition) : parsedEdition;
            const rawAntivirus = (sysInfo.antivirusStatus as string | undefined) || '';
            const antivirus = deduplicateAntivirus(rawAntivirus);
            const ramTotal = toFiniteNumber(r.ram_total) ?? 0;
            const ramGb = ramTotal > 0 ? Math.round(ramTotal / (1024 * 1024 * 1024)) : '';
            const compactProcessor = toCompactProcessor((r.cpu_model as string | null | undefined) || '');
            const computerName = ((r.computer_name as string | undefined) || (r.machine_identifier as string | undefined) || `Machine ${index + 1}`);
            const riskFlags = (r.risk_flags as JsonRecord | null) || {};
            const hasThermalIssue = riskFlags.thermal === true;
            const serialNo = (r.system_serial as string | undefined) || '';

            const lastReportDate = parseDbTimestamp(r.timestamp as string | Date | null | undefined);
            const isStale = lastReportDate ? (now.getTime() - lastReportDate.getTime()) > staleThresholdMs : false;

            if (isStale) issueMap.stale.add(computerName);
            if (freePercent != null && freePercent <= 10) issueMap.criticalStorage.add(computerName);
            if (freePercent != null && freePercent < 25) issueMap.lowStorage.add(computerName);
            if (isTampered) issueMap.tampered.add(computerName);
            if (isWindowsInactive) issueMap.inactiveWindows.add(computerName);
            if (hasThermalIssue) issueMap.thermal.add(computerName);

            const rowValues = [
                String(index + 1),
                (r.computer_name as string | undefined) || '',
                // machine_identifier is machines.machine_id; r.machine_id is the FK integer.
                (r.machine_identifier as string | undefined) || '',
                formatShiftDate((r.timestamp as string | Date | null | undefined) || null, opts.timeZone),
                osEdition,
                activationLabel,
                winRelease,
                formatShiftDate((sysInfo.windowsLastUpdatedAt as string | Date | null | undefined) || null, opts.timeZone),
                compactProcessor,
                String(ramGb),
                antivirus,
                totalStorageBytes > 0 ? formatBytes(totalStorageBytes) : '',
                freeStorageBytes > 0 ? formatBytes(freeStorageBytes) : '',
                diskHealthLabel,
                isTampered ? 'Tampered' : 'Clean',
                (r.health_grade as string | undefined) || '',
                r.health_score != null ? String(r.health_score) : '',
                serialNo,
                (r.mac_address as string | undefined) || '',
                (r.system_manufacturer as string | undefined) || '',
                (r.system_model as string | undefined) || '',
                (r.technician_name as string | undefined) || (r.technician_username as string | undefined) || '',
            ];

            return { rowValues, freePercent, isWindowsInactive, isTampered, hasThermalIssue, isStale, computerName, compactProcessor, serialNo };
        });

        const issueRows = getIssueSummaryRows(issueMap);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('QC Results — Sample 100');
        worksheet.addRow(HEADERS);
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        // One entry per HEADERS column, in the same order.
        worksheet.columns = [
            { width: 8 }, { width: 24 }, { width: 22 }, { width: 14 }, { width: 24 }, { width: 14 },
            { width: 12 }, { width: 16 }, { width: 22 }, { width: 10 }, { width: 20 }, { width: 16 },
            { width: 16 }, { width: 36 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 20 },
            { width: 20 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 18 },
        ];

        // 1-based column positions in HEADERS.
        const freeStorageColIdx = 13;
        const windowsColIdx = 6;
        const diskHealthColIdx = 14;
        const tamperColIdx = 15;

        exportRows.forEach((entry) => {
            const row = worksheet.addRow(entry.rowValues);
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                };
                cell.alignment = { vertical: 'middle', wrapText: true };
            });

            if (entry.isStale) {
                row.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } };
                    cell.font = { color: { argb: 'FF8B0000' } };
                });
            } else if (row.number % 2 === 0) {
                row.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FBFF' } };
                });
            }

            const freeStorageCell = worksheet.getCell(row.number, freeStorageColIdx);
            if (entry.freePercent != null && entry.freePercent <= 10) {
                freeStorageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
                freeStorageCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            } else if (entry.freePercent != null && entry.freePercent < 25) {
                freeStorageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
                freeStorageCell.font = { color: { argb: 'FF000000' }, bold: true };
            }

            if (entry.isWindowsInactive) {
                const windowsCell = worksheet.getCell(row.number, windowsColIdx);
                windowsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
                windowsCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            }

            if (entry.isTampered) {
                const diskHealthCell = worksheet.getCell(row.number, diskHealthColIdx);
                const tamperCell = worksheet.getCell(row.number, tamperColIdx);
                [diskHealthCell, tamperCell].forEach((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
                    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                });
            } else if (entry.hasThermalIssue) {
                const diskHealthCell = worksheet.getCell(row.number, diskHealthColIdx);
                diskHealthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            }
        });

        // Issue Summary sheet
        const summarySheet = workbook.addWorksheet('Issue Summary');
        summarySheet.addRow(['Issue Type', 'Count', 'Affected Systems']);
        summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F6000' } };
        summarySheet.columns = [{ width: 34 }, { width: 12 }, { width: 110 }];
        issueRows.forEach((row) => {
            const added = summarySheet.addRow(row);
            added.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                    right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
                };
                cell.alignment = { vertical: 'top', wrapText: true };
            });
        });

        // Grade distribution meta sheet
        const metaSheet = workbook.addWorksheet('Dataset Info');
        metaSheet.addRow(['Pramaan Sample Dataset — 100 Reports']);
        metaSheet.getRow(1).font = { bold: true, size: 14 };
        metaSheet.addRow([]);
        metaSheet.addRow(['Grade', 'Count', 'Category']);
        metaSheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        metaSheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        const gradeCountMap: Record<string, number> = {};
        results.forEach((r) => {
            const g = (r.health_grade as string) || 'Unknown';
            gradeCountMap[g] = (gradeCountMap[g] || 0) + 1;
        });
        Object.entries(gradeCountMap).sort().forEach(([g, cnt]) => {
            const cat = GOOD_GRADES.includes(g) ? 'Good (A+/A/B)' : POOR_GRADES.includes(g) ? 'Poor (C/D)' : 'Other';
            metaSheet.addRow([g, cnt, cat]);
        });
        metaSheet.addRow([]);
        metaSheet.addRow(['Total records', results.length]);
        metaSheet.addRow(['Generated', formatGeneratedDateTime(APP_TIME_ZONE)]);
        metaSheet.addRow(['Filters applied', 'Excluded tampered/inconclusive storage & battery']);
        metaSheet.columns = [{ width: 18 }, { width: 12 }, { width: 30 }];

        const fileBuffer2 = await workbook.xlsx.writeBuffer();
        return {
            body: toArrayBuffer(fileBuffer2 as ArrayBuffer),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            filename: `pramaan_sample_100_${dateStamp}.xlsx`,
        };
    }

    // ── ZIP of individual PDFs ───────────────────────────────────────────────────
    const resultIds = results.map(r => r.id as number).filter(Boolean);
    const allTestRows = await repo.listTestResultsForIds(resultIds);

    // Group test rows by qc_result_id
    const testsByResultId = new Map<number, TestResultRow[]>();
    allTestRows.forEach((tr) => {
        const rid = tr.qc_result_id as number;
        if (!testsByResultId.has(rid)) testsByResultId.set(rid, []);
        testsByResultId.get(rid)!.push(tr as unknown as TestResultRow);
    });

    const zip = new JSZip();
    const pdfFolder = zip.folder('pramaan_reports')!;
    // Resolved once for the batch: the brand follows the host the export was
    // requested on, which is the same for every report in the zip.
    const exportBranding = await getBrandingForHost(opts.host);

    for (const rec of results) {
        const id = rec.id as number;
        const testRows = testsByResultId.get(id) || [];
        const pdfBytes = await buildIndividualReportPdf(rec, testRows, opts.timeZone, exportBranding);
        const serial = (rec.system_serial as string | undefined) || `id${id}`;
        const safeName = serial.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
        pdfFolder.file(`${safeName}_report_${id}.pdf`, pdfBytes);
    }

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return {
        body: zipBuffer,
        contentType: 'application/zip',
        filename: `pramaan_sample_100_reports_${dateStamp}.zip`,
    };
}
