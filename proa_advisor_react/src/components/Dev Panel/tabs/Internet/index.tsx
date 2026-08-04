import { useEffect, useState } from 'react';
import './styles.css';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';

function getAuthHeaders() {
    const headers = new Headers();
    const token = localStorage.getItem('token');
    if (token) {
        headers.set('Authorization', 'Bearer ' + token);
    }
    headers.set("Content-Type", "application/json");
    return headers;
}

type StatusKind = 'success' | 'error' | 'info';

export default function InternetConnectivityTab() {
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [statusKind, setStatusKind] = useState<StatusKind>('info');

    useEffect(() => {
        checkInternetConnectivity();
    }, []);

    const checkInternetConnectivity = async () => {
        try {
            const response = await fetch('/has_internet');
            const data = await response.json();
            setIsConnected(data.hasInternet);
        } catch (error) {
            try {
                const response = await fetch('http://localhost:4000/has_internet');
                const data = await response.json();
                setIsConnected(data.hasInternet);
            } catch (error) {
                console.error('Error checking internet connectivity:', error);

                setIsConnected(false);
            }
        }
    };

    useEffect(() => {
        if (!statusMessage) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setStatusMessage('');
        }, 4000);

        return () => window.clearTimeout(timeoutId);
    }, [statusMessage]);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        try {
            const response = await fetch('/connect_wifi', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ssid: ssid,
                    password: password,
                }),
            })
            const data = await response.json()
            if (data.success) {
                checkInternetConnectivity();
            }
        } catch {
            const response = await fetch('http://localhost:4000/connect_wifi', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ssid: ssid,
                    password: password,
                }),
            })
            const data = await response.json();
            if (data.success) {
                setStatusMessage('Successfully connected to Wi-Fi.');
                setStatusKind('success');
                checkInternetConnectivity();
            } else {
                setStatusMessage('Failed to connect to Wi-Fi.');
                setStatusKind('error');
            }
        }
    }

    return (
        <Stack spacing={2} className="internet-connectivity-tab">
            {isConnected === true ? (
                <p style={{ color: 'green' }}>Connected to the internet.</p>
            ) : isConnected === false ? (
                <p style={{ color: 'red' }}>Disconnected from the internet.</p>
            ) : (
                <p>Status: Checking...</p>
            )}
            {isConnected !== null && (
                <>
                    <p>Only supported for Linux systems (raspberry pi while deployed). Use your system's network settings to manage Wi-Fi connections.</p>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', width: '100%', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                        <Stack spacing={2} sx={{ width: '70%' }}>
                            <TextField
                                label="SSID"
                                autoFocus
                                onChange={(e) => setSsid(e.target.value)}
                                value={ssid}
                            />
                            <TextField
                                label="Password"
                                type="password"
                                variant="outlined"
                                onChange={(e) => setPassword(e.target.value)}
                                value={password}
                            />
                            <Button type="submit" variant="contained">
                                Connect
                            </Button>
                        </Stack>
                    </form>
                </>
            )}
            {statusMessage && (
                <p className={`internet-management-status ${statusKind}`}>
                    {statusMessage}
                </p>
            )}
        </Stack>


    );
}
