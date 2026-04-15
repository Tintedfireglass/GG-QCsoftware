import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';
import { parseWindowsVersion, cleanWindowsProductName } from '@/lib/utils';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type SqlParam = string | number | boolean | null;

type IssueKey = 'criticalStorage' | 'lowStorage' | 'tampered' | 'inactiveWindows' | 'thermal';
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
    computerName: string;
    compactProcessor: string;
};

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
    if (data instanceof ArrayBuffer) {
        return data;
    }
    const bytes = new Uint8Array(data);
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    return arrayBuffer;
}

function toTitleCase(str: string): string {
    return str
        .split(/\s+/)
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
        .join(' ');
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

    const intelCoreMatch = model.match(/\b(i[3579])[-\s]*([0-9]{4,5}[a-zA-Z0-9]*)\b/i);
    if (intelCoreMatch) {
        const [, series, sku] = intelCoreMatch;
        const skuDigits = sku.replace(/[^0-9]/g, '');
        const generation =
            skuDigits.length >= 5
                ? Number(skuDigits.slice(0, 2))
                : Number(skuDigits.slice(0, 1));
        if (Number.isFinite(generation) && generation > 0) {
            return `${series.toLowerCase()} ${toOrdinal(generation)} Gen`;
        }
        return series.toLowerCase();
    }

    const ryzenMatch = model.match(/\b(Ryzen)\s*(3|5|7|9)\s*([0-9]{4,5}[A-Z]{0,3})\b/i);
    if (ryzenMatch) {
        const [, , tier, sku] = ryzenMatch;
        return `R${tier} ${sku.toUpperCase()}`;
    }

    const amdSeriesMatch = model.match(/\bAMD\s+([A-Za-z0-9\s]+?)\s+([0-9]{4,5}[A-Z]{0,3})\b/i);
    if (amdSeriesMatch) {
        const series = amdSeriesMatch[1].trim().replace(/\s+/g, ' ');
        const shortSeries = series
            .replace(/Ryzen/gi, 'R')
            .replace(/Threadripper/gi, 'TR')
            .replace(/PRO/gi, '')
            .trim();
        return `${shortSeries} ${amdSeriesMatch[2].toUpperCase()}`.slice(0, 22);
    }

    const appleMatch = model.match(/\bApple\s+(M[1-4](?:\s+Pro|\s+Max|\s+Ultra)?)\b/i);
    if (appleMatch) {
        return `Apple ${appleMatch[1].toUpperCase()}`;
    }

    return model.split(',')[0].slice(0, 24);
}

function getStorageHealthSummary(storageInfo: StorageInfo): { label: string; isTampered: boolean } {
    const devices = Array.isArray(storageInfo?.devices) ? storageInfo.devices : [];
    const isStorageTampered = storageInfo?.isTampered === true;
    const anyDeviceTampered = devices.some((d) => d?.isTampered === true);
    const isTampered = isStorageTampered || anyDeviceTampered;

    if (devices.length === 0) {
        return { label: isTampered ? 'Tampered' : '', isTampered };
    }

    const driveHealth = devices.map((d, idx: number) => {
        const rawName = typeof d?.deviceName === 'string' ? d.deviceName : '';
        const driveName = rawName || `Drive ${idx + 1}`;
        const healthPercent = typeof d?.healthPercent === 'number' ? `${Math.round(d.healthPercent)}%` : 'N/A';
        const suffix = d?.isTampered === true ? ' (Tampered)' : '';
        return `${driveName}: ${healthPercent}${suffix}`;
    });

    return { label: driveHealth.join(', '), isTampered };
}

function getIssueSummaryRows(issueMap: Record<IssueKey, Set<string>>) {
    const issueRows: { label: string; key: IssueKey }[] = [
        { label: 'Critical Storage (<=10% free)', key: 'criticalStorage' },
        { label: 'Low Storage (<25% free)', key: 'lowStorage' },
        { label: 'Storage Tamper Flags', key: 'tampered' },
        { label: 'Inactive Windows', key: 'inactiveWindows' },
        { label: 'Thermal Cooling Issues', key: 'thermal' },
    ];

    return issueRows.map((issue) => {
        const affected = Array.from(issueMap[issue.key]).filter(Boolean).sort((a, b) => a.localeCompare(b));
        return [
            issue.label,
            String(affected.length),
            affected.length > 0 ? affected.join(', ') : '-',
        ];
    });
}

function formatShiftDate(value: string | Date | null | undefined, timeZone: string): string {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone,
    });
}

