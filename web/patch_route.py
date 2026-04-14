import sys

# patch export/route.ts
target_export = '''        let searchWhereSql = '1=1';
        if (search) {
            searchWhereSql = `COALESCE(numbered.computer_name, '') ILIKE $${paramCount}`;
            params.push(`%${search}%`);
            paramCount++;
        }'''

replacement_export = '''        let searchWhereSql = '1=1';
        if (search) {
            searchWhereSql = `(COALESCE(numbered.computer_name, '') ILIKE $${paramCount} OR COALESCE(numbered.machine_identifier, '') ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }'''

with open(r'c:\Users\gento\Desktop\Projects\GG Internship\QC tool\web\app\api\qc-results\export\route.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(target_export, replacement_export)
with open(r'c:\Users\gento\Desktop\Projects\GG Internship\QC tool\web\app\api\qc-results\export\route.ts', 'w', encoding='utf-8') as f:
    f.write(text)

# patch fleet/route.ts
target_fleet = '''        if (search) {
            whereClauses.push(`(
                m.machine_id ILIKE $${paramCount} OR
                m.serial_number ILIKE $${paramCount} OR
                m.manufacturer ILIKE $${paramCount} OR
                m.model ILIKE $${paramCount} OR
                COALESCE(m.asset_tag, '') ILIKE $${paramCount}
            )`);
            params.push(`%${search}%`);
            paramCount++;
        }'''

replacement_fleet = '''        if (search) {
            whereClauses.push(`(
                m.machine_id ILIKE $${paramCount} OR
                m.serial_number ILIKE $${paramCount} OR
                m.manufacturer ILIKE $${paramCount} OR
                m.model ILIKE $${paramCount} OR
                COALESCE(m.computer_name, '') ILIKE $${paramCount} OR
                COALESCE(m.asset_tag, '') ILIKE $${paramCount}
            )`);
            params.push(`%${search}%`);
            paramCount++;
        }'''

with open(r'c:\Users\gento\Desktop\Projects\GG Internship\QC tool\web\app\api\fleet\route.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(target_fleet, replacement_fleet)
with open(r'c:\Users\gento\Desktop\Projects\GG Internship\QC tool\web\app\api\fleet\route.ts', 'w', encoding='utf-8') as f:
    f.write(text)

# patch dashboard/results/page.tsx
target_dash_results = 'placeholder="Search by Computer Name..."'
replacement_dash_results = 'placeholder="Search Device ID, Computer..."'
with open(r'c:\Users\gento\Desktop\Projects\GG Internship\QC tool\web\app\dashboard\results\page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()
text = text.replace(target_dash_results, replacement_dash_results)
with open(r'c:\Users\gento\Desktop\Projects\GG Internship\QC tool\web\app\dashboard\results\page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
