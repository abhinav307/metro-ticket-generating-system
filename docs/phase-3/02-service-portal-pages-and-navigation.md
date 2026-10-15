# Service Portal Pages & Navigation Architecture
## Metro Ticket Generating System in ServiceNow (MTTS)

---

## 1. Overview & Portal Information Architecture

The passenger experience for the Metro Ticket Generating System is hosted within the ServiceNow Service Portal framework under the application scope `x_mtts`. The user interface is purpose-built to resemble a contemporary municipal rapid transit self-service portal rather than a standard corporate IT service desk.

The core navigation journey is strictly deterministic:
$$\mathbf{Portal\ Homepage\ (/metro)} \longrightarrow \mathbf{Catalog\ Item} \longrightarrow \mathbf{Booking\ Confirmation} \longrightarrow \mathbf{My\ Bookings} \longrightarrow \mathbf{Digital\ QR\ Pass}$$

---

## 2. Portal Page Specifications

### 2.1 Metro Portal Homepage (`/metro`)
- **Metadata File:** [`sn_source/service_portal/pages/sp_page_metro_home.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/service_portal/pages/sp_page_metro_home.json)
- **URL Path:** `/metro` or `?id=metro`
- **Page Title:** Metro Ticket Booking — MetroRail Express
- **Access Roles:** `x_mtts.user`, `snc_internal`
- **Layout Structure:**
  - **Row 1 (Order 1, 12 cols):** `widget_metro_portal_header`
  - **Row 2 (Order 2, 12 cols):** `widget_metro_portal_hero`
- **Functional Capabilities:**
  - Fast branding bar with active passenger greeting and active ticket counter badge.
  - Hero banner with prominent primary CTA ("Book Metro Ticket") and secondary CTA ("View My Bookings").
  - Real-time transit network metrics (Active stations, transit lines, base fare start price).
  - 5-step visual workflow explanation ("How Metro Ticketing Works").
  - Network overview card with interactive line badges for Red Line, Blue Line, and Central Square Interchange.

### 2.2 My Bookings & Tickets Page (`/my-metro-bookings`)
- **Metadata File:** [`sn_source/service_portal/pages/sp_page_my_metro_bookings.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/service_portal/pages/sp_page_my_metro_bookings.json)
- **URL Path:** `/my-metro-bookings` or `?id=my_metro_bookings`
- **Page Title:** My Metro Bookings & Tickets
- **Access Roles:** `x_mtts.user`, `snc_internal`
- **Layout Structure:**
  - **Row 1 (Order 1, 12 cols):** `widget_metro_portal_header`
  - **Row 2 (Order 2, 12 cols):** `widget_my_metro_bookings`
- **Functional Capabilities:**
  - Comprehensive ticket card grid displaying active and historic journeys.
  - Real-time instant text search (matches `booking_reference`, `ticket_number`, and station names).
  - One-click status filter buttons (`All`, `Tickets Ready`, `Pending`, `Approved`, `Cancelled`).
  - Interactive "View QR Ticket" / "View Details" modal launcher.
  - Policy-gated "Cancel Booking" action launcher.
  - Zero-ticket empty state with direct booking link.

### 2.3 Booking Confirmation Page (`/metro-confirmation`)
- **Metadata File:** [`sn_source/service_portal/pages/sp_page_booking_confirmation.json`](file:///c:/Users/unkno/Downloads/a%20b%20c/Safe%20image/service%20now%20metro%20ticket%20generation/sn_source/service_portal/pages/sp_page_booking_confirmation.json)
- **URL Path:** `/metro-confirmation` or `?id=metro_confirmation`
- **Page Title:** Booking Confirmation — Metro Ticket
- **Access Roles:** `x_mtts.user`, `snc_internal`
- **Layout Structure:**
  - **Row 1 (Order 1, 12 cols):** `widget_metro_portal_header`
  - **Row 2 (Order 2, 12 cols):** `widget_metro_confirmation`
- **Functional Capabilities:**
  - Clear "Pending Supervisor Approval" badge.
  - Prominently displays authoritative booking reference (`BKG-YYYYMMDD-XXXX`).
  - Authoritative financial snapshot breakdown (origin, destination, travel date, ticket type, passenger count, total fare).
  - Explicit advisory note confirming that turnstile QR codes are only issued after administrative approval.
  - Direct navigation button to "View My Bookings".

---

## 3. Navigation Matrix & Suffix Routing

```
                       ┌───────────────────────────────┐
                       │     Portal Header Widget      │
                       │   🚇 MetroRail Express        │
                       └──────────────┬────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │ (Home)                     │ (Book Ticket)              │ (My Bookings)
         ▼                            ▼                            ▼
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  /metro Page     │         │ Catalog Item     │         │ /my-metro-       │
│  - Hero Banner   │────────►│ Metro Ticket     │         │ bookings Page    │
│  - Metrics       │ (Book)  │ Booking          │         │ - Card Grid      │
│  - 5-Step Flow   │         └────────┬─────────┘         │ - Search/Filter  │
│  - Network Map   │                  │ (Submit Order)    │ - QR Pass Modal  │
└──────────────────┘                  ▼                   │ - Cancel Modal   │
                             ┌──────────────────┐         └────────▲─────────┘
                             │ /metro-          │                  │
                             │ confirmation     │──────────────────┘
                             │ - Ref # & Status │ (View My Bookings)
                             └──────────────────┘
```

---

## 4. UI/UX Design System & Color Palette

The interface follows a unified, accessible color system compliant with WCAG 2.1 AA standards:

| Semantic Purpose | Token Name | Hex Code | Usage |
| :--- | :--- | :--- | :--- |
| **Brand Primary** | `$metro-primary` | `#1A365D` | Header bar, primary typography, dark accents |
| **Action Accent** | `$metro-accent` | `#3182CE` | Primary CTA buttons, active tabs, hover states |
| **Transit Red** | `$metro-red` | `#E53E3E` | Red Line badge, cancellation warnings, badges |
| **Transit Blue** | `$metro-blue` | `#2B6CB0` | Blue Line badge, route arrows, fare highlights |
| **Transit Hub** | `$metro-purple`| `#805AD5` | Central Square interchange hub indicator |
| **Status Generated**| `$status-green` | `#DEF7EC` / `#03543F`| "Ticket Ready" badge, boarding pass header |
| **Status Pending** | `$status-amber` | `#FEF08A` / `#713F12`| "Pending Approval" pill, submission banner |
| **Status Approved**| `$status-blue`  | `#EBF8FF` / `#2B6CB0`| "Approved" pill |
| **Status Cancelled**| `$status-red`  | `#FEE2E2` / `#991B1B`| "Cancelled" pill, cancellation modal |
| **Surface Background**| `$bg-page`   | `#F7FAFC` | Main viewport canvas, subtle card backgrounds |
| **Surface Card** | `$bg-card`       | `#FFFFFF` | Form containers, ticket cards, modals |

---

## 5. Responsive Breakpoint Standards

- **Mobile Viewports (< 768px):** Header collapses navigation links into a touch-friendly stack. Booking cards stack fields into a 1-column layout. QR modal scales SVG to 100% of modal width (max 200px) with touch-dismissible buttons.
- **Tablet Viewports (768px – 1024px):** 2-column card grid, horizontally scrolling filter pills.
- **Desktop Viewports (> 1024px):** Max container width bounded to `1200px` centered with generous breathing margins.
