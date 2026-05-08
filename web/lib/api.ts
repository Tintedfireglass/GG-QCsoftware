// Client-side API helper

import { CreateUserRequest, UpdateUserRequest, UserRole } from "./types";
import { cachedJson, clearClientCache } from "./client-cache";

const TTL = {
    short: 60 * 1000,
    medium: 5 * 60 * 1000,
    long: 10 * 60 * 1000,
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem("qc_token");

    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    } as HeadersInit;

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem("qc_token");
        localStorage.removeItem("qc_user");
        window.location.href = "/login";
        throw new Error("Unauthorized");
    }

    return response;
}

async function fetchWithCustomerAuth(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem("qc_customer_token");

    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    } as HeadersInit;

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        localStorage.removeItem("qc_customer_token");
        localStorage.removeItem("qc_customer_user");
        window.location.href = "/customer/login";
        throw new Error("Unauthorized");
    }

    return response;
}

function getCustomerNamespace(): string {
    try {
        const raw = localStorage.getItem("qc_customer_user")
        if (!raw) return "customer:anon"
        const user = JSON.parse(raw) as { id?: number }
        if (typeof user?.id !== "number") return "customer:anon"
        return `customer:u${user.id}`
    } catch {
        return "customer:anon"
    }
}

async function cachedGetJson<T = any>(url: string, ttlMs: number): Promise<T> {
    return cachedJson(
        `GET ${url}`,
        async () => {
            const res = await fetchWithAuth(url);
            if (!res.ok) {
                try {
                    const error = await res.json();
                    throw new Error(error?.message || error?.error || `Request failed: ${res.status}`);
                } catch {
                    throw new Error(`Request failed: ${res.status}`);
                }
            }
            return res.json() as Promise<T>;
        },
        { ttlMs, persist: "session" }
    )
}

async function cachedGetCustomerJson<T = any>(url: string, ttlMs: number): Promise<T> {
    return cachedJson(
        `GET ${url}`,
        async () => {
            const res = await fetchWithCustomerAuth(url);
            if (!res.ok) {
                try {
                    const error = await res.json();
                    throw new Error(error?.message || error?.error || `Request failed: ${res.status}`);
                } catch {
                    throw new Error(`Request failed: ${res.status}`);
                }
            }
            return res.json() as Promise<T>;
        },
        { ttlMs, persist: "session", namespace: getCustomerNamespace() }
    )
}

async function cachedGetPublicJson<T = any>(url: string, ttlMs: number): Promise<T> {
    return cachedJson(
        `GET ${url}`,
        async () => {
            const res = await fetch(url);
            if (!res.ok) {
                try {
                    const error = await res.json();
                    throw new Error(error?.message || error?.error || `Request failed: ${res.status}`);
                } catch {
                    throw new Error(`Request failed: ${res.status}`);
                }
            }
            return res.json() as Promise<T>;
        },
        { ttlMs, persist: "session", namespace: "public" }
    )
}

export async function getQCResults(
    page = 1,
    limit = 20,
    filters: Record<string, string | undefined> = {},
    options: { includeTotal?: boolean } = {}
) {
    const offset = (page - 1) * limit;
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });

    Object.entries(filters).forEach(([key, value]) => {
        if (value != null && value !== "") params.append(key, value);
    });

    if (options.includeTotal === false) {
        params.append("includeTotal", "0");
    }

    return cachedGetJson(`/api/qc-results?${params.toString()}`, TTL.short);
}

export async function getQCResultsCount(filters: Record<string, string | undefined> = {}): Promise<{ total: number }> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value != null && value !== "") params.append(key, value);
    });

    const queryStr = params.toString();
    return cachedGetJson(`/api/qc-results/count${queryStr ? `?${queryStr}` : ""}`, TTL.short);
}

export async function getQCResult(id: string) {
    return cachedGetJson(`/api/qc-results/${id}`, TTL.long);
}

export async function getMachines() {
    return cachedGetJson("/api/machines", TTL.medium);
}

export async function getMachinesCount(): Promise<{ total: number }> {
    return cachedGetJson("/api/machines?countOnly=1", TTL.medium);
}

export async function getMachineHistoryAlerts() {
    return cachedGetJson("/api/machine-history/alerts?recentDays=30&limit=10", TTL.medium);
}

