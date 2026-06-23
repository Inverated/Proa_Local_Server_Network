type PowerData = {
    total_time: number;
    total_load_W: number;
    total_mppt_W: number;
    total_batt1_net_W: number;
    total_batt2_net_W: number;
    I_batt_main: number;
    I_batt_alternate: number;
    I_mppt: number;
    I_load: number;
    Corrected_I_batt_main: number;
    Corrected_I_batt_alternate: number;
    Corrected_I_mppt: number;
    Corrected_I_load: number;
    V_batt_main: number;
    V_batt_alternate?: number;
    Corrected_V_batt_main: number;
    Corrected_V_batt_alternate?: number;
    OCV_batt_main: number;
    OCV_batt_alternate?: number;
    SoC_batt_main: number;
    SoC_batt_alternate?: number;
};

