# Metro Ticket Generating System in ServiceNow
## Phase 1 Deliverable: Visual Architecture & Process Diagrams

| Document Metadata | Value |
| :--- | :--- |
| **Document ID** | MTTS-DOC-14 |
| **Project Name** | Metro Ticket Generating System in ServiceNow |
| **Current Phase** | Phase 1: Requirement Analysis & Project Planning |
| **Author / Role** | ServiceNow Principal Solution Architect & Visual Modeler |
| **Status** | Phase 1 Blueprint Complete (Pending Stakeholder Sign-Off) |

---

### 1. High-Level Multi-Tier System Architecture

```mermaid
flowchart TD
    subgraph ClientTier ["Commuter Presentation Tier (Service Portal / ESC)"]
        SP_Home["Metro Portal (/metro)"]
        SP_CatItem["Catalog Item: Metro Ticket Booking"]
        SP_Summary["Dynamic Fare Summary Card Widget"]
        SP_Bookings["My Bookings & History Widget"]
        SP_TicketModal["Digital QR Ticket Modal Card (qrcode.min.js)"]
    end

    subgraph LogicTier ["ServiceNow Application & Automation Tier (Scope: x_mtts)"]
        AJAX_Calc["GlideAjax Client Endpoint\n(MetroFareCalculatorClient)"]
        Script_Calc["Authoritative Pricing Engine\n(MetroFareCalculator)"]
        Script_Num["Daily Number Generator\n(MetroNumberFormatter - Phase 2 concurrency spike)"]
        Script_Fulfill["Fulfillment Orchestrator\n(MetroTicketGenerator)"]
        Script_QR["QR Token & SVG Engine\n(MetroQRGenerator - Phase 2 Spike)"]
        Flow_Fulfillment["Flow Designer Orchestrator\n(Service Catalog trigger for Metro Ticket Booking only)"]
        BR_PreInsert["Booking Create / Before-Insert Validation\n(Recalculate fare server-side)"]
    end

    subgraph DataTier ["ServiceNow Database Tier"]
        T_ReqItem[("sc_req_item\n(Catalog Request Item - Extends Task)")]
        T_Approval[("sysapproval_approver\n(Manager Approvals on sc_req_item)")]
        T_Station[("x_mtts_station\n(Station Master)")]
        T_Route[("x_mtts_route\n(Route Distances)")]
        T_FareRule[("x_mtts_fare_rule\n(Tariffs & Rules)")]
        T_TicketType[("x_mtts_ticket_type\n(Ticket Types)")]
        T_Booking[("x_mtts_booking_ticket\n(Custom Booking & Snapshots)")]
        T_Seq[("x_mtts_daily_sequence\n(Proposed Daily Sequence Counter; Phase 2 validation)")]
        T_Attach[("sys_attachment\n(QR Graphic Assets)")]
    end

    subgraph OutboundTier ["Notification & Channel Tier"]
        Notif_Engine["ServiceNow Email Engine (sys_email)"]
        Commuter_Email["HTML Outbound Ticket Email (Embedded CID QR)"]
    end

    SP_CatItem -->|OnChange GlideAjax| AJAX_Calc
    AJAX_Calc --> Script_Calc
    Script_Calc --> T_Route
    Script_Calc --> T_FareRule
    Script_Calc -.->|Returns Preview JSON| SP_Summary
    
    SP_CatItem -->|Cart Submit| T_ReqItem
    T_ReqItem -->|Trigger only for Metro Ticket Booking item| Flow_Fulfillment
    Flow_Fulfillment -->|Validate variables and create one linked booking| BR_PreInsert
    BR_PreInsert --> Script_Calc
    BR_PreInsert --> T_Booking
    Flow_Fulfillment --> T_Approval
    T_Approval -->|Approved| Flow_Fulfillment
    Flow_Fulfillment -->|Set Status 'Approved'| T_Booking
    Flow_Fulfillment --> Script_Fulfill
    
    Script_Fulfill --> Script_Num
    Script_Num --> T_Seq
    Script_Fulfill --> Script_QR
    Script_QR --> T_Attach
    Script_Fulfill -->|Commit Ticket No & Token| T_Booking
    
    Flow_Fulfillment --> Notif_Engine
    Notif_Engine --> Commuter_Email
    
    SP_Bookings -->|Read Own Bookings| T_Booking
    SP_TicketModal -->|Read QR Asset| T_Attach
```

---

