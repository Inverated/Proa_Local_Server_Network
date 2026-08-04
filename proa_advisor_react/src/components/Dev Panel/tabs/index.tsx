import type { ComponentType } from 'react';
import InternetConnectivityTab from './Internet';
import ConsoleTab from './Console Panel';
import ServerManagementTab from './Server Management';
import StrainCalibrationTab from './Strain Calibration';
import DatabaseManagementTab from './Database';
 
export interface SettingsTabItem {
    text: string;
    component: ComponentType;
}

export const settingsTabItems: SettingsTabItem[] = [
    { text: 'Internet', component: InternetConnectivityTab },
    { text: 'Console', component: ConsoleTab },
    { text: 'Server', component: ServerManagementTab },
    { text: 'Database', component: DatabaseManagementTab },
    { text: 'Strain Calibration', component: StrainCalibrationTab },
];
