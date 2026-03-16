// Client-side API helper

import { CreateUserRequest, UpdateUserRequest, UserRole } from "./types";

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

export async function getQCResults(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });

    Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value as string);
    });

    const res = await fetchWithAuth(`/api/qc-results?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch results");
    return res.json();
}

export async function getQCResult(id: string) {
    const res = await fetchWithAuth(`/api/qc-results/${id}`);
    if (!res.ok) throw new Error("Failed to fetch result details");
    return res.json();
}

export async function getMachines() {
    const res = await fetchWithAuth("/api/machines");
    if (!res.ok) throw new Error("Failed to fetch machines");
    return res.json();
}

export async function getMachine(id: string) {
    const res = await fetchWithAuth(`/api/machines/${id}`);
    if (!res.ok) throw new Error("Failed to fetch machine details");
    return res.json();
}

export async function getFleet(params: { search?: string; groupId?: string } = {}) {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.append("search", params.search);
    if (params.groupId) searchParams.append("group_id", params.groupId);
    const query = searchParams.toString();
    const res = await fetchWithAuth(`/api/fleet${query ? `?${query}` : ""}`);
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch fleet");
    }
    return res.json();
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
    return res.json();
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

    const res = await fetchWithAuth(`/api/users?${params.toString()}`);
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch users");
    }
    return res.json();
}

export async function getUser(id: number) {
    const res = await fetchWithAuth(`/api/users/${id}`);
    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch user");
    }
    return res.json();
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
    return res.json();
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
    return res.json();
}

export async function deleteUser(id: number) {
    const res = await fetchWithAuth(`/api/users/${id}`, {
        method: 'DELETE',
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete user");
    }
    return res.json();
}

