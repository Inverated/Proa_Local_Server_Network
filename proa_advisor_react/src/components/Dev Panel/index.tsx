import { useMemo, useState } from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Box from '@mui/material/Box';
import { settingsTabItems } from './tabs';
import './styles.css';

export default function DevPanel() {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const selectedTab = useMemo(() => settingsTabItems[selectedIndex], [selectedIndex]);
    const ActiveTabComponent = selectedTab?.component;

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
