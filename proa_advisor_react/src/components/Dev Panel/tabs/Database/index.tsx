import { useEffect, useMemo, useState } from 'react';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import './styles.css';

type StatusKind = 'success' | 'error' | 'info';
type SOCSensorRunSummary = {
    run_id: number;
    start_row_id: number;
    start_datetime: string;
    row_count: number;
};

const LOCALHOST_API_BASE_URL = 'http://localhost:4000';

function getAuthHeaders() {
    const headers = new Headers();
    const token = localStorage.getItem('token');
    if (token) {
        headers.set('Authorization', 'Bearer ' + token);
    }
    return headers;
}

async function fetchWithFallback(route: string) {
    const requestInit: RequestInit = {
        method: 'GET',
        headers: getAuthHeaders(),
    };

    try {
        const response = await fetch(route, requestInit);
        return await response.json();
    } catch (error) {
        const response = await fetch(LOCALHOST_API_BASE_URL + route, requestInit);
        try {
            return await response.json();
        } catch (fallbackError) {
            throw new Error('Failed to fetch from both primary and fallback routes');
        }
    }
}

async function fetchRawWithFallback(route: string, requestInit: RequestInit) {
    const isCsvDownloadResponse = (response: Response) => {
        const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
        const contentDisposition = (response.headers.get('Content-Disposition') || '').toLowerCase();
        return contentType.includes('text/csv') || contentDisposition.includes('attachment');
    };

    const shouldRetryAgainstBackend = (response: Response) => {
        const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
        return contentType.includes('text/html');
    };

    try {
        const response = await fetch(route, requestInit);
        if (isCsvDownloadResponse(response) || !shouldRetryAgainstBackend(response)) {
            return response;
        }
    } catch (error) {
        // Retry against explicit backend URL.
    }
    return await fetch(LOCALHOST_API_BASE_URL + route, requestInit);
}

function getFileNameFromContentDisposition(contentDisposition: string | null) {
    if (!contentDisposition) {
        return null;
    }
    const match = /filename="([^"]+)"/i.exec(contentDisposition);
    return match?.[1] ?? null;
}

function formatStartTime(value: string) {
    const dt = new Date(value.replace(' ', 'T') + 'Z');
    if (Number.isNaN(dt.getTime())) {
        return value;
    }
    return dt.toLocaleString();
}

export default function DatabaseManagementTab() {
    const [statusMessage, setStatusMessage] = useState('');
    const [statusKind, setStatusKind] = useState<StatusKind>('info');
    const [isDownloadingSOCSensor, setIsDownloadingSOCSensor] = useState(false);
    const [isLoadingRuns, setIsLoadingRuns] = useState(true);
    const [runSummaries, setRunSummaries] = useState<SOCSensorRunSummary[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

    const selectedRunSummary = useMemo(
        () => runSummaries.find((run) => run.run_id === selectedRunId) ?? null,
        [runSummaries, selectedRunId],
    );

    useEffect(() => {
        if (!statusMessage || isDownloadingSOCSensor) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setStatusMessage('');
        }, 4000);

        return () => window.clearTimeout(timeoutId);
    }, [statusMessage, isDownloadingSOCSensor]);

    useEffect(() => {
        loadRunSummaries();
    }, []);

    async function loadRunSummaries() {
        setIsLoadingRuns(true);
        try {
            const data = await fetchWithFallback('/socsensor_runs');
            if (!data || !Array.isArray(data.runs)) {
                throw new Error('Failed to load SOCSensor runs.');
            }

            const runs = data.runs as SOCSensorRunSummary[];
            setRunSummaries(runs);

            if (runs.length > 0) {
                setSelectedRunId(runs[0].run_id);
            } else {
                setSelectedRunId(null);
                setStatusKind('info');
                setStatusMessage('No SOCSensor runs available to download.');
            }
        } catch (error) {
            setStatusKind('error');
            setStatusMessage(error instanceof Error ? error.message : 'Failed to load SOCSensor runs.');
        } finally {
            setIsLoadingRuns(false);
        }
    }

    async function handleDownloadSOCSensor() {
        if (selectedRunSummary === null) {
            setStatusKind('error');
            setStatusMessage('No run selected for download.');
            return;
        }

        setIsDownloadingSOCSensor(true);
        setStatusKind('info');
        setStatusMessage(`Downloading SOCSensor data for run ${selectedRunSummary.run_id}...`);

        const headers = getAuthHeaders();
        const route = `/download_socsensor?run_id=${selectedRunSummary.run_id}&rowid=${selectedRunSummary.start_row_id}`;

        try {
            const response = await fetchRawWithFallback(route, {
                method: 'GET',
                headers,
            });

            if (!response.ok) {
                let errorMessage = 'Failed to download SOCSensor data.';
                try {
                    const body = await response.json();
                    if (body?.message) {
                        errorMessage = body.message;
                    }
                } catch (error) {
                    // Keep the default error message if error body is not JSON.
                }
                throw new Error(errorMessage);
            }

            const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
            const contentDisposition = (response.headers.get('Content-Disposition') || '').toLowerCase();
            if (!contentType.includes('text/csv') && !contentDisposition.includes('attachment')) {
                throw new Error('Unexpected response received while downloading SOCSensor CSV.');
            }

            const blob = await response.blob();
            const fileName =
                getFileNameFromContentDisposition(response.headers.get('Content-Disposition')) ??
                `SOCSensor_run_${selectedRunSummary.run_id}.csv`;

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            setStatusKind('success');
            setStatusMessage(`Downloaded ${fileName}.`);
        } catch (error) {
            setStatusKind('error');
            setStatusMessage(error instanceof Error ? error.message : 'Failed to download SOCSensor data.');
        } finally {
            setIsDownloadingSOCSensor(false);
        }
    }

    return (
        <section className="database-management-tab">
            <div className="database-run-selector">
                <label htmlFor="run-id-select">Run ID</label>
                <select
                    id="run-id-select"
                    value={selectedRunId ?? ''}
                    onChange={(event) => setSelectedRunId(Number.parseInt(event.target.value, 10))}
                    disabled={isLoadingRuns || runSummaries.length === 0 || isDownloadingSOCSensor}
                >
                    {runSummaries.map((run) => (
                        <option key={run.run_id} value={run.run_id}>
                            {`Run ${run.run_id} | Start ${formatStartTime(run.start_datetime)}`}
                        </option>
                    ))}
                </select>
            </div>

            <Stack spacing={2} sx={{ width: '70%' }}>
                <Button
                    variant="contained"
                    onClick={handleDownloadSOCSensor}
                    disabled={isDownloadingSOCSensor || isLoadingRuns || selectedRunSummary === null}
                >
                    {isDownloadingSOCSensor ? 'Downloading SOCSensor Data...' : 'Download SOCSensor Data'}
                </Button>
            </Stack>
            {statusMessage && (
                <p className={`database-management-status ${statusKind}`}>
                    {statusMessage}
                </p>
            )}
        </section>
    );
}
