import { mkdir, access, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') });
const outputRoot = path.resolve(scriptDirectory, '../map-tiles');
const tileSource = process.env.TILE_SOURCE_URL;
const requestDelayMs = Number(process.env.TILE_REQUEST_DELAY_MS);
// Chosen bounding box
// https://opentopomap.org/#map=17/1.86906/462.69397
// https://opentopomap.org/#map=16/1.09878/464.36476
const minLatitude = Number(process.env.MIN_LATITUDE);
const maxLatitude = Number(process.env.MAX_LATITUDE);
const minLongitude = Number(process.env.MIN_LONGITUDE);
const maxLongitude = Number(process.env.MAX_LONGITUDE);
const minZoom = Number(process.env.MIN_ZOOM);
const maxZoom = Number(process.env.MAX_ZOOM);
const concurrency = Number(process.env.TILE_DOWNLOAD_CONCURRENCY);
const progressInterval = Number(process.env.TILE_PROGRESS_INTERVAL);
const userAgent = process.env.TILE_USER_AGENT;

if (!tileSource || !['{z}', '{x}', '{y}'].every((placeholder) => tileSource.includes(placeholder))) {
    throw new Error('TILE_SOURCE_URL is required and must contain {z}, {x}, and {y} placeholders.');
}

if (![minLatitude, maxLatitude, minLongitude, maxLongitude, minZoom, maxZoom, concurrency].every(Number.isFinite)
    || minLatitude >= maxLatitude
    || minLongitude >= maxLongitude
    || minZoom > maxZoom
    || concurrency < 1
    || !Number.isInteger(progressInterval)
    || progressInterval < 1
    || requestDelayMs < 0
    || !userAgent.trim()) {
    throw new Error('Invalid map bounds, zoom range, or concurrency setting.');
}

function longitudeToTile(longitude, zoom) {
    return Math.floor(((longitude + 180) / 360) * (2 ** zoom));
}

function latitudeToTile(latitude, zoom) {
    const radians = (latitude * Math.PI) / 180;
    const normalized = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
    return Math.floor(normalized * (2 ** zoom));
}

function tileUrl(zoom, x, y) {
    return tileSource
        .replaceAll('{z}', String(zoom))
        .replaceAll('{x}', String(x))
        .replaceAll('{y}', String(y));
}

let nextRequestAt = 0;
let requestQueue = Promise.resolve();
async function waitForRequestSlot() {
    let release;
    const previous = requestQueue;
    requestQueue = new Promise((resolve) => {
        release = resolve;
    });
    await previous;
    try {
        const waitMs = Math.max(0, nextRequestAt - Date.now());
        if (waitMs > 0) {
            await delay(waitMs);
        }
        nextRequestAt = Date.now() + requestDelayMs;
    } finally {
        release();
    }
}

async function downloadTile(tile) {
    const destination = path.join(outputRoot, String(tile.zoom), String(tile.x), `${tile.y}.png`);
    try {
        await access(destination);
        return false;
    } catch {
        // The tile does not exist locally yet.
    }

    await mkdir(path.dirname(destination), { recursive: true });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            await waitForRequestSlot();
            const response = await fetch(tileUrl(tile.zoom, tile.x, tile.y), {
                headers: { 'User-Agent': userAgent },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            await writeFile(destination, Buffer.from(await response.arrayBuffer()));
            return true;
        } catch (error) {
            if (attempt === 3) {
                throw new Error(`Failed to download z${tile.zoom}/${tile.x}/${tile.y}: ${error.message}`);
            }
        }
    }
    return false;
}

const tiles = [];
for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const minX = longitudeToTile(minLongitude, zoom);
    const maxX = longitudeToTile(maxLongitude, zoom);
    const minY = latitudeToTile(maxLatitude, zoom);
    const maxY = latitudeToTile(minLatitude, zoom);
    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            tiles.push({ zoom, x, y });
        }
    }
}

let cursor = 0;
let downloaded = 0;
let processed = 0;
let lastProgressProcessed = 0;

function printProgress() {
    const percentage = tiles.length === 0 ? 100 : Math.floor((processed / tiles.length) * 100);
    const barLength = 30;
    const filledLength = Math.round((percentage / 100) * barLength);
    const progressBar = `${'='.repeat(filledLength)}${'-'.repeat(barLength - filledLength)}`;
    console.log(`[${progressBar}] ${percentage}% (${processed}/${tiles.length}) - ${downloaded} downloaded`);
}

async function worker() {
    while (cursor < tiles.length) {
        const tile = tiles[cursor];
        cursor += 1;
        const wasDownloaded = await downloadTile(tile);
        processed += 1;
        if (wasDownloaded) {
            downloaded += 1;
        }
        if (wasDownloaded && downloaded % progressInterval === 0) {
            printProgress();
            lastProgressProcessed = processed;
        }
    }
}

await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, worker));
if (lastProgressProcessed !== processed) {
    printProgress();
}
console.log(`Map tile bundle ready: ${downloaded} downloaded, ${tiles.length - downloaded} already present, ${tiles.length} total.`);
