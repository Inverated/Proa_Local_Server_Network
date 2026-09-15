import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
    CircleMarker,
    MapContainer,
    Polyline,
    TileLayer,
    useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import '../../../data_type/gps.tsx';

const MAX_TRACK_POINTS = 10000;
const LOCALHOST_API_BASE_URL = 'http://localhost:4000';

type MapConfig = {
    center: [number, number];
    bounds: [[number, number], [number, number]];
    zoom: {
        initial: number;
        min: number;
        max: number;
    };
    tileUrl: string;
};

function parseMapConfig(value: unknown): MapConfig | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const config = value as Record<string, unknown>;
    const rawCenter = config.center;
    const bounds = config.bounds as Record<string, unknown> | undefined;
    const zoom = config.zoom as Record<string, unknown> | undefined;
    let center: [number, number] | null = null;

    if (Array.isArray(rawCenter)
        && rawCenter.length === 2
        && rawCenter.every((coordinate) => typeof coordinate === 'number')) {
        center = [rawCenter[0], rawCenter[1]];
    } else if (rawCenter && typeof rawCenter === 'object') {
        const objectCenter = rawCenter as Record<string, unknown>;
        if (typeof objectCenter.latitude === 'number' && typeof objectCenter.longitude === 'number') {
            center = [objectCenter.latitude, objectCenter.longitude];
        }
    }

    if (!center
        || !bounds
        || !zoom
        || typeof bounds.south !== 'number'
        || typeof bounds.west !== 'number'
        || typeof bounds.north !== 'number'
        || typeof bounds.east !== 'number'
        || typeof zoom.initial !== 'number'
        || typeof zoom.min !== 'number'
        || typeof zoom.max !== 'number'
        || typeof config.tileUrl !== 'string') {
        return null;
    }

    return {
        center,
        bounds: [
            [bounds.south, bounds.west],
            [bounds.north, bounds.east],
        ],
        zoom: {
            initial: zoom.initial,
            min: zoom.min,
            max: zoom.max,
        },
        tileUrl: config.tileUrl,
    };
}

function RecenterOnFirstFix({ point, zoom }: { point: GPSData | null; zoom: number }) {
    const map = useMap();
    const hasCentered = useRef(false);

    useEffect(() => {
        if (point && !hasCentered.current) {
            map.setView([point.latitude, point.longitude], zoom);
            hasCentered.current = true;
        }
    }, [map, point, zoom]);

    return null;
}

function formatNumber(value: number, digits = 5) {
    return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

async function requestMapConfig(url: string): Promise<{ config: MapConfig; responseUrl: string }> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Map configuration request failed with HTTP ${response.status}`);
    }

    const config = parseMapConfig(await response.json());
    if (!config) {
        throw new Error("Map configuration response has an invalid shape.");
    }

    return { config, responseUrl: response.url };
}

function resolveTileUrl(tileUrl: string, responseUrl: string) {
    if (/^https?:\/\//i.test(tileUrl)) {
        return tileUrl;
    }

    if (tileUrl.startsWith('/')) {
        return `${new URL(responseUrl).origin}${tileUrl}`;
    }

    throw new Error("Map configuration returned an unsupported tile URL.");
}

export default function GpsMap({ data, track }: { data: GPSData | null; track: GPSData[] }) {
    const [mapConfig, setMapConfig] = useState<MapConfig | null>(null);
    const [mapConfigError, setMapConfigError] = useState(false);
    const [tileError, setTileError] = useState(false);
    const latestPoint = track.length > 0 ? track[track.length - 1] : null;
    const hasCurrentFix = data?.valid === true;

    useEffect(() => {
        let cancelled = false;

        requestMapConfig("/map_config")
            .catch(async (error) => {
                console.warn("Map configuration request failed; trying localhost backend:", error);
                return requestMapConfig(`${LOCALHOST_API_BASE_URL}/map_config`);
            })
            .then(({ config, responseUrl }) => {
                config.tileUrl = resolveTileUrl(config.tileUrl, responseUrl);
                if (!cancelled) {
                    setMapConfig(config);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error("Failed to load map configuration:", error);
                    setMapConfigError(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <Stack spacing={2} className="gps-map-page">
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        GPS Route - Live
                    </Typography>
                    <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
                        <Typography variant="body2">
                            Latitude: {latestPoint ? formatNumber(latestPoint.latitude) : '--'}
                        </Typography>
                        <Typography variant="body2">
                            Longitude: {latestPoint ? formatNumber(latestPoint.longitude) : '--'}
                        </Typography>
                        <Typography variant="body2">
                            Satellites: {latestPoint ? latestPoint.satellites : '--'}
                        </Typography>
                        <Typography variant="body2">
                            HDOP: {latestPoint ? `${formatNumber(latestPoint.hdop, 2)} m` : '--'}
                        </Typography>
                        <Typography variant="body2">
                            Speed: {latestPoint ? `${formatNumber(latestPoint.speed, 1)} km/h` : '--'}
                        </Typography>
                        <Typography variant="body2">
                            Points: {track.length}
                        </Typography>
                    </Stack>
                    {!hasCurrentFix && (
                        <Alert severity={data && !data.valid ? 'warning' : 'info'} sx={{ mt: 2 }}>
                            {data && !data.valid && latestPoint
                                ? 'GPS fix lost; showing the last valid route position.'
                                : data && !data.valid
                                ? 'GPS data is arriving, but there is no valid fix yet.'
                                : 'Waiting for GPS data from the serial reader.'}
                        </Alert>
                    )}
                </CardContent>
            </Card>

            {mapConfigError ? (
                <Alert severity="error">Unable to load map configuration from the server.</Alert>
            ) : mapConfig ? (
                <Box className="gps-map-shell">
                    <MapContainer
                        center={mapConfig.center}
                        zoom={mapConfig.zoom.initial}
                        minZoom={mapConfig.zoom.min}
                        maxZoom={mapConfig.zoom.max}
                        maxBounds={mapConfig.bounds}
                        maxBoundsViscosity={1}
                        scrollWheelZoom
                    >
                        <TileLayer
                            url={mapConfig.tileUrl}
                            attribution={'&copy; <a href="https://opentopomap.org/about" target="_blank" rel="noreferrer">OpenTopoMap</a> (&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>)'}
                            eventHandlers={{
                                tileerror: () => setTileError(true),
                            }}
                        />
                        <RecenterOnFirstFix point={latestPoint} zoom={mapConfig.zoom.initial} />
                        {track.length > 1 && (
                            <Polyline
                                positions={track
                                    .slice(-MAX_TRACK_POINTS)
                                    .map((point) => [point.latitude, point.longitude] as [number, number])}
                                pathOptions={{ color: '#1976d2', weight: 4 }}
                            />
                        )}
                        {latestPoint && (
                            <CircleMarker
                                center={[latestPoint.latitude, latestPoint.longitude]}
                                radius={8}
                                pathOptions={{ color: '#d32f2f', fillColor: '#f44336', fillOpacity: 0.9 }}
                            />
                        )}
                    </MapContainer>
                </Box>
            ) : (
                <Alert severity="info">Loading map configuration...</Alert>
            )}

            {tileError && (
                <Alert severity="warning">
                    One or more offline map tiles are unavailable. Add the configured tile bundle under{' '}
                    <code>/map-tiles/{'{z}'}/{'{x}'}/{'{y}'}.png</code> before running without internet access.
                </Alert>
            )}
        </Stack>
    );
}
