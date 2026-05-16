import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import { useEffect, useState } from 'react';
import Overview from '../MainBody/Overview';
import PowerManagement from '../MainBody/PowerManagement';
import StrainManagement from '../MainBody/StrainManagement';
import ConnectedDevice from '../MainBody/ConnectedDevice';

const mainListItems = [
    { text: 'Overview', icon: <HomeRoundedIcon />, component: Overview },
    { text: 'Power Management', icon: <AnalyticsRoundedIcon />, component: PowerManagement },
    { text: 'Strain Gauge', icon: <PeopleRoundedIcon />, component: StrainManagement },
    { text: 'Connected Devices', icon: <AssignmentRoundedIcon />, component: ConnectedDevice },
];

const secondaryListItems = [
    { text: 'Settings', icon: <SettingsRoundedIcon /> },
    { text: 'About', icon: <InfoRoundedIcon /> },
];

export default function MenuContent({ setSelectContent }) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    function handleSelect(index) {
        console.log(setSelectContent);
        setSelectedIndex(index);
        setSelectContent(mainListItems[index].component);
    }

    return (
        <Stack sx={{ flexGrow: 1, p: 1, justifyContent: 'space-between' }}>
            <List dense>
                {mainListItems.map((item, index) => (
                    <ListItem key={index} disablePadding sx={{ display: 'block' }}>
                        <ListItemButton selected={index === selectedIndex} onClick={() => handleSelect(index)}>
                            <ListItemIcon>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
            <List dense>
                {secondaryListItems.map((item, index) => (
                    <ListItem key={index} disablePadding sx={{ display: 'block' }}>
                        <ListItemButton>
                            <ListItemIcon>{item.icon}</ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
        </Stack>
    );
}