export async function getIssuesSummary(): Promise<{ devicesWithIssues: number; totalDevices: number }> {
    return cachedGetJson("/api/qc-results/issues-summary", TTL.medium);
}

export async function getMachine(id: string) {
    return cachedGetJson(`/api/machines/${id}`, TTL.long);
}

export async function updateMachineCustomName(id: string, customName: string) {
    const res = await fetchWithAuth(`/api/machines/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ customName }),
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json?.message || json?.error || "Failed to save name");
    }
    clearClientCache();
    return json;
}

export async function getFleet(params: { search?: string; groupId?: string } = {}) {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append("search", params.search);
    if (params.groupId) searchParams.append("group_id", params.groupId);
    const query = searchParams.toString();
    return cachedGetJson(`/api/fleet${query ? `?${query}` : ""}`, TTL.short);
}

export async function enrollFleetMachine(data: {
    machine_id: string;
    asset_tag?: string;
    group_id?: number | null;
    serial_number?: string;
    manufacturer?: string;
    model?: string;
}) {
    const res = await fetchWithAuth("/api/fleet", {
        method: "POST",
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to enroll machine");
    }
    const out = await res.json();
    clearClientCache();
    return out;
}

export async function getDashboardStats() {
    // Can be optimized into a single API call later
    // For now we calculate some stats from the list endpoints or add a stats endpoint
    // Let's assume we implement a stats endpoint or just fetch lists for now
    return {
        totalTests: 0,
        passRate: 0,
        activeMachines: 0
    };
}

// User Management API functions

export interface UsersListResponse {
    users: any[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export async function getUsers(page = 1, limit = 20, filters: { search?: string; role?: UserRole } = {}): Promise<UsersListResponse> {
    const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
    });

    if (filters.search) params.append('search', filters.search);
    if (filters.role) params.append('role', filters.role);

    return cachedGetJson(`/api/users?${params.toString()}`, TTL.short);
}

export async function getUserStats(): Promise<{ totalUsers: number; totalAdmins: number; totalTechnicians: number }> {
    return cachedGetJson("/api/users/stats", TTL.medium);
}

export async function getUser(id: number) {
    return cachedGetJson(`/api/users/${id}`, TTL.long);
}

export async function createUser(data: CreateUserRequest) {
    const res = await fetchWithAuth('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create user");
    }
    const out = await res.json();
    clearClientCache();
    return out;
}

export async function updateUser(id: number, data: UpdateUserRequest) {
    const res = await fetchWithAuth(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user");
    }
    const out = await res.json();
    clearClientCache();
    return out;
}

export async function deleteUser(id: number) {
    const res = await fetchWithAuth(`/api/users/${id}`, {
        method: 'DELETE',
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete user");
    }
    const out = await res.json();
    clearClientCache();
    return out;
}

export async function getLicenses(): Promise<{ keys: any[] }> {
    return cachedGetJson("/api/licenses", TTL.short);
}

export async function createLicenseKey(data: {
    type: "single_use" | "bulk" | "demo"
    max_uses: number
    expires_at?: string | null
    demo_customer_name?: string
}) {
    const res = await fetchWithAuth("/api/licenses", {
        method: "POST",
        body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json?.message || json?.error || "Failed to generate key");
    }
    clearClientCache();
    return json;
}

export async function toggleLicenseKeyActive(data: { id: number; is_active: boolean }) {
    const res = await fetchWithAuth("/api/licenses", {
        method: "PATCH",
        body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json?.message || json?.error || "Failed to update key");
    }
    clearClientCache();
    return json;
}

export async function getCustomerLicenses(): Promise<{ licenses: any[] }> {
    return cachedGetCustomerJson("/api/customer/licenses", TTL.short);
}

export async function getPublicVerify(healthId: string) {
    return cachedGetPublicJson(`/api/verify/${healthId}`, TTL.long);
}

export interface AdminFreeTrialRow {
    id: number
    email: string
    machine_serial: string
    mac_address: string | null
    computer_name: string | null
    machine_id: number | null
    machine_identifier: string | null
    trial_start_utc: string
    trial_end_utc: string
    is_active: boolean
    revoked_at: string | null
    revoke_reason: string | null
    created_at: string
}

export async function getAdminFreeTrials(): Promise<{ trials: AdminFreeTrialRow[] }> {
    return cachedGetJson("/api/admin/free-trials", TTL.short)
}
