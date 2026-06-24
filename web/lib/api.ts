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

export async function hideQCResult(id: string) {
    const res = await fetchWithAuth(`/api/qc-results/${id}`, { method: "DELETE" });
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || json?.message || "Failed to hide result");
    }
    clearClientCache();
    return res.json();
}

// ── Mobile (B2C Android) reports — admin/reseller view ──────────────────────────
export interface MobileReportRow {
    reportId: string;
    reportType: string;
    testType: string | null;
    result: string | null;
    score: number | null;
    grade: string | null;
    passedCount: number | null;
    failedCount: number | null;
    deviceId: string;
    deviceModel: string | null;
    testedAt: string | null;
    createdAt: string | null;
    customer: { id: number; name: string | null; phone: string | null; email: string | null };
    reseller: { id: number; name: string | null; role: string | null; licenseKey: string | null } | null;
}

export async function getMobileReports(
    page = 1,
    limit = 20,
    filters: Record<string, string | undefined> = {}
): Promise<{ reports: MobileReportRow[]; pagination: { total: number | null; limit: number; offset: number } }> {
    const offset = (page - 1) * limit;
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    Object.entries(filters).forEach(([key, value]) => {
        if (value != null && value !== "") params.append(key, value);
    });
    return cachedGetJson(`/api/admin/mobile-reports?${params.toString()}`, TTL.short);
}

