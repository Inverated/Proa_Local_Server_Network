import type { ComponentType } from 'react';
import GeneralSettingsTab from './General';
import DisplaySettingsTab from './Display';
import NetworkSettingsTab from './Network';

export interface SettingsTabItem {
    text: string;
    component: ComponentType;
}

export const settingsTabItems: SettingsTabItem[] = [
    { text: 'General', component: GeneralSettingsTab },
    { text: 'Display Test', component: DisplaySettingsTab },
    { text: 'Network', component: NetworkSettingsTab },
];
