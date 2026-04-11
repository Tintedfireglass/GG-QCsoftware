import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';
import { ApiError } from '@/lib/types';

type SqlParam = string | number | boolean | null;

function escapeCSV(value: string | null | undefined): string {
    if (value == null || value === '') return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(1);
}

/**
 * Parse the raw Environment.OSVersion string (e.g. "Microsoft Windows NT 10.0.22631.0")
 * and return a friendly edition name and a release version label.
 */
function parseWindowsVersion(osVersionRaw: string): { edition: string; release: string } {
    if (!osVersionRaw) return { edition: '', release: '' };

    // Extract build number from strings like "Microsoft Windows NT 10.0.22631.0"
    const match = osVersionRaw.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return { edition: osVersionRaw, release: '' };

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const build = parseInt(match[3], 10);

    // Determine Windows 10 vs 11: build >= 22000 is Windows 11
    const winVersion = (major === 10 && build >= 22000) ? '11' : '10';

    // Map build numbers to release versions
    const buildToRelease: Record<number, string> = {
        // Windows 10
        10240: '1507', 10586: '1511', 14393: '1607', 15063: '1703',
        16299: '1709', 17134: '1803', 17763: '1809', 18362: '1903',
        18363: '1909', 19041: '2004', 19042: '20H2', 19043: '21H1',
        19044: '21H2', 19045: '22H2',
        // Windows 11
        22000: '21H2', 22621: '22H2', 22631: '23H2', 26100: '24H2',
    };

    const release = buildToRelease[build] || '';
    const edition = `Windows ${winVersion}`;

    return { edition, release };
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
            searchWhereSql = `COALESCE(numbered.computer_name, '') ILIKE $${paramCount}`;
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
                    ROW_NUMBER() OVER (ORDER BY filtered.timestamp DESC, filtered.id DESC) AS scoped_test_id
                FROM filtered
            )
            SELECT *
            FROM numbered
            WHERE ${searchWhereSql}
            ORDER BY timestamp DESC, id DESC
        `;

        const results = await query(queryText, params);

        // Build CSV
        const headers = [
            'S.No',
            'Computer Name',
            'OS Edition',
            'Windows',
            'Version',
            'Processor',
            'RAM (GB)',
            'Antivirus',
            'Total Storage (GB)',
            'Free Storage (GB)',
            'Disk Health',
            'Grade',
            'Score',
            'Serial No',
            'MAC Address',
            'Manufacturer',
            'Model',
            'Date',
            'User',
        ];

        const rows: string[] = [headers.map(escapeCSV).join(',')];

        results.forEach((r: any, index: number) => {
            const sysInfo = r.system_info_json || {};
            const storageInfo = r.storage_details_json || {};

            // Calculate total and free storage from volumes
            const volumes = Array.isArray(storageInfo.volumes) ? storageInfo.volumes : [];
            const totalStorageBytes = volumes.reduce(
                (sum: number, vol: any) => sum + (typeof vol?.totalBytes === 'number' ? vol.totalBytes : 0),
                0
            );
            const freeStorageBytes = volumes.reduce(
                (sum: number, vol: any) => sum + (typeof vol?.freeBytes === 'number' ? vol.freeBytes : 0),
                0
            );

            // Disk health: check for tampered first, then average health percent
            const isStorageTampered = storageInfo.isTampered === true;
            const devices = Array.isArray(storageInfo.devices) ? storageInfo.devices : [];
            const anyDeviceTampered = devices.some((d: any) => d?.isTampered === true);
            let diskHealthLabel: string;
            if (isStorageTampered || anyDeviceTampered) {
                diskHealthLabel = 'Tampered';
            } else {
                const healthPercents = devices
                    .map((d: any) => d?.healthPercent)
                    .filter((h: any) => typeof h === 'number');
                diskHealthLabel =
                    healthPercents.length > 0
                        ? String(Math.round(healthPercents.reduce((a: number, b: number) => a + b, 0) / healthPercents.length))
                        : '';
            }

            // Windows activation
            const isActivated = sysInfo.isWindowsActivated;
            const activationLabel =
                typeof isActivated === 'boolean'
                    ? isActivated ? 'Active' : 'Not Active'
                    : (sysInfo.windowsActivationStatus || '');

            // OS edition and version (e.g. "Windows 11" and "23H2")
            const { edition: osEdition, release: winRelease } = parseWindowsVersion(sysInfo.osVersion || '');

            // Antivirus
            const antivirus = sysInfo.antivirusStatus || '';

            // RAM in GB
            const ramGb = r.ram_total ? Math.round(r.ram_total / (1024 * 1024 * 1024)) : '';

            // Date
            const dateStr = r.timestamp
                ? new Date(r.timestamp).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                  })
                : '';

            const row = [
                String(index + 1),
                r.computer_name || '',
                osEdition,
                activationLabel,
                winRelease,
                r.cpu_model || '',
                String(ramGb),
                antivirus,
                totalStorageBytes > 0 ? formatBytes(totalStorageBytes) : '',
                freeStorageBytes > 0 ? formatBytes(freeStorageBytes) : '',
                diskHealthLabel,
                r.pramaan_grade || '',
                r.pramaan_score != null ? String(r.pramaan_score) : '',
                r.system_serial || '',
                r.mac_address || '',
                r.system_manufacturer || '',
                r.system_model || '',
                dateStr,
                r.technician_name || r.technician_username || '',
            ];

            rows.push(row.map(escapeCSV).join(','));
        });

        const csv = rows.join('\r\n');
        const filename = `qc_results_export_${new Date().toISOString().slice(0, 10)}.csv`;

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
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
