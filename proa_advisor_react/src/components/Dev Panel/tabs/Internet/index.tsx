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

export default function InternetConnectivityTab() {
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');

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

    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        fetch('/connect_wifi', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                ssid: ssid,
                password: password,
            }),
        }).then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    checkInternetConnectivity();
                }
            });
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
        </Stack>

    );
}
