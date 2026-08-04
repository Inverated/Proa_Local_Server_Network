const { hasInternet } = require("./connectivity");
const { supabase } = require("./supabase");
const { getDB } = require("../../model/power_management_models")
const os = require("os");

const PAGE_SIZE = 50;
let updating = false;

async function updateDatabase() {
    if (updating) {
        return;
    }
    updating = true;
    const internet = await hasInternet();
    if (internet) {
        const hostname = os.hostname();

        // Fetch latest id from supabase for the current hostname
        const { data: latestData, error: latestError } = await supabase.from("Power Management Sensor Data")
            .select("id")
            .eq("hostname", hostname)
            .order("id", { ascending: false })
            .limit(1);
        const latestId = latestData && latestData.length > 0 ? latestData[0].id : 0;
        const db = getDB();
        let offset = latestId;
        while (true) {
            const rows = await fetchFromSqliteDB(PAGE_SIZE, offset);
            if (rows.length === 0) {
                break;
            }

            rows.map(row => {
                row.hostname = hostname;
                row.time_diff = Math.trunc(row.time_diff);
            });
            const { data: insertData, error: insertError } = await supabase.from("Power Management Sensor Data").upsert(rows);
            if (insertError) {
                console.error("Error inserting data into supabase:", insertError);
                console.error("Failed rows:", rows);
                console.log(insertData);
                break;
            } 
            //console.log(`Inserted ${rows.length} records into supabase. Total inserted: ${offset + rows.length}`);
            offset += rows.length;
        }

    } else {
        //console.error("No internet connection. Database update skipped.");
    }
    updating = false;
}

async function fetchFromSqliteDB(size, offset) {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM SOCSensor LIMIT ? OFFSET ?`, [size, offset], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

module.exports = { updateDatabase };