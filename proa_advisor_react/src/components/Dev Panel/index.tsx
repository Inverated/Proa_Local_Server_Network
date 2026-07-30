import { useEffect, useMemo, useState } from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Box from '@mui/material/Box';
import { settingsTabItems } from './tabs';
import './styles.css';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField'; '@mui/material/TextField';
import Input from '@mui/material/Input';

export default function DevPanel() {
    const [token, setToken] = useState(localStorage.getItem('token') || '');

    
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
            setToken(storedToken);
        }
    }, []);

    const selectedTab = useMemo(() => settingsTabItems[selectedIndex], [selectedIndex]);
    const ActiveTabComponent = selectedTab?.component;
    
    function handleLogin(event: React.FormEvent) {
        event.preventDefault();
        fetch('/admin_login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        })
        .then((response) => response.json())
        .then((data) => {
            if (data.token) {
                localStorage.setItem('token', data.token);
                setToken(data.token);
            } else {
                setError('Login failed. Please check your credentials.');
            }
        })
        .catch((error) => {
            fetch('http://localhost:4000/admin_login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            })
            .then((response) => response.json())
            .then((data) => {
                console.log(data);
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    setToken(data.token);
                } else {
                    setError('Login failed. Please check your credentials.');
                }
            })
            .catch((error) => {
                setError('An error occurred during login. Please try again later.');
            });
        });
    }

    if (!token) {
        return (
            <div className="login-page">
                <form className="login-form">
                    <h2>Dev Panel Login</h2>
                    <Stack spacing={2} sx={{ width: '100%' }}>
                        <TextField
                            label="Username"
                            value={username}
                            autoFocus
                            onChange={(e) => setUsername(e.target.value)}
                            />
                        <TextField
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        </Stack>
                    {error && <p className="error-message">{error}</p>}
                    <Button type="submit" variant="contained" onClick={handleLogin}>
                        Login
                    </Button>
                </form>

            </div>
        );
    }
    return (
        <div className="settings-page">

                <aside className="settings-sidebar">
                <h3 className="settings-sidebar-title">Dev Menu</h3>
                <List dense>
                    {settingsTabItems.map((item, index) => (
                        <ListItem key={item.text} disablePadding sx={{ display: 'block' }}>
                            <ListItemButton selected={selectedIndex === index} onClick={() => setSelectedIndex(index)}>
                                <ListItemText primary={item.text} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                    <ListItem key="logout" disablePadding sx={{ display: 'block', borderTop: '1px solid #ccc', marginTop: '10px' }}>
                        <ListItemButton onClick={() => {
                            localStorage.removeItem('token');
                            setToken('');
                        }}>
                            <ListItemText primary="Logout" />
                        </ListItemButton>
                    </ListItem>
                </List>
            </aside>

            <main className="settings-main-body">
                <h2 className="settings-main-title">{selectedTab?.text ?? 'Dev Panel'}</h2>
                <Box className="settings-main-content">
                    {ActiveTabComponent ? <ActiveTabComponent /> : <p>Select a tab.</p>}
                </Box>
            </main>
        </div>
    );
}