### 2. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    METRO_STATION ||--o{ METRO_ROUTE : "originates"
    METRO_STATION ||--o{ METRO_ROUTE : "terminates"
    METRO_STATION ||--o{ METRO_BOOKING : "source_station"
    METRO_STATION ||--o{ METRO_BOOKING : "dest_station"
    
    METRO_TICKET_TYPE ||--o{ METRO_FARE_RULE : "governs"
    METRO_TICKET_TYPE ||--o{ METRO_BOOKING : "classifies"
    
    SC_REQ_ITEM ||--|| METRO_BOOKING : "originates_custom_record"
    SC_REQ_ITEM ||--o{ SYSAPPROVAL_APPROVER : "anchors_platform_approval"
    METRO_BOOKING ||--o{ SYS_ATTACHMENT : "stores_qr_code"
    SYS_USER ||--o{ METRO_BOOKING : "passenger"

    METRO_STATION {
        string station_code PK "Unique Station Code"
        string name "Display Name"
        string line_zone "Transit Line / Zone"
        boolean active "Active Flag"
    }

    METRO_ROUTE {
        string route_id PK "Unique Route ID"
        reference origin_station FK "Source Station"
        reference destination_station FK "Destination Station"
        decimal distance_km "Distance in Kilometers"
        boolean active "Active Flag"
    }

    METRO_TICKET_TYPE {
        string code PK "Identifier (SINGLE, RETURN, PASS)"
        string name "Display Name"
        string pricing_model "Distance_Based or Fixed"
        integer validity_hours "Optional; policy pending"
        boolean active "Active Flag"
    }

    METRO_FARE_RULE {
        string rule_id PK "Unique Rule Identifier"
        reference ticket_type FK "Ticket Classification"
        currency rate_per_km "Rate / km"
        currency minimum_fare "Minimum Fare"
        decimal return_multiplier "Return Multiplier"
        currency fixed_fare "Fixed Pass Fare"
        date effective_start "Start Date"
        date effective_end "End Date"
        boolean active "Active Flag"
    }

    METRO_BOOKING {
        string booking_reference PK "Booking Reference"
        string ticket_number UK "Unique Ticket Number"
        reference passenger FK "sys_user"
        reference request_item FK "sc_req_item (Parent)"
        reference source_station FK "Origin Station"
        reference destination_station FK "Destination Station"
        reference ticket_type FK "Ticket Type"
        date travel_date "Date of Travel"
        integer passenger_count "Commuter Count (1-6)"
        decimal calculated_distance "Snapshot Distance (0.00 means not used for fixed-fare Pass)"
        currency unit_fare "Snapshot Unit Fare"
        currency total_fare "Snapshot Total Fare"
        string status "Lifecycle Status"
        string qr_token_hash "Verification Token"
        string qr_payload "JSON Payload"
        reference qr_attachment FK "sys_attachment"
        datetime generation_time "Generated Time"
        datetime cancellation_time "Cancelled Time"
        string cancellation_reason "Reason"
        currency refund_amount "Calculated Refund"
    }

    DAILY_SEQUENCE {
        string date_key PK "Unique YYYYMMDD key"
        integer last_sequence "Last allocated value"
        string allocation_status "Ready / RetryRequired / Exhausted"
    }

```

---

### 3. End-to-End Booking Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Commuter as Passenger (Browser)
    participant Portal as Service Portal / Catalog
    participant AJAX as GlideAjax (MetroFareCalculatorClient)
    participant Engine as Script Include (MetroFareCalculator)
    participant DB as ServiceNow Database
    participant Flow as Flow Designer Runtime
    actor Approver as Station Approver
    participant Fulfill as Fulfillment (MetroTicketGenerator)
    participant Notif as Notification Engine (sys_email)

    Commuter->>Portal: Selects Origin, Destination, Type, Date, Pax Count
    Portal->>AJAX: calculateFare(src, dst, type, date, pax)
    AJAX->>Engine: resolveRouteAndPricing(...)
    Engine->>DB: Query active route & fare rule
    DB-->>Engine: Returns distance_km & pricing rule
    Engine->>Engine: Computes Unit Fare & Total Fare
    Engine-->>AJAX: Returns JSON {distance, unitFare, totalFare}
    AJAX-->>Portal: Asynchronous callback
    Portal->>Commuter: Renders Dynamic Fare Summary Card

    Commuter->>Portal: Clicks "Submit Booking"
    Portal->>DB: Submits Metro Ticket Booking catalog item; sc_req_item is created
    DB-->>Portal: Confirms insert (BKG-YYYYMMDD-XXXX)
    Portal->>Commuter: Displays Confirmation Page with Booking Ref

    DB->>Flow: Starts catalog-specific flow for Metro Ticket Booking
    Flow->>DB: Validates variables and creates one linked booking (status=Pending)
    Flow->>Notif: Dispatches NOTIF-01 ("Booking Submitted")
    Notif-->>Commuter: Sends submission receipt email
    Flow->>DB: After booking exists, creates sysapproval_approver on sc_req_item
    Flow->>Notif: Dispatches NOTIF-02 ("Approval Required")
    Notif-->>Approver: Sends approval request email / portal notification

    Approver->>DB: Reviews & Approves task on sc_req_item
    DB->>Flow: Resumes Flow on sc_req_item approved
    Flow->>DB: Updates x_mtts_booking_ticket.status = 'Approved'
    Flow->>Fulfill: Executes generateTicket(booking_id)
    Fulfill->>DB: Requests next sequence from validated allocator (TKT-YYYYMMDD-XXXXXX; concurrency proof required)
    Fulfill->>Fulfill: Generates secure random verifier token; stores token hash and zero-PII QR artifact (Phase 2 spike)
    Fulfill->>DB: Saves QR SVG to sys_attachment
    Fulfill->>DB: Updates status='Generated', stores ticket_number, token hash & qr_attachment
    Flow->>Notif: Dispatches NOTIF-04 ("Digital Ticket Generated")
    Notif-->>Commuter: Outbound HTML email with embedded QR Ticket

    Commuter->>Portal: Navigates to "My Bookings"
    Portal->>DB: Retrieves commuter's active ticket
    Portal->>Commuter: Renders active scannable Digital Ticket Card
```

---

### 4. Lifecycle State Machine Diagram

```mermaid
stateDiagram-v2
    [*] --> Pending : Commuter submits catalog booking form
    
    state "Pending Approval" as Pending {
        [*] --> AwaitingApproverOnRITM
        AwaitingApproverOnRITM --> EscalationCheck : 4hr SLA Timer
        EscalationCheck --> AwaitingApproverOnRITM : Escalated to Admin
    }

    state "Approved" as Approved {
        [*] --> QueueFulfillment
        QueueFulfillment --> AllocateDailySequence
        AllocateDailySequence --> GenerateQRToken
        GenerateQRToken --> AttachSVG
        AttachSVG --> ExceptionCheck
        ExceptionCheck --> QueueFulfillment : Retry Attempt (Max 3)
    }

    state "Generated" as Generated {
        [*] --> ActiveForTravel
        ActiveForTravel --> Completed : Travel Window Passes
    }

    state "Cancelled" as Cancelled {
        [*] --> InvalidateByStatus
        InvalidateByStatus --> CalculateRefund
    }

    state "Rejected (Proposed - Pending Sign-Off)" as Rejected {
        [*] --> CaptureComments
        CaptureComments --> NotifyCommuter
    }

    Pending --> Approved : Approver Approves on sc_req_item
    Pending --> Rejected : Approver Rejects on sc_req_item (Proposed)
    Pending --> Cancelled : Commuter Cancels Prior to Approval
    
    Approved --> Generated : Fulfillment Completes Successfully
    Approved --> Approved : Fulfillment Failure (Retries without Cancelling)
    
    Generated --> Cancelled : Commuter Self-Service Cancel (Before Travel Date)
    
    Generated --> [*]
    Cancelled --> [*]
    Rejected --> [*]
```

---

### 5. Self-Service Cancellation & Token Revocation Flowchart

```mermaid
flowchart TD
    Start(["Commuter clicks 'Request Cancellation' in My Bookings"]) --> CheckAuth{"Is current user == record.passenger?"}
    
    CheckAuth -->|No (IDOR Attempt)| Deny403["Throw HTTP 403 Forbidden\nLog Security Audit Alert"]
    CheckAuth -->|Yes| CheckState{"Is status == 'Pending' or 'Generated'?"}
    
    CheckState -->|No (Already Cancelled/Closed)| ErrState["Alert: Booking cannot be cancelled in current state"]
    CheckState -->|Yes| CheckTime{"Is travel_date in the future?"}
    
    CheckTime -->|No (Past Date)| ErrPast["Alert: Cannot cancel ticket after scheduled travel date"]
    CheckTime -->|Yes| PromptReason["Prompt commuter for cancellation reason"]
    
    PromptReason --> ConfirmCancel["Commuter confirms cancellation dialog"]
    ConfirmCancel --> CalcRefund["Compute refund from configurable policy properties\n(x_mtts.cancellation_tier...)"]
    
    CalcRefund --> StatusCheck["Verifier checks authoritative booking status\nReject unless status == Generated; token hash unchanged"]
    StatusCheck --> UpdateDB["Update x_mtts_booking_ticket:\nstatus = 'Cancelled'\nrefund_amount = calculated_value"]
    
    UpdateDB --> DispatchNotif["Trigger Notification Engine: NOTIF-06\n(Cancellation & Refund Confirmation Email)"]
    DispatchNotif --> End(["Display cancellation confirmation banner in Portal"])
```
