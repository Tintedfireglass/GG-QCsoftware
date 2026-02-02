// TypeScript interfaces for the QC system

export interface Machine {
    id: number;
    machine_id: string;
    serial_number?: string;
    mac_address?: string;
    manufacturer?: string;
    model?: string;
    last_seen?: Date;
    location?: string;
    created_at: Date;
}

export interface QCResult {
    id: number;
    report_id: string;
    machine_id: number;
    timestamp: Date;
    refurbish_id?: string;
    technician_notes?: string;
    overall_pass: boolean;

    // System Info Snapshot
    system_manufacturer?: string;
    system_model?: string;
    system_serial?: string;
    mac_address?: string;
    cpu_model?: string;
    ram_total?: number;

    // JSON fields
    system_info_json?: any;
    cpu_details_json?: any;
    ram_details_json?: any;
    storage_details_json?: any;
    battery_details_json?: any;
    device_details_json?: any;

    created_at: Date;
}

export interface TestResult {
    id: number;
    qc_result_id: number;
    test_type: string;
    tested: boolean;
    passed: boolean;
    message?: string;
    details_json?: any;
    timestamp?: Date;
}

export interface User {
    id: number;
    username: string;
    password_hash: string;
    role: 'Admin' | 'Viewer';
    email?: string;
    is_active: boolean;
    created_at: Date;
}

// DTOs for API requests/responses
export interface SubmitQCResultRequest {
    reportId: string;
    machineId: string;
    timestamp: string;
    refurbishId?: string;
    technicianNotes?: string;
    overallPass: boolean;

    systemInfo?: {
        manufacturer?: string;
        model?: string;
        serialNumber?: string;
        macAddress?: string;
        cpuModel?: string;
        ramTotal?: number;
    };

    testResults: {
        testType: string;
        tested: boolean;
        passed: boolean;
        message?: string;
        details?: any;
        timestamp?: string;
    }[];

    // Detailed snapshots
    cpuDetails?: any;
    ramDetails?: any;
    storageDetails?: any;
    batteryDetails?: any;
    deviceDetails?: any;
}

export interface LoginRequest {
    username: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: {
        id: number;
        username: string;
        role: string;
    };
}

export interface ApiError {
    error: string;
    message: string;
}
