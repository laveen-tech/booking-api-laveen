# 📐 Architecture & Database Schema Diagrams

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATIONS                      │
│          (Admin Panel, Mobile App, Web Frontend)            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP/HTTPS
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    EXPRESS.JS SERVER                         │
│                    (Node.js Runtime)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Middleware Layer                        │  │
│  │  - CORS                                              │  │
│  │  - JSON Parser                                       │  │
│  │  - Morgan (Logging)                                  │  │
│  │  - JWT Authentication                                │  │
│  │  - Role-Based Authorization                          │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Routes Layer                            │  │
│  │  /api/auth/*      - Authentication                   │  │
│  │  /api/admin/*     - Admin Operations                 │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Controllers Layer                         │  │
│  │  - authController    (register, login, profile)      │  │
│  │  - adminController   (users, vendors, verification)  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ pg (node-postgres)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   POSTGRESQL DATABASE                        │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │   Users     │  │ User Profiles│  │ Vendor Shops    │   │
│  │   (Auth)    │  │  (Dynamic)   │  │   (Details)     │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Bookings   │  │   Services   │  │ Vendor Metrics  │   │
│  │             │  │              │  │   (Analytics)   │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## 📊 Database Schema - Core Tables

### User Management

```
┌─────────────────────────────────────────────────────────────┐
│                          USERS                               │
│  (Constant/Rarely Changed Data)                             │
├──────────────────────────────────────────────────────────────┤
│  • user_id (PK)                                             │
│  • phone_number (UNIQUE) ⚡                                 │
│  • email (UNIQUE)                                           │
│  • password_hash                                            │
│  • user_type (CUSTOMER/VENDOR/ADMIN/SUPERADMIN)            │
│  • phone_verified                                           │
│  • status                                                    │
│  • created_at                                               │
│  • created_by (FK → users)                                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ One to Many
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    USER_PROFILES                             │
│  (Updatable Data - Profile Versioning)                      │
├──────────────────────────────────────────────────────────────┤
│  • profile_id (PK)                                          │
│  • user_id (FK)                                             │
│  • name                                                      │
│  • city, state, gender                                      │
│  • profile_picture                                          │
│  • device_id, fcm_token                                     │
│  • last_login_at                                            │
│  • is_current ⭐                                            │
│  • created_at, updated_at                                   │
└──────────────────────────────────────────────────────────────┘
```

### Vendor Management

```
┌─────────────────────────────────────────────────────────────┐
│                  VENDOR_SHOP_DETAILS                         │
│  (Static Shop Information)                                  │
├──────────────────────────────────────────────────────────────┤
│  • shop_id (PK)                                             │
│  • user_id (FK → users, UNIQUE)                             │
│  • shop_name, shop_address                                  │
│  • city, state                                              │
│  • latitude, longitude                                      │
│  • open_time, close_time                                    │
│  • break_start_time, break_end_time                         │
│  • weekly_holiday                                           │
│  • no_of_seats, no_of_workers                               │
│  • verification_status ⚡ (pending/approved/rejected)       │
│  • admin_comments                                           │
│  • verified_by (FK → users)                                 │
│  • verified_at                                              │
│  • business_license, tax_number                             │
│  • bank_account_number, bank_ifsc_code                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ One to One
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   VENDOR_METRICS                             │
│  (Frequently Updated Analytics)                             │
├──────────────────────────────────────────────────────────────┤
│  • metric_id (PK)                                           │
│  • vendor_id (FK → users, UNIQUE)                           │
│  • total_bookings                                           │
│  • completed_bookings                                       │
│  • cancelled_bookings                                       │
│  • total_revenue                                            │
│  • average_rating ⭐                                        │
│  • total_reviews                                            │
│  • last_booking_date                                        │
│  • updated_at                                               │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  VENDOR_DOCUMENTS                            │
│  (Unified Documents Table)                                  │
├──────────────────────────────────────────────────────────────┤
│  • document_id (PK)                                         │
│  • vendor_id (FK → users)                                   │
│  • document_url                                             │
│  • document_type (shop_image/license/tax_cert/id_proof)    │
│  • is_primary                                               │
│  • verification_status (pending/approved/rejected)          │
│  • admin_comments                                           │
└──────────────────────────────────────────────────────────────┘
```

### Services & Bookings

```
┌─────────────────────────────────────────────────────────────┐
│                   SERVICES_MASTER                            │
├──────────────────────────────────────────────────────────────┤
│  • service_id (PK)                                          │
│  • service_name (UNIQUE)                                    │
│  • service_description                                      │
│  • default_duration_minutes                                 │
│  • service_type (normal/premium)                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Many to Many
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   VENDOR_SERVICES                            │
├──────────────────────────────────────────────────────────────┤
│  • vendor_service_id (PK)                                   │
│  • vendor_id (FK → users)                                   │
│  • service_id (FK → services_master)                        │
│  • price                                                     │
│  • is_available                                             │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       BOOKINGS                               │
├──────────────────────────────────────────────────────────────┤
│  • booking_id (PK)                                          │
│  • user_id (FK → users)                                     │
│  • vendor_id (FK → users)                                   │
│  • booking_date                                             │
│  • total_amount                                             │
│  • payment_method, payment_status                           │
│  • booking_status                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ One to Many
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                  BOOKING_SERVICES                            │
├──────────────────────────────────────────────────────────────┤
│  • booking_service_id (PK)                                  │
│  • booking_id (FK → bookings)                               │
│  • service_id (FK → services_master)                        │
│  • service_name, service_price                              │
│  • start_time, end_time, duration_minutes                   │
└──────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       REVIEWS                                │
├──────────────────────────────────────────────────────────────┤
│  • review_id (PK)                                           │
│  • booking_id (FK → bookings, UNIQUE)                       │
│  • user_id (FK → users)                                     │
│  • vendor_id (FK → users)                                   │
│  • rating (1-5)                                             │
│  • review_text                                              │
└──────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow Diagrams

### User Registration Flow

```
Client                Server              Database
  │                      │                    │
  │──Register Request───>│                    │
  │  (phone, password)   │                    │
  │                      │──Check Existing───>│
  │                      │<──No Duplicate─────│
  │                      │                    │
  │                      │──Hash Password     │
  │                      │                    │
  │                      │──BEGIN TRANSACTION>│
  │                      │──Insert User──────>│
  │                      │──Insert Profile───>│
  │                      │──COMMIT───────────>│
  │                      │                    │
  │                      │──Generate JWT      │
  │<─Success + Token────│                    │
```

### Admin Vendor Verification Flow

```
Admin                 Server              Database
  │                      │                    │
  │──Verify Request─────>│                    │
  │  (vendor_id, status) │                    │
  │                      │──Check Auth────────│
  │                      │  (is Admin?)       │
  │                      │                    │
  │                      │──Update Shop──────>│
  │                      │  verification      │
  │                      │  verified_by       │
  │                      │  verified_at       │
  │                      │                    │
  │<─Success Response───│<──Updated──────────│
```

### Profile Update with Versioning Flow

```
User                  Server              Database
  │                      │                    │
  │──Update Profile─────>│                    │
  │  (new data)          │                    │
  │                      │──BEGIN TRANSACTION>│
  │                      │                    │
  │                      │──Mark Current      │
  │                      │  as Not Current───>│
  │                      │                    │
  │                      │──Insert New        │
  │                      │  Profile Version──>│
  │                      │  (is_current=true) │
  │                      │                    │
  │                      │──COMMIT───────────>│
  │<─Success────────────│                    │
```

## 🔐 Authentication & Authorization Flow

```
┌────────────────────────────────────────────────────────────┐
│                    API REQUEST                              │
└───────────────────────┬────────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │  Has Authorization    │
            │     Header?           │
            └───────┬───────┬───────┘
                    │       │
                 NO │       │ YES
                    │       │
                    ▼       ▼
            ┌──────────┐  ┌─────────────────┐
            │  Return  │  │  Verify JWT     │
            │   401    │  │     Token       │
            └──────────┘  └────────┬────────┘
                                   │
                          ┌────────┴────────┐
                          │  Token Valid?   │
                          └────┬────────┬───┘
                               │        │
                            NO │        │ YES
                               │        │
                               ▼        ▼
                        ┌──────────┐  ┌──────────────────┐
                        │  Return  │  │  Check User Type │
                        │   401    │  │   & Status       │
                        └──────────┘  └────────┬─────────┘
                                               │
                                      ┌────────┴────────┐
                                      │  Has Required   │
                                      │    Role?        │
                                      └────┬────────┬───┘
                                           │        │
                                        NO │        │ YES
                                           │        │
                                           ▼        ▼
                                    ┌──────────┐  ┌──────────┐
                                    │  Return  │  │ Process  │
                                    │   403    │  │ Request  │
                                    └──────────┘  └──────────┘
```

## 📈 Key Relationships

```
USERS (Parent)
  │
  ├──> USER_PROFILES (1:N - Versioning)
  │
  ├──> VENDOR_SHOP_DETAILS (1:1 - Only for VENDOR type)
  │     │
  │     ├──> VENDOR_DOCUMENTS (1:N)
  │     ├──> VENDOR_SERVICES (1:N)
  │     └──> VENDOR_METRICS (1:1)
  │
  ├──> BOOKINGS (1:N - As Customer)
  ├──> BOOKINGS (1:N - As Vendor)
  │
  └──> REVIEWS (1:N)

SERVICES_MASTER
  │
  ├──> VENDOR_SERVICES (1:N)
  └──> BOOKING_SERVICES (1:N)

BOOKINGS
  │
  ├──> BOOKING_SERVICES (1:N)
  └──> REVIEWS (1:1)
```

## 🎯 Indexing Strategy

```
High Priority Indexes (Already Created):
  • users.phone_number (UNIQUE)
  • users.email (UNIQUE)
  • users.user_type
  • user_profiles(user_id, is_current)
  • vendor_shop_details.verification_status
  • vendor_documents.vendor_id
  • bookings.vendor_id
  • bookings.booking_date
  • reviews.vendor_id
```

## 💡 Design Decisions

### ✅ Separated User Tables
- **users**: Constant data, rarely updated
- **user_profiles**: Dynamic data, versioned (is_current flag)
- **Benefit**: Clean separation, audit trail, better performance

### ✅ Vendor Metrics Separation
- **vendor_shop_details**: Static shop info
- **vendor_metrics**: Calculated/aggregated data
- **Benefit**: Optimized updates, easier analytics

### ✅ Unified Documents
- **vendor_documents**: All documents in one table
- **Benefit**: Consistent verification, simpler queries

### ✅ Role Hierarchy
- SUPERADMIN > ADMIN > VENDOR > CUSTOMER
- **Benefit**: Clear permissions, scalable

---

**Legend:**
- PK = Primary Key
- FK = Foreign Key
- ⚡ = Important/Indexed Field
- ⭐ = New/Improved Field
- (1:1) = One-to-One
- (1:N) = One-to-Many
- (N:M) = Many-to-Many