function formatGeneratedDateTime(timeZone: string): string {
    return new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone,
    });
}

async function loadPramaanLogoBytes(): Promise<Uint8Array | null> {
    const candidates = ['prmn_logo.png', 'Pramaan_logo_F1.png', 'loginImg.png'];
    for (const fileName of candidates) {
        try {
            const logoPath = path.join(process.cwd(), 'public', fileName);
            const file = await readFile(logoPath);
            return new Uint8Array(file);
        } catch {
            // Try next logo candidate
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

async function buildPdfBuffer(rows: ExportRow[], issueRows: string[][], timeZone: string): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await loadPramaanLogoBytes();
    const logoImage = logoBytes ? await pdf.embedPng(logoBytes) : null;

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 32;
    const lineHeight = 14;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    let pageNumber = 1;

    const drawPageFooter = () => {
        page.drawLine({
            start: { x: margin, y: margin - 6 },
            end: { x: pageWidth - margin, y: margin - 6 },
            color: rgb(0.82, 0.84, 0.87),
            thickness: 0.8,
        });
        page.drawText(`Page ${pageNumber}`, {
            x: margin,
            y: margin - 20,
            size: 9,
            font,
            color: rgb(0.42, 0.46, 0.52),
        });
    };

    const addNewPage = () => {
        drawPageFooter();
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
        pageNumber += 1;
    };

    const drawWrappedText = (text: string, x: number, width: number, size = 10, useBold = false, color = rgb(0, 0, 0)) => {
        const activeFont = useBold ? boldFont : font;
        const words = text.split(' ');
        let line = '';
        const lines: string[] = [];

        words.forEach((word) => {
            const candidate = line ? `${line} ${word}` : word;
            if (activeFont.widthOfTextAtSize(candidate, size) <= width) {
                line = candidate;
            } else {
                if (line) lines.push(line);
                line = word;
            }
        });
        if (line) lines.push(line);

        lines.forEach((ln) => {
            if (y < margin + lineHeight + 24) addNewPage();
            page.drawText(ln, { x, y, size, font: activeFont, color });
            y -= lineHeight;
        });
    };

    // Header band
    page.drawRectangle({
        x: 0,
        y: pageHeight - 98,
        width: pageWidth,
        height: 98,
        color: rgb(0.10, 0.24, 0.44),
    });
    if (logoImage) {
        const logoHeight = 42;
        const logoWidth = (logoImage.width / logoImage.height) * logoHeight;
        page.drawImage(logoImage, {
            x: margin,
            y: pageHeight - 70,
            width: logoWidth,
            height: logoHeight,
        });
    }
    page.drawText('PRAAMAAN', {
        x: margin + 64,
        y: pageHeight - 48,
        size: 20,
        font: boldFont,
        color: rgb(1, 1, 1),
    });
    page.drawText('Professional Device Quality Assessment', {
        x: margin + 64,
        y: pageHeight - 66,
        size: 10,
        font,
        color: rgb(0.88, 0.92, 0.98),
    });
    page.drawText(`Generated: ${formatGeneratedDateTime(timeZone)}`, {
        x: pageWidth - 190,
        y: pageHeight - 52,
        size: 9,
        font,
        color: rgb(0.93, 0.95, 0.99),
    });

    y = pageHeight - 122;
    page.drawText('Executive Summary', { x: margin, y, size: 13, font: boldFont, color: rgb(0.1, 0.2, 0.3) });
    y -= 20;

    const summaryTotalIssues = issueRows.reduce((sum, row) => sum + Number(row[1]), 0);
    const cards = [
        { title: 'Systems Analyzed', value: String(rows.length), color: rgb(0.13, 0.45, 0.75) },
        { title: 'Issue Flags Raised', value: String(summaryTotalIssues), color: rgb(0.75, 0.27, 0.24) },
        { title: 'Tampered Systems', value: issueRows[2]?.[1] || '0', color: rgb(0.53, 0.19, 0.64) },
    ];
    const cardWidth = (pageWidth - margin * 2 - 16) / 3;
    cards.forEach((card, index) => {
        const x = margin + index * (cardWidth + 8);
        page.drawRectangle({
            x,
            y: y - 50,
            width: cardWidth,
            height: 50,
            color: rgb(0.97, 0.98, 1),
            borderColor: rgb(0.88, 0.90, 0.94),
            borderWidth: 1,
        });
        page.drawRectangle({
            x,
            y: y - 50,
            width: 4,
            height: 50,
            color: card.color,
        });
        page.drawText(card.title, {
            x: x + 10,
            y: y - 20,
            size: 9,
            font,
            color: rgb(0.38, 0.42, 0.48),
        });
        page.drawText(card.value, {
            x: x + 10,
            y: y - 40,
            size: 16,
            font: boldFont,
            color: rgb(0.14, 0.18, 0.24),
        });
    });
    y -= 70;

    page.drawText('Issue Breakdown', { x: margin, y, size: 12, font: boldFont, color: rgb(0.1, 0.2, 0.3) });
    y -= 8;
    const issueCols = { issue: 184, count: 56, systems: pageWidth - margin * 2 - 240 };
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
        page.drawRectangle({
            x: margin,
            y: y - rowHeight,
            width: pageWidth - margin * 2,
            height: rowHeight,
            color: index % 2 === 0 ? rgb(0.985, 0.992, 1) : rgb(1, 1, 1),
            borderColor: rgb(0.88, 0.90, 0.94),
            borderWidth: 0.6,
        });
        page.drawText(issue, { x: margin + 6, y: y - 10, size: 8, font, color: rgb(0.17, 0.2, 0.25) });
        page.drawText(count, { x: margin + issueCols.issue + 10, y: y - 10, size: 8, font: boldFont, color: rgb(0.17, 0.2, 0.25) });
        lines.forEach((ln, i) => {
            page.drawText(ln, {
                x: margin + issueCols.issue + issueCols.count + 6,
                y: y - 10 - i * 10,
                size: 8,
                font,
                color: rgb(0.17, 0.2, 0.25),
            });
        });
        y -= rowHeight + 2;
    });

    y -= 8;
    if (y < margin + 170) addNewPage();
    page.drawText('Detailed Device Assessment', { x: margin, y, size: 12, font: boldFont, color: rgb(0.1, 0.2, 0.3) });
    y -= 18;

    const columns = [
        { key: 'computer', title: 'Computer', width: 116 },
        { key: 'date', title: 'Shift Date', width: 64 },
        { key: 'proc', title: 'Processor', width: 76 },
        { key: 'ram', title: 'RAM', width: 36 },
        { key: 'free', title: 'Free %', width: 40 },
        { key: 'windows', title: 'Windows', width: 52 },
        { key: 'tamper', title: 'Tamper', width: 44 },
        { key: 'thermal', title: 'Thermal', width: 44 },
    ];
    const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);

    const drawTableHeader = () => {
        page.drawRectangle({
            x: margin,
            y: y - 16,
            width: tableWidth,
            height: 16,
            color: rgb(0.16, 0.35, 0.58),
        });
        let x = margin + 4;
        columns.forEach((col) => {
            page.drawText(col.title, {
                x,
                y: y - 12,
                size: 8,
                font: boldFont,
                color: rgb(1, 1, 1),
            });
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
        const rowColor = index % 2 === 0 ? rgb(0.99, 0.995, 1) : rgb(1, 1, 1);
        page.drawRectangle({
            x: margin,
            y: y - 14,
            width: tableWidth,
            height: 14,
            color: rowColor,
            borderColor: rgb(0.90, 0.92, 0.95),
            borderWidth: 0.5,
        });
        const freePercentLabel = entry.freePercent == null ? '-' : `${entry.freePercent.toFixed(1)}%`;
        const cells = [
            String(values[1] || '-'),
            String(values[2] || '-'),
            String(entry.compactProcessor || '-'),
            String(values[7] || '-'),
            freePercentLabel,
            String(values[4] || '-'),
            entry.isTampered ? 'Tampered' : 'Clean',
            entry.hasThermalIssue ? 'Risk' : 'OK',
        ];
        let x = margin + 4;
        cells.forEach((cell, cellIndex) => {
            const colWidth = columns[cellIndex].width - 6;
            const txtColor = cellIndex === 6 && entry.isTampered
                ? rgb(0.78, 0.14, 0.14)
                : cellIndex === 7 && entry.hasThermalIssue
                    ? rgb(0.75, 0.45, 0.07)
                    : rgb(0.15, 0.19, 0.24);
            const finalText = truncateToWidth(cell, colWidth, 7.8, font);
            if (cellIndex === 4 && entry.freePercent != null) {
                const fillColor = entry.freePercent <= 10
                    ? rgb(0.91, 0.20, 0.16)
                    : entry.freePercent < 25
                        ? rgb(0.98, 0.90, 0.25)
                        : null;
                if (fillColor) {
                    page.drawRectangle({
                        x: x - 2,
                        y: y - 13,
                        width: columns[cellIndex].width - 2,
                        height: 12,
                        color: fillColor,
                    });
                }
            }
            page.drawText(finalText, { x, y: y - 10, size: 7.8, font, color: txtColor });
            x += columns[cellIndex].width;
        });
        y -= 14;
    });

    drawPageFooter();
    return pdf.save();
}

