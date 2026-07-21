// TypeScript interfaces for the QC system

export interface Machine {
    id: number;
    machine_id: string;
    serial_number?: string;
    mac_address?: string;
    manufacturer?: string;
    model?: string;
    computer_name?: string;
    custom_name?: string;
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
    technician_label?: string;
    app_version?: string;
    overall_pass: boolean;
    overall_score?: number;
    overall_grade?: string;

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
    submission_ip?: string;

    // PRAMAAN scoring
    health_score?: number;
    health_id?: string;
    health_hash?: string;
    health_grade?: string;
    category_scores?: CategoryScores;
    risk_flags?: RiskFlags;
    scoring_algorithm_version?: string;
    is_demo?: boolean;
    demo_license_key_id?: number;

    created_at: Date;
}

export interface TestResult {
    id: number;
    qc_result_id: number;
    test_type: string;
    tested: boolean;
    passed: boolean;
    score?: number;
    grade?: string;
    message?: string;
    details_json?: any;
    timestamp?: Date;
}

// User role types for role-based access control
export type UserRole = 'SuperAdmin' | 'Employee' | 'Refurbisher' | 'Reseller' | 'Technician' | 'Enterprise' | 'OEM' | 'Insurer' | 'Client' | 'B2CDevice';

// Role display names for UI
export const UserRoleDisplayNames: Record<UserRole, string> = {
    SuperAdmin: 'Gadget Guruz',
    Employee: 'Employee',
    Refurbisher: 'Refurbisher',
    Reseller: 'Reseller',
    Technician: 'Technician',
    Enterprise: 'Enterprise',
    OEM: 'OEM',
    Insurer: 'Insurer',
    Client: 'Client',
    B2CDevice: 'B2C Device',
};

// Role descriptions
export const UserRoleDescriptions: Record<UserRole, string> = {
    SuperAdmin: 'Full system access, can manage all user types',
    Employee: 'Sales/demo user who can generate demo keys only',
    Refurbisher: 'Bulk refurbisher/reseller, manages technician team and grading',
    Reseller: 'Reseller account with enterprise features and client management',
    Technician: 'QC Technician, performs certifications on client laptops',
    Enterprise: 'IT fleet manager, tracks company machines and health over time',
    OEM: 'OEM partner, fleet management access equivalent to Enterprise',
    Insurer: 'Insurance partner, fleet management access equivalent to Enterprise',
    Client: 'Reseller client, limited access to assigned results and machines',
    B2CDevice: 'Restricted device session for B2C license activation',
};

export interface User {
    id: number;
    username: string;
    password_hash: string;
    role: UserRole;
    email?: string;
    company_name?: string;
    display_name?: string;
    created_by?: number;
    is_active: boolean;
    license_credits?: number;
    allow_monthly_keys?: boolean;
    allow_quarterly_keys?: boolean;
    allow_6month_keys?: boolean;
    allow_yearly_keys?: boolean;
    allow_perpetual_keys?: boolean;
    allow_windows_keys?: boolean;
    allow_android_keys?: boolean;
    allow_ios_keys?: boolean;
    allow_mac_keys?: boolean;
    created_at: Date;
}

// Extended user interface with creator info for API responses
export interface UserWithCreator extends Omit<User, 'password_hash'> {
    creator_username?: string;
    team_size?: number; // For Admins: number of users they manage
}

// User creation request
export interface CreateUserRequest {
    username: string;
    password: string;
    email?: string;
    company_name?: string;
    display_name?: string;
    role: UserRole;
    license_credits?: number;
    allow_windows_keys?: boolean;
    allow_android_keys?: boolean;
    allow_ios_keys?: boolean;
    allow_mac_keys?: boolean;
}

