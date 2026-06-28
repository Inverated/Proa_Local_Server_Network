import type { } from '@mui/x-date-pickers/themeAugmentation';
import type { } from '@mui/x-charts/themeAugmentation';
import type { } from '@mui/x-data-grid-pro/themeAugmentation';
import type { } from '@mui/x-tree-view/themeAugmentation';
import { alpha } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import AppNavbar from './components/NavBar/AppNavbar';
import Header from './components/Header/Header';
import MainGrid from './components/MainBody/TemplateGrid';
import SideMenu from './components/Sidebar/SideMenu';
import AppTheme from './theme/AppTheme';
import {
    chartsCustomizations,
    dataGridCustomizations,
    datePickersCustomizations,
    treeViewCustomizations,
} from './theme/customizations';
import { useEffect, useState } from 'react';
import Overview from './components/MainBody/Overview';
import PowerManagement from './components/MainBody/PowerManagement';
import StrainManagement from './components/MainBody/StrainManagement';

const xThemeComponents = {
    ...chartsCustomizations,
    ...dataGridCustomizations,
    ...datePickersCustomizations,
    ...treeViewCustomizations,
};

export default function Dashboard(props: { disableCustomTheme?: boolean }) {
    //const [mainContent, setMainContent] = useState(-1);       // Use this for referencing the template
    const [mainContent, setMainContent] = useState(0);
    const [powerData, setPowerData] = useState<PowerData | null>(null);
    const [strainData, setStrainData] = useState<null>(null);  // To be implemented
    useEffect(() => {
        const eventSource = new EventSource("http://localhost:4000/data_stream");
        eventSource.addEventListener("power", (event) => {
            const data = JSON.parse(event.data);
            setPowerData(data);
        });

        eventSource.addEventListener("strain", (event) => {
            const data = JSON.parse(event.data);
            setStrainData(data);
        });

        return () => {
            eventSource.close();
        };
    }, []);

    return (
        <AppTheme {...props} themeComponents={xThemeComponents}>
            <CssBaseline enableColorScheme />
            <Box sx={{ display: 'flex', width: '100%' }}>
                <SideMenu selectedContent={mainContent} setSelectContent={setMainContent} />
                <AppNavbar selectedContent={mainContent} setSelectContent={setMainContent} />
                {/* Main content */}
                <Box
                    component="main"
                    sx={(theme) => ({
                        flexGrow: 1,
                        backgroundColor: theme.vars
                            ? `rgba(${theme.vars.palette.background.defaultChannel} / 1)`
                            : alpha(theme.palette.background.default, 1),
                        overflow: 'auto',
                    })}
                >
                    <Stack
                        spacing={2}
                        sx={{
                            alignItems: 'center',
                            mx: 3,
                            pb: 5,
                            mt: { xs: 8, md: 0 },
                        }}

                    >
                        <Header currentTab=
                            {mainContent === -1 ? 'Template Layout' :
                                mainContent === 0 ? 'Overview' :
                                    mainContent === 1 ? 'Power Management' :
                                        mainContent === 2 ? 'Strain Management' :
                                            'Unknown'} />
                        <Stack sx={{ width: "100%", height: "100%" }}>
                            {mainContent === -1 ? MainGrid() :
                                mainContent === 0 ? <Overview powerData={powerData} strainData={strainData} /> :
                                    mainContent === 1 ? <PowerManagement data={powerData} /> :
                                        mainContent === 2 ? <StrainManagement /> :
                                            <div>Unknown Content</div>
                            }
                        </Stack>
                    </Stack>
                </Box>
            </Box>
        </AppTheme>
    );
}
