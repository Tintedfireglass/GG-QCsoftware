import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';
import { parseWindowsVersion, cleanWindowsProductName } from '@/lib/utils';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

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

function toTitleCase(str: string): string {
    return str
        .split(/\s+/)
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
        .join(' ');
}

function toCompactProcessor(cpuModel: string | null | undefined): string {
    if (!cpuModel) return '';
    const model = cpuModel.trim();

    const intelCoreMatch = model.match(/\b(i[3579])[-\s]*([0-9]{4,5}[a-zA-Z0-9]*)\b/i);
    if (intelCoreMatch) {
        const [, series, sku] = intelCoreMatch;
        const genDigits = sku.slice(0, sku.length === 5 ? 2 : 1);
        return `${series.toLowerCase()} ${genDigits}th Gen`;
    }

    const ryzenMatch = model.match(/\b(Ryzen)\s*(3|5|7|9)\s*([0-9]{4,5})\b/i);
    if (ryzenMatch) {
        const [, brand, tier, sku] = ryzenMatch;
        return `${toTitleCase(brand)} ${tier} ${sku}`;
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

function formatShiftDate(value: string | Date | null | undefined): string {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

async function buildPdfBuffer(rows: ExportRow[], issueRows: string[][]): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    const done = new Promise<Buffer>((resolve) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const addLine = (text: string, size = 10) => {
        if (doc.y > doc.page.height - 48) doc.addPage();
        doc.fontSize(size).text(text, { width: doc.page.width - 72 });
    };

    doc.fontSize(16).text('QC Results Export');
    addLine(`Generated: ${new Date().toLocaleString('en-GB')}`, 10);
    doc.moveDown(0.8);

    doc.fontSize(13).text('Issue Summary');
    issueRows.forEach((row) => addLine(`${row[0]} | Count: ${row[1]} | Systems: ${row[2]}`));
    doc.moveDown(0.8);

    doc.fontSize(13).text('Detailed Rows');
    addLine('S.No | Computer | Shift Date | Windows | Processor | Free Storage | Disk Health | Tamper | Thermal');
    rows.forEach((entry) => {
        const values = entry.rowValues;
        addLine(
            `${values[0]} | ${values[1] || '-'} | ${values[2] || '-'} | ${values[4] || '-'} | ${entry.compactProcessor || '-'} | ${values[10] || '-'} GB | ${values[11] || '-'} | ${values[12] || '-'} | ${entry.hasThermalIssue ? 'Yes' : 'No'}`
        );
    });

    doc.end();
    return done;
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
            const ramTotal = typeof r.ram_total === 'number' ? r.ram_total : 0;
            const ramGb = ramTotal ? Math.round(ramTotal / (1024 * 1024 * 1024)) : '';
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
                formatShiftDate((r.timestamp as string | Date | null | undefined) || null),
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
            const pdfBuffer = await buildPdfBuffer(exportRows, issueRows);
            const pdfName = `qc_results_export_${new Date().toISOString().slice(0, 10)}.pdf`;
            return new NextResponse(new Uint8Array(pdfBuffer), {
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

        return new NextResponse(new Uint8Array(fileBuffer as ArrayBuffer), {
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
