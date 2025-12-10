# Booking Management System API

A comprehensive Node.js REST API for managing bookings, vendors, and users with admin panel support.

## 🚀 Features

### Improved Database Schema
- **Separated User Tables**: `users` table for constant data, `user_profiles` for updatable data (one-to-many)
- **User Types**: CUSTOMER, VENDOR, ADMIN, SUPERADMIN
- **Vendor Metrics**: Separate table for tracking bookings, revenue, ratings
- **Unified Documents**: Single `vendor_documents` table for all vendor documents

### API Features
- ✅ JWT Authentication
- ✅ Role-based access control (RBAC)
- ✅ User Management
- ✅ Vendor Management & Verification
- ✅ Admin Creation (SUPERADMIN only)
- ✅ Document Verification
- ✅ Dashboard Statistics
- ✅ Profile Management with versioning

## 📋 Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## 🛠️ Installation

### 1. Clone the repository
```bash
cd booking-api
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup Database

Create a PostgreSQL database:
```sql
CREATE DATABASE booking_db;
```

Run the schema file:
```bash
psql -U postgres -d booking_db -f database/schema.sql
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Update the `.env` file with your configuration:
```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=booking_db
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=7d

CORS_ORIGIN=http://localhost:3000
```

### 5. Create Initial SUPERADMIN

You need to manually create the first SUPERADMIN user. Update the schema.sql file with a hashed password:

Generate a hashed password:
```javascript
const bcrypt = require('bcryptjs');
const password = 'admin123'; // Change this
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
```

Then insert the SUPERADMIN:
```sql
INSERT INTO users (phone_number, email, password_hash, user_type, phone_verified)
VALUES ('9999999999', 'superadmin@admin.com', 'YOUR_HASHED_PASSWORD', 'SUPERADMIN', true);

INSERT INTO user_profiles (user_id, name, is_current)
VALUES (1, 'Super Admin', true);
```

### 6. Start the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "phone_number": "9876543210",
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "user_type": "CUSTOMER", // or "VENDOR"
  "city": "Mumbai",
  "state": "Maharashtra",
  "gender": "male"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "phone_number": "9876543210",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user_id": 1,
    "user_type": "CUSTOMER",
    "profile": {
      "name": "John Doe",
      "city": "Mumbai"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Get Profile
```http
GET /api/auth/profile
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "John Updated",
  "city": "Pune",
  "state": "Maharashtra"
}
```

### Admin Endpoints
**Note**: All admin endpoints require JWT token and ADMIN/SUPERADMIN role.

#### Get Dashboard Stats
```http
GET /api/dashboard/stats
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Get All Users
```http
GET /api/admin/users?user_type=CUSTOMER&status=active&search=john&page=1&limit=10
Authorization: Bearer YOUR_JWT_TOKEN
```

Query Parameters:
- `user_type`: CUSTOMER, VENDOR, ADMIN, SUPERADMIN
- `status`: active, inactive, suspended
- `search`: Search in name, phone, email
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

#### Get User by ID
```http
GET /api/admin/users/:id
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Create Admin (SUPERADMIN only)
```http
POST /api/admin/users/admin
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "phone_number": "9999888877",
  "email": "admin@example.com",
  "password": "admin123",
  "name": "Admin User"
}
```

#### Update User Status
```http
PUT /api/admin/users/:id/status
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "status": "active" // or "inactive", "suspended"
}
```

#### Delete User
```http
DELETE /api/admin/users/:id
Authorization: Bearer YOUR_JWT_TOKEN
```

#### Get All Vendors
```http
GET /api/admin/vendors?status=pending&city=Mumbai&page=1&limit=10
Authorization: Bearer YOUR_JWT_TOKEN
```

Query Parameters:
- `status`: pending, approved, rejected
- `city`: Filter by city
- `search`: Search in name, shop name, phone
- `page`: Page number
- `limit`: Items per page

#### Get Vendor by ID
```http
GET /api/admin/vendors/:id
Authorization: Bearer YOUR_JWT_TOKEN
```

Response includes:
- Vendor basic info
- Shop details
- All documents
- Services offered
- Metrics (bookings, revenue, ratings)

#### Verify/Reject Vendor Shop
```http
PUT /api/admin/vendors/:id/verification
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "status": "approved", // or "rejected"
  "admin_comments": "All documents verified successfully"
}
```

#### Verify/Reject Document
```http
PUT /api/admin/documents/:documentId/verification
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "status": "approved", // or "rejected"
  "admin_comments": "Document is clear and valid"
}
```

## 🔑 User Roles & Permissions

### SUPERADMIN
- All ADMIN permissions
- Create/Delete ADMIN users
- Cannot be modified or deleted by other users

### ADMIN
- View/Manage all users
- View/Manage all vendors
- Verify/Reject vendor shops
- Verify/Reject vendor documents
- View dashboard statistics
- Update user status
- Delete users (except SUPERADMIN)

### VENDOR
- Manage own shop details
- Upload documents
- Manage services
- View own bookings

### CUSTOMER
- Book services
- View vendors
- Write reviews
- Manage own profile

## 📊 Database Schema Highlights

### Key Improvements

1. **User Tables Separation**
   - `users`: Stores constant data (phone, email, password, type)
   - `user_profiles`: Stores updatable data (name, city, profile pic) with versioning

2. **Vendor Metrics Table**
   - Separated from shop_details
   - Stores calculated/aggregated data
   - Automatically updated via triggers/app logic

3. **Unified Documents Table**
   - `vendor_documents` replaces separate image and verification tables
   - Single table for all document types (images, licenses, certificates)

4. **Admin Tracking**
   - `created_by` field tracks who created users
   - `verified_by` tracks who verified vendors

## 🧪 Testing

### Test with cURL

Login:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"9999999999","password":"admin123"}'
```

Get Users (as admin):
```bash
curl -X GET http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 5000 |
| NODE_ENV | Environment | development |
| DB_HOST | Database host | localhost |
| DB_PORT | Database port | 5432 |
| DB_NAME | Database name | booking_db |
| DB_USER | Database user | postgres |
| DB_PASSWORD | Database password | - |
| JWT_SECRET | JWT secret key | - |
| JWT_EXPIRE | JWT expiration | 7d |
| CORS_ORIGIN | CORS allowed origin | http://localhost:3000 |

## 🚦 Error Handling

All API responses follow this format:

Success:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

Error:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## 🔒 Security Features

- ✅ Password hashing with bcrypt
- ✅ JWT token authentication
- ✅ Role-based access control
- ✅ SQL injection prevention (parameterized queries)
- ✅ CORS protection
- ✅ Input validation

## 📦 Project Structure

```
booking-api/
├── config/
│   └── database.js       # Database configuration
├── controllers/
│   ├── authController.js # Authentication logic
│   └── adminController.js # Admin operations
├── middleware/
│   └── auth.js           # Authentication & authorization
├── routes/
│   ├── authRoutes.js     # Auth endpoints
│   └── adminRoutes.js    # Admin endpoints
├── database/
│   └── schema.sql        # Database schema
├── .env.example          # Environment variables template
├── server.js             # Main server file
└── package.json          # Dependencies
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the ISC License.

## 👥 Support

For issues and questions:
- Open an issue on GitHub
- Contact: support@example.com

---

**Happy Coding! 🚀**