export async function getMobileReport(reportId: string): Promise<{ report: MobileReportRow & { payload: Record<string, unknown>; deviceSnapshot: Record<string, unknown> | null; stressSamples: Array<{ elapsedSec: number; gips: number | null; phase: string | null }> } }> {
    return cachedGetJson(`/api/admin/mobile-reports/${encodeURIComponent(reportId)}`, TTL.long);
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

export interface LicensesPage {
    keys: any[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function getLicenses(
    params: { search?: string; status?: string; sort?: string; page?: number; limit?: number } = {}
): Promise<LicensesPage> {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.status && params.status !== "all") qs.set("status", params.status);
    if (params.sort) qs.set("sort", params.sort);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    // Admin list: not cached (like customers/orders) so toggles/new keys show immediately.
    const res = await fetchWithAuth(`/api/licenses${q ? `?${q}` : ""}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load licenses");
    return json;
}

export async function createLicenseKey(data: {
    type: "single_use" | "bulk" | "demo"
    max_uses: number
    expires_at?: string | null
    demo_customer_name?: string
    product_scope?: string[]
    platform_caps?: Record<string, number>
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

export interface PlanDTO {
    id: number
    name: string
    description: string | null
    price_cents: number
    currency: string
    product_scope: string[]
    platform_caps: Record<string, number>
    duration_days: number | null
    features: string[] | null
    allow_auto_renew: boolean
    is_active: boolean
    sort_order: number
}

export async function getAdminPlans(): Promise<{ plans: PlanDTO[] }> {
    const res = await fetchWithAuth("/api/admin/plans");
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load plans");
    return json;
}

export async function createPlan(data: Record<string, unknown>) {
    const res = await fetchWithAuth("/api/admin/plans", { method: "POST", body: JSON.stringify(data) });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to create plan");
    clearClientCache();
    return json;
}

export async function updatePlan(id: number, data: Record<string, unknown>) {
    const res = await fetchWithAuth(`/api/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to update plan");
    clearClientCache();
    return json;
}

export async function deletePlan(id: number) {
    const res = await fetchWithAuth(`/api/admin/plans/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to delete plan");
    clearClientCache();
    return json;
}

export async function getCustomerPlans(): Promise<{ plans: PlanDTO[] }> {
    const res = await fetch("/api/customer/plans");
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load plans");
    return json;
}

export interface ContactDTO {
    id: number
    name: string
    company_name: string | null
    phone: string | null
    email: string
    service: string | null
    description: string | null
    source: string | null
    status: "new" | "read" | "archived"
    created_at: string
}

export async function getAdminContacts(params: { status?: string; page?: number; limit?: number } = {}): Promise<{ contacts: ContactDTO[]; newCount: number; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const qs = new URLSearchParams()
    if (params.status) qs.set("status", params.status)
    if (params.page) qs.set("page", String(params.page))
    if (params.limit) qs.set("limit", String(params.limit))
    const res = await fetchWithAuth(`/api/admin/contacts?${qs.toString()}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load contacts")
    return json
}

export async function updateContactStatus(id: number, status: "new" | "read" | "archived") {
    const res = await fetchWithAuth(`/api/admin/contacts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to update status")
    clearClientCache()
    return json
}

export async function deleteContact(id: number) {
    const res = await fetchWithAuth(`/api/admin/contacts/${id}`, { method: "DELETE" })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to delete submission")
    clearClientCache()
    return json
}

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed"
export type TicketPriority = "low" | "normal" | "high"

export interface SupportTicketDTO {
    id: number
    ticketId: string
    subject: string
    category: string | null
    message: string
    deviceId: string | null
    appVersion: string | null
    status: TicketStatus
    priority: TicketPriority
    adminNote: string | null
    createdAt: string
    updatedAt: string
    customer: { id: number; name: string | null; phone: string | null; email: string | null }
}

export async function getAdminSupportTickets(params: { status?: string; search?: string; page?: number; limit?: number } = {}): Promise<{ tickets: SupportTicketDTO[]; openCount: number; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const qs = new URLSearchParams()
    if (params.status) qs.set("status", params.status)
    if (params.search) qs.set("search", params.search)
    if (params.page) qs.set("page", String(params.page))
    if (params.limit) qs.set("limit", String(params.limit))
    const res = await fetchWithAuth(`/api/admin/support?${qs.toString()}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load support tickets")
    return json
}

export async function updateSupportTicket(id: number, patch: { status?: TicketStatus; priority?: TicketPriority; adminNote?: string | null }) {
    const res = await fetchWithAuth(`/api/admin/support/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to update ticket")
    clearClientCache()
    return json
}

export async function deleteSupportTicket(id: number) {
    const res = await fetchWithAuth(`/api/admin/support/${id}`, { method: "DELETE" })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to delete ticket")
    clearClientCache()
    return json
}

export interface SupportTicketMessageDTO {
    id: number
    sender: "admin" | "customer"
    senderAdminId: number | null
    message: string
    createdAt: string
}

export async function getSupportTicketMessages(id: number): Promise<{ messages: SupportTicketMessageDTO[] }> {
    const res = await fetchWithAuth(`/api/admin/support/${id}/messages`)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load conversation")
    return json
}

export async function sendSupportTicketReply(id: number, message: string) {
    const res = await fetchWithAuth(`/api/admin/support/${id}/messages`, { method: "POST", body: JSON.stringify({ message }) })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to send reply")
    clearClientCache()
    return json
}

export interface AnalyticsOverview {
    range: { key: string; days: number; since: string }
    kpis: {
        visitors: number
        sessions: number
        pageviews: number
        events: number
        bounceRate: number
        pagesPerSession: number
    }
    timeseries: { day: string; pageviews: number; visitors: number }[]
    topPages: { path: string; views: number }[]
    sources: { source: string; sessions: number }[]
    devices: { name: string; value: number }[]
    browsers: { name: string; value: number }[]
    os: { name: string; value: number }[]
    countries: { name: string; value: number }[]
    topEvents: { name: string; count: number }[]
    funnel: { visitors: number; checkoutStarted: number; purchases: number }
}

export async function getAnalyticsOverview(range: string): Promise<AnalyticsOverview> {
    const res = await fetchWithAuth(`/api/admin/analytics/overview?range=${encodeURIComponent(range)}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load analytics")
    return json
}

export interface CouponDTO {
    id: number
    code: string
    description: string | null
    discount_type: "percent" | "fixed"
    discount_value: number
    max_discount_cents: number | null
    currency: string | null
    min_order_cents: number
    max_redemptions: number | null
    times_redeemed: number
    per_customer_limit: number | null
    applicable_plan_ids: number[] | null
    valid_from: string | null
    valid_until: string | null
    is_active: boolean
    is_public: boolean
    created_at: string
    updated_at: string
}

export async function getAdminCoupons(): Promise<{ coupons: CouponDTO[] }> {
    const res = await fetchWithAuth("/api/admin/coupons")
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load coupons")
    return json
}

export async function createCoupon(data: Record<string, unknown>) {
    const res = await fetchWithAuth("/api/admin/coupons", { method: "POST", body: JSON.stringify(data) })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to create coupon")
    clearClientCache()
    return json
}

export async function updateCoupon(id: number, data: Record<string, unknown>) {
    const res = await fetchWithAuth(`/api/admin/coupons/${id}`, { method: "PATCH", body: JSON.stringify(data) })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to update coupon")
    clearClientCache()
    return json
}

export async function deleteCoupon(id: number) {
    const res = await fetchWithAuth(`/api/admin/coupons/${id}`, { method: "DELETE" })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to delete coupon")
    clearClientCache()
    return json
}

export interface CouponPreview {
    valid: boolean
    code: string
    subtotal_cents: number
    discount_cents: number
    total_cents: number
    currency: string
}

export interface OrderDTO {
    id: number
    plan: string | null
    plan_id: number | null
    plan_name: string | null
    amount_cents: number
    currency: string
    status: string
    payment_reference: string | null
    gateway_reference: string | null
    generated_license_key_id: number | null
    license_key: string | null
    customer_email: string | null
    customer_name: string | null
    created_at: string
    updated_at: string
    // Detail-only fields (populated by GET /api/admin/orders/[id])
    subtotal_cents?: number | null
    discount_cents?: number | null
    coupon_id?: number | null
    coupon_code?: string | null
    auto_renew?: boolean | null
    is_renewal?: boolean | null
    license_active?: boolean | null
    billing_type?: string | null
}

export interface OrdersPage {
    orders: OrderDTO[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
}

export async function getAdminOrders(params: { status?: string; search?: string; page?: number; limit?: number } = {}): Promise<OrdersPage> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const res = await fetchWithAuth(`/api/admin/orders?${qs.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load orders");
    return json;
}

export async function getAdminOrder(id: number): Promise<{ order: OrderDTO }> {
    const res = await fetchWithAuth(`/api/admin/orders/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load order");
    return json;
}

export async function refundOrder(id: number) {
    const res = await fetchWithAuth(`/api/admin/orders/${id}/refund`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Refund failed");
    clearClientCache();
    return json;
}

// ── Admin: customers (SuperAdmin) ──

export interface CustomerDTO {
    id: number
    email: string | null
    full_name: string | null
    company: string | null
    phone: string | null
    country_code: string | null
    is_active: boolean | null
    has_password: boolean
    order_count: number
    license_count: number
    created_at: string
}

export interface CustomersPage {
    customers: CustomerDTO[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
}

export async function getAdminCustomers(params: { status?: string; type?: string; search?: string; page?: number; limit?: number } = {}): Promise<CustomersPage> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.type) qs.set("type", params.type);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const res = await fetchWithAuth(`/api/admin/customers?${qs.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load customers");
    return json;
}

export interface CustomerOrderRow {
    id: number
    plan: string | null
    plan_name: string | null
    amount_cents: number
    currency: string
    status: string
    license_key: string | null
    created_at: string
}

export interface CustomerTicketRow {
    id: number
    ticket_id: string
    subject: string
    category: string | null
    status: string
    priority: string
    created_at: string
}

export interface CustomerDetail extends CustomerDTO {
    first_name: string | null
    last_name: string | null
    date_of_birth: string | null
}

export interface CustomerDetailResponse {
    customer: CustomerDetail
    orders: CustomerOrderRow[]
    licenses: Record<string, unknown>[]
    tickets: CustomerTicketRow[]
}

export async function getAdminCustomer(id: number): Promise<CustomerDetailResponse> {
    const res = await fetchWithAuth(`/api/admin/customers/${id}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load customer");
    return json;
}

export async function updateAdminCustomer(id: number, data: {
    full_name?: string | null
    company?: string | null
    phone?: string | null
    email?: string | null
    is_active?: boolean
}): Promise<CustomerDetailResponse> {
    const res = await fetchWithAuth(`/api/admin/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to update customer");
    clearClientCache();
    return json;
}

export async function deleteAdminCustomer(id: number) {
    const res = await fetchWithAuth(`/api/admin/customers/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to delete customer");
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

export async function updateLicenseExpiry(data: { id: number; expires_at: string | null }) {
    const res = await fetchWithAuth("/api/licenses", {
        method: "PATCH",
        body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
        throw new Error(json?.message || json?.error || "Failed to update license expiry");
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
    qc_result_count: number
}

export interface AutoQCComponentGrade {
    score: number
    grade: string
}

export interface AutoQCRun {
    id: number
    timestamp: string
    source: string
    app_version: string | null
    component_grades: Record<string, AutoQCComponentGrade>
    machine_identifier: string | null
    computer_name: string | null
    serial_number: string | null
    manufacturer: string | null
    model: string | null
}

export interface FreeTrialsPage {
    trials: AdminFreeTrialRow[]
    pagination: { page: number; limit: number; total: number; totalPages: number }
}

export async function getAdminFreeTrials(
    params: { search?: string; page?: number; limit?: number } = {}
): Promise<FreeTrialsPage> {
    const qs = new URLSearchParams()
    if (params.search) qs.set("search", params.search)
    if (params.page) qs.set("page", String(params.page))
    if (params.limit) qs.set("limit", String(params.limit))
    const q = qs.toString()
    // Admin list: not cached (like customers/orders) so refresh/search show fresh data.
    const res = await fetchWithAuth(`/api/admin/free-trials${q ? `?${q}` : ""}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || json?.message || "Failed to load free trials")
    return json
}

export async function getTrialMachineAutoQCRuns(
    machineSerial: string
): Promise<{ results: AutoQCRun[]; serial: string }> {
    const encoded = encodeURIComponent(machineSerial)
    const res = await fetchWithAuth(`/api/admin/free-trials/${encoded}/qc-results`)
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
    return res.json()
}

// ── App Releases (desktop auto-update) ──────────────────────────────────────────
export type ReleasePlatform = "windows" | "mac" | "linux" | "android" | "ios"
export type ReleaseChannel = "stable" | "beta"

export interface AppRelease {
    id: number
    platform: ReleasePlatform
    channel: ReleaseChannel
    version: string
    notes: string | null
    mandatory: boolean
    store_url: string | null
    file_name: string | null
    file_size: number | null
    content_type: string | null
    sha256: string | null
    is_published: boolean
    download_count: number
    created_by: number | null
    created_at: string
    published_at: string | null
}

export async function getReleases(): Promise<{ releases: AppRelease[] }> {
    const res = await fetchWithAuth("/api/admin/releases")
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
    return res.json()
}

/** Multipart upload — must NOT set Content-Type (the browser adds the boundary). */
export async function uploadRelease(form: FormData): Promise<AppRelease> {
    const token = localStorage.getItem("qc_token")
    const res = await fetch("/api/admin/releases", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Upload failed: ${res.status}`)
    }
    return res.json()
}

export async function updateRelease(
    id: number,
    patch: { isPublished?: boolean; mandatory?: boolean; notes?: string | null; storeUrl?: string | null }
): Promise<AppRelease> {
    const res = await fetchWithAuth(`/api/admin/releases/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
    return res.json()
}

export async function deleteRelease(id: number): Promise<void> {
    const res = await fetchWithAuth(`/api/admin/releases/${id}`, { method: "DELETE" })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
}

// ── SMS Providers (OTP delivery, e.g. MSG91) ────────────────────────────────────
export interface SmsProvider {
    id: number
    provider: string
    isActive: boolean
    config: Record<string, string>
    secretsPresent: Record<string, boolean>
    createdAt: string | null
    updatedAt: string | null
}

export async function getSmsProviders(): Promise<{ providers: SmsProvider[] }> {
    const res = await fetchWithAuth("/api/admin/sms/providers")
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
    return res.json()
}

export async function saveSmsProvider(
    provider: string,
    config: Record<string, string | undefined>,
    isActive: boolean
): Promise<void> {
    const res = await fetchWithAuth("/api/admin/sms/providers", {
        method: "POST",
        body: JSON.stringify({ provider, config, isActive }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
}

export async function activateSmsProvider(id: number): Promise<void> {
    const res = await fetchWithAuth(`/api/admin/sms/providers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ activate: true }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
}

export async function deleteSmsProvider(id: number): Promise<void> {
    const res = await fetchWithAuth(`/api/admin/sms/providers/${id}`, { method: "DELETE" })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
}

export async function sendTestSms(to: string, countryCode?: string): Promise<void> {
    const res = await fetchWithAuth("/api/admin/sms/test", {
        method: "POST",
        body: JSON.stringify({ to, countryCode }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.message || err?.error || `Request failed: ${res.status}`)
    }
}
