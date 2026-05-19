# User Roles & Access Control

> **Audience:** Admins, Sales, Onboarding teams  
> **Classification:** Internal

---

## Role Overview

Pramaan uses a **10-role access control system**. Roles determine what a user can see, create, and manage in the dashboard. Roles are assigned at account creation and can be changed by a user with appropriate permissions.

| Role | Display Name | Type |
|---|---|---|
| `SuperAdmin` | Gadget Guruz | Internal admin |
| `Employee` | Employee | Internal sales/demo |
| `Refurbisher` | Refurbisher | External partner |
| `Reseller` | Reseller | External partner |
| `Technician` | Technician | External end-user |
| `Enterprise` | Enterprise | External client |
| `OEM` | OEM | External partner |
| `Insurer` | Insurer | External partner |
| `Client` | Client | End user (limited) |
| `B2CDevice` | B2C Device | Restricted device session |

---

## Role Capability Matrix

| Capability | SuperAdmin | Employee | Refurbisher | Reseller | Technician | Enterprise | OEM | Insurer | Client | B2CDevice |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| View all QC results (platform-wide) | ✅ | ✅ | ✅ | ✅ | — | — | — | — | — | — |
| View own/team QC results | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Submit QC results (API) | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Manage users (create/edit) | ✅ | — | ✅¹ | ✅² | — | ✅³ | ✅³ | ✅³ | — | — |
| Manage machines | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | — |
| View fleet / groups | ✅ | — | — | ✅ | — | ✅ | ✅ | ✅ | — | — |
| View machine history alerts | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | — |
| Manage license keys | ✅ | ✅⁴ | ✅ | ✅ | — | — | — | — | — | — |
| View free trials (admin) | ✅ | — | — | — | — | — | — | — | — | — |
| View user statistics | ✅ | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | — |
| Access customer portal | — | — | — | — | — | — | — | — | ✅ | — |
| Platform-wide settings | ✅ | — | — | — | — | — | — | — | — | — |

**Notes:**
- ¹ Refurbishers can create/manage Technicians only
- ² Resellers can create/manage Technicians and Clients
- ³ Enterprise/OEM/Insurer can create/manage Technicians within their organization
- ⁴ Employees can create **demo license keys only**

---

## Role Descriptions

### SuperAdmin — `Gadget Guruz`
Full system access. Can see all data across all users and organizations. Manages the platform, creates accounts for Refurbishers and Enterprise clients, and can view free trial administration.

**Who has this role:** Gadget Guruz internal team only.

---

### Employee
Internal Gadget Guruz sales/demo user. Has read access to QC results for demo purposes and can generate **demo license keys** only. Cannot manage other users.

**Who has this role:** GG sales and pre-sales staff.

---

### Refurbisher
A bulk refurbisher or reseller who manages a team of QC technicians. Can see all results submitted by their technicians, manage their team, and generate license keys.

**Who has this role:** B2B refurbishment partners, large reseller organizations.

---

### Reseller
A reseller with full team management capability. Can create both Technicians (internal staff) and Clients (end buyers). Has fleet management access.

**Who has this role:** Laptop resellers with both a technical team and end-buyer clients.

---

### Technician
The primary QC operator. Uses the Pramaan CLI or Windows app to run tests on devices. Can view results for devices they've tested. Cannot manage users or machines.

**Who has this role:** QC lab technicians, refurbishment floor staff.

---

### Enterprise
An IT fleet manager who tracks company-owned devices over time. Manages machine groups, views health timelines, and receives degradation alerts. Can create Technician sub-accounts.

**Who has this role:** Corporate IT departments, large-scale device fleet owners.

---

### OEM
An OEM partner with access equivalent to Enterprise fleet management. Used for OEM-level hardware partnerships.

---

### Insurer
An insurance partner with fleet management access. Used to enable insurers to track device health for underwriting purposes.

---

### Client
A buyer or end customer with **limited access** to results specifically shared with them by a Reseller. Can view assigned machines and certificates. Cannot submit tests.

**Who has this role:** End customers of resellers, individual device buyers.

---

### B2CDevice
A restricted device session used when a consumer activates a B2C license on their own device. This is a programmatic session role, not a human user role.

---

## Who Can Create Which Roles

| Creator | Can Create |
|---|---|
| SuperAdmin | Any role |
| Refurbisher | Technician |
| Reseller | Technician, Client |
| Enterprise | Technician |
| OEM | Technician |
| Insurer | Technician |
| All others | Cannot create users |

---

## Dashboard Views by Role

The dashboard adapts its displayed information based on the logged-in user's role:

| Dashboard Element | Who Sees It |
|---|---|
| "Total QC Tests" counter | Admins, Refurbishers, Resellers, Employees |
| "My QC Tests" counter | Technicians, Enterprise, OEM, Insurer, Client |
| "Systems with Issues" card | All roles |
| "Team Members" card | Admins, Refurbishers, Resellers, Enterprise |
| "Degradation Alerts" | All roles |
| "Add User" quick action | Admins, Refurbishers, Resellers, Enterprise |
| "Manage Machines" | Admins, Refurbishers, Resellers, Enterprise |

---

*← Back to [Documentation Index](../README.md)*