export async function GET(request: NextRequest) {
    try {
        const { user: authUser, error: authError } = await authenticateRequest(request);
        if (authError) return authError;
        if (!authUser) {
            return NextResponse.json(
                { error: 'Authentication Error', message: 'Not authenticated' } as ApiError,
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search')?.trim();
        const format = (searchParams.get('format') || 'xlsx').toLowerCase();
        const timeZone = searchParams.get('timeZone') || 'Asia/Kolkata';

        const whereClauses: string[] = ['1=1'];
        const params: SqlParam[] = [];
        let paramCount = 1;

        // Role-based visibility (same as main results endpoint)
        if (authUser.role === 'Technician' || authUser.role === 'Client' || authUser.role === 'B2CDevice') {
            whereClauses.push(`qr.technician_id = $${paramCount}`);
            params.push(authUser.id);
            paramCount++;
        } else if (authUser.role === 'Refurbisher' || authUser.role === 'Enterprise' || authUser.role === 'Reseller') {
            whereClauses.push(`(qr.technician_id = $${paramCount} OR qr.technician_id IN (SELECT id FROM users WHERE created_by = $${paramCount}))`);
            params.push(authUser.id);
            paramCount++;
        }

        const baseWhereSql = whereClauses.join(' AND ');

        let searchWhereSql = '1=1';
        if (search) {
            searchWhereSql = `(COALESCE(numbered.computer_name, '') ILIKE $${paramCount} OR COALESCE(numbered.machine_identifier, '') ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }

        const queryText = `
            WITH filtered AS (
                SELECT
                    qr.*,
                    m.machine_id as machine_identifier,
                    m.computer_name,
                    u.username as technician_username,
                    u.display_name as technician_name
                FROM qc_results qr
                LEFT JOIN machines m ON qr.machine_id = m.id
                LEFT JOIN users u ON qr.technician_id = u.id
                WHERE ${baseWhereSql}
            ),
            numbered AS (
                SELECT
                    filtered.*,
                    ROW_NUMBER() OVER (PARTITION BY filtered.machine_id ORDER BY filtered.timestamp DESC, filtered.id DESC) AS scoped_test_id
                FROM filtered
            )
            SELECT *
            FROM numbered
            WHERE ${searchWhereSql} AND scoped_test_id = 1
            ORDER BY timestamp DESC, id DESC
        `;

        const results = await query(queryText, params);

        const headers = [
            'S.No',
            'Computer Name',
            'Shift Date',
            'OS Edition',
            'Windows',
            'Version',
            'Processor',
            'RAM (GB)',
            'Antivirus',
            'Total Storage (GB)',
            'Free Storage (GB)',
            'Disk Health (Per Drive)',
            'Tamper Status',
            'Grade',
            'Score',
            'Serial No',
            'MAC Address',
            'Manufacturer',
            'Model',
            'User',
        ];

        const issueMap: Record<IssueKey, Set<string>> = {
            criticalStorage: new Set<string>(),
            lowStorage: new Set<string>(),
            tampered: new Set<string>(),
            inactiveWindows: new Set<string>(),
            thermal: new Set<string>(),
        };

        const exportRows: ExportRow[] = results.map((resultRow: JsonRecord, index: number) => {
            const r = resultRow;
            const sysInfo = (r.system_info_json as JsonRecord | null) || {};
            const storageInfo = (r.storage_details_json as StorageInfo | null) || {};

            const volumes = Array.isArray(storageInfo.volumes) ? storageInfo.volumes : [];
            const totalStorageBytes = volumes.reduce(
                (sum: number, vol) => sum + (typeof vol?.totalBytes === 'number' ? vol.totalBytes : 0),
                0
            );
            const freeStorageBytes = volumes.reduce(
                (sum: number, vol) => sum + (typeof vol?.freeBytes === 'number' ? vol.freeBytes : 0),
                0
            );
            const freePercent = totalStorageBytes > 0 ? (freeStorageBytes / totalStorageBytes) * 100 : null;

            const { label: diskHealthLabel, isTampered } = getStorageHealthSummary(storageInfo);

            const isActivated = sysInfo.isWindowsActivated;
            const activationLabel =
                typeof isActivated === 'boolean'
                    ? isActivated ? 'Active' : 'Not Active'
                    : ((sysInfo.windowsActivationStatus as string | undefined) || '');
            const isWindowsInactive = activationLabel.toLowerCase().includes('not active') || activationLabel.toLowerCase().includes('inactive');

            const { edition: parsedEdition, release: winRelease } = parseWindowsVersion(
                (sysInfo.osVersion as string | undefined) || '',
                (sysInfo.windowsProductName as string | undefined) || ''
            );
            const windowsProductName = (sysInfo.windowsProductName as string | undefined) || '';
            const osEdition = windowsProductName ? cleanWindowsProductName(windowsProductName, parsedEdition) : parsedEdition;
            const antivirus = (sysInfo.antivirusStatus as string | undefined) || '';
            const ramTotal = toFiniteNumber(r.ram_total) ?? 0;
            const ramGb = ramTotal > 0 ? Math.round(ramTotal / (1024 * 1024 * 1024)) : '';
            const compactProcessor = toCompactProcessor((r.cpu_model as string | null | undefined) || '');
            const computerName = ((r.computer_name as string | undefined) || (r.machine_identifier as string | undefined) || `Machine ${index + 1}`);
            const riskFlags = (r.pramaan_risk_flags as JsonRecord | null) || {};
            const hasThermalIssue = riskFlags.thermal === true;

            if (freePercent != null && freePercent <= 10) issueMap.criticalStorage.add(computerName);
            if (freePercent != null && freePercent < 25) issueMap.lowStorage.add(computerName);
            if (isTampered) issueMap.tampered.add(computerName);
            if (isWindowsInactive) issueMap.inactiveWindows.add(computerName);
            if (hasThermalIssue) issueMap.thermal.add(computerName);

            const rowValues = [
                String(index + 1),
                (r.computer_name as string | undefined) || '',
                formatShiftDate((r.timestamp as string | Date | null | undefined) || null, timeZone),
                osEdition,
                activationLabel,
                winRelease,
                compactProcessor,
                String(ramGb),
                antivirus,
                totalStorageBytes > 0 ? formatBytes(totalStorageBytes) : '',
                freeStorageBytes > 0 ? formatBytes(freeStorageBytes) : '',
                diskHealthLabel,
                isTampered ? 'Tampered' : 'Clean',
                (r.pramaan_grade as string | undefined) || '',
                r.pramaan_score != null ? String(r.pramaan_score) : '',
                (r.system_serial as string | undefined) || '',
                (r.mac_address as string | undefined) || '',
                (r.system_manufacturer as string | undefined) || '',
                (r.system_model as string | undefined) || '',
                (r.technician_name as string | undefined) || (r.technician_username as string | undefined) || '',
            ];

            return {
                rowValues,
                freePercent,
                isWindowsInactive,
                isTampered,
                hasThermalIssue,
                computerName,
                compactProcessor,
            };
        });

        const issueRows = getIssueSummaryRows(issueMap);

        if (format === 'pdf') {
            const pdfBuffer = await buildPdfBuffer(exportRows, issueRows, timeZone);
            const pdfName = `qc_results_export_${new Date().toISOString().slice(0, 10)}.pdf`;
            return new NextResponse(toArrayBuffer(pdfBuffer), {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${pdfName}"`,
                },
            });
        }

        // Build XLSX
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('QC Results');
        worksheet.addRow(headers);
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1F4E78' },
        };
        worksheet.columns = [
            { width: 8 },
            { width: 24 },
            { width: 14 },
            { width: 24 },
            { width: 14 },
            { width: 12 },
            { width: 16 },
            { width: 12 },
            { width: 20 },
            { width: 18 },
            { width: 18 },
            { width: 36 },
            { width: 14 },
            { width: 10 },
            { width: 10 },
            { width: 20 },
            { width: 22 },
            { width: 18 },
            { width: 20 },
            { width: 20 },
        ];

        const freeStorageColumnIndex = 11;
        const windowsColumnIndex = 5;
        const diskHealthColumnIndex = 12;
        const tamperStatusColumnIndex = 13;

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

            if (row.number % 2 === 0) {
                row.eachCell((cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF8FBFF' },
                    };
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
        summarySheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF7F6000' },
        };
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
        const filename = `qc_results_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

        return new NextResponse(toArrayBuffer(fileBuffer as ArrayBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Error exporting QC results:', error);
        return NextResponse.json(
            { error: 'Server Error', message: 'Failed to export QC results' } as ApiError,
            { status: 500 }
        );
    }
}
