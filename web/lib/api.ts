// Client-side API helper

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