// User update request
export interface UpdateUserRequest {
    email?: string;
    company_name?: string;
    display_name?: string;
    role?: UserRole;
    is_active?: boolean;
    license_credits?: number;
    password?: string; // Optional: only if changing password
    allow_monthly_keys?: boolean;
    allow_quarterly_keys?: boolean;
    allow_6month_keys?: boolean;
    allow_yearly_keys?: boolean;
    allow_perpetual_keys?: boolean;
    allow_windows_keys?: boolean;
    allow_android_keys?: boolean;
    allow_ios_keys?: boolean;
    allow_mac_keys?: boolean;
}

// DTOs for API requests/responses
export interface SubmitQCResultRequest {
    reportId: string;
    machineId: string;
    timestamp: string;
    refurbishId?: string;
    technicianNotes?: string;
    appVersion?: string;
    overallPass: boolean;
    overallScore?: number;
    overallGrade?: string;
    technicianId?: number; // Optional: ID of logged-in technician

    systemInfo?: {
        computerName?: string;
        manufacturer?: string;
        model?: string;
        serialNumber?: string;
        macAddress?: string;
        osVersion?: string;
        windowsActivationStatus?: string;
        isWindowsActivated?: boolean;
        antivirusStatus?: string;
        isAntivirusHealthy?: boolean;
        cpuModel?: string;
        ramTotal?: number;
    };

    testResults: {
        testType: string;
        tested: boolean;
        passed: boolean;
        score?: number;
        grade?: string;
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

    // PRAMAAN scoring
    healthScore?: number;
    healthId?: string;
    healthHash?: string;
    healthGrade?: string;
    categoryScores?: CategoryScores;
    riskFlags?: RiskFlags;
    scoringAlgorithmVersion?: string;
}

export interface SubmitMachineHistoryRequest {
    machineId: string;
    timestamp?: string;
    source: string;
    componentGrades: Record<string, { score: number; grade: string }>;
    appVersion?: string;
}

export interface MachineHistoryAlert {
    machine_id: number;
    machine_identifier: string;
    custom_name?: string;
    component: string;
    previous_grade: string;
    latest_grade: string;
    latest_timestamp: string;
}

export interface LoginRequest {
    identifier: string;
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

// ── PRAMAAN Types ──

export interface CategoryScores {
    storage: number;
    thermal: number;
    battery: number;
    cpu_ram: number;
    physical_ports: number;
    repair_modifier: number;
    [key: string]: number;
}

export interface RiskFlags {
    storage: boolean;
    thermal: boolean;
    battery: boolean;
    cpu_ram: boolean;
    physical_ports: boolean;
    repair_modifier: boolean;
    [key: string]: boolean;
}

export type HealthGrade = 'A+' | 'A' | 'B' | 'C' | 'Reject';

export const HealthGradeLabels: Record<HealthGrade, string> = {
    'A+': 'Certified Premium',
    'A': 'Certified',
    'B': 'Good Condition',
    'C': 'Acceptable',
    'Reject': 'Not Certified',
};

export const CategoryLabels: Record<string, string> = {
    storage: 'Storage Health',
    thermal: 'Thermal Performance',
    battery: 'Battery Health',
    cpu_ram: 'CPU & RAM',
    physical_ports: 'Physical Ports',
    repair_modifier: 'Repair History',
};

// ── Fleet Types (Enterprise) ──

export interface MachineGroup {
    id: number;
    name: string;
    description?: string;
    enterprise_user_id: number;
    created_at: Date;
    machine_count?: number;
}

export type LifecycleEventType = 'enrolled' | 'tested' | 'retired' | 'repaired' | 'transferred' | 'decommissioned';

export interface MachineLifecycleEvent {
    id: number;
    machine_id: number;
    event_type: LifecycleEventType;
    notes?: string;
    recorded_by?: number;
    recorded_by_username?: string;
    created_at: Date;
}

export interface MachineWithFleetInfo extends Machine {
    asset_tag?: string;
    owner_user_id?: number;
    group_id?: number;
    group_name?: string;
    latest_score?: number;
    latest_grade?: string;
    latest_test_date?: Date;
    lifecycle_event_count?: number;
}

