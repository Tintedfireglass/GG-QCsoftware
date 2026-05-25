import { query } from "./lib/db.js"

async function check() {
    try {
        const res = await query(`
            SELECT mh.id, mh.source, mh.timestamp, mh.app_version, mh.component_grades, m.machine_id, m.serial_number
            FROM machine_history mh
            JOIN machines m ON mh.machine_id = m.id
            ORDER BY mh.timestamp DESC
            LIMIT 5;
        `)
        console.log(JSON.stringify(res.rows, null, 2))
    } catch (err) {
        console.error(err)
    }
}

check()
