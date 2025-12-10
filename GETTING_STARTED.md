# 🚀 Getting Started with Booking Management API

## 📥 What You Have

A complete, production-ready Node.js REST API with:
- ✅ Improved database schema
- ✅ Authentication & authorization
- ✅ Admin panel endpoints
- ✅ Vendor management
- ✅ User management
- ✅ Complete documentation
- ✅ Sample data
- ✅ Postman collection

## ⚡ Quick Setup (2 Options)

### Option 1: Automated Setup (Recommended) - 5 minutes

```bash
cd booking-api
./setup.sh
npm run dev
```

That's it! The script will:
- Install dependencies
- Configure environment
- Create database
- Apply schema
- Optionally seed data
- Start server

### Option 2: Manual Setup - 15 minutes

Follow the detailed guide in `QUICKSTART.md`

## 🎯 First Steps After Setup

### 1. Test the API (1 minute)

```bash
# Health check
curl http://localhost:5000/health

# Expected response:
# {"success":true,"message":"Server is running","timestamp":"..."}
```

### 2. Login as SUPERADMIN (2 minutes)

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"9999999999","password":"admin123"}'
```

Copy the token from the response.

### 3. Test Admin Endpoint (1 minute)

```bash
curl -X GET http://localhost:5000/api/dashboard/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Import Postman Collection (2 minutes)

1. Open Postman
2. Click "Import"
3. Select `postman_collection.json`
4. Use the "Login" request to get a token
5. Token will auto-save in collection variables
6. Test all other endpoints

## 📖 Understanding the Project

### Project Structure

```
booking-api/
├── 📁 config/          - Database configuration
├── 📁 controllers/     - Business logic
├── 📁 middleware/      - Authentication & authorization
├── 📁 routes/          - API endpoints
├── 📁 database/        - Schema & seed files
├── 📄 server.js        - Main application
└── 📄 .env            - Environment configuration
```

### Key Files to Review

1. **DATABASE SCHEMA** (`database/schema.sql`)
   - See the improved table structure
   - Understand relationships
   - Review indexes and constraints

2. **API ENDPOINTS** (`README.md`)
   - Complete API documentation
   - Request/response examples
   - Authentication requirements

3. **SAMPLE DATA** (`database/seed.sql`)
   - Pre-configured test users
   - Sample vendors and bookings
   - Test credentials

## 🔑 Default Test Accounts

After seeding, you can login with:

| Role | Phone | Password | Use Case |
|------|-------|----------|----------|
| SUPERADMIN | 9999999999 | admin123 | Full admin access + create admins |
| ADMIN | 9999888877 | admin123 | User & vendor management |
| CUSTOMER | 9876543210 | customer123 | Customer operations |
| VENDOR | 9123456780 | vendor123 | Vendor operations |

## 🎓 Learning the API

### Day 1: Authentication (30 minutes)
- [ ] Understand user registration
- [ ] Test login functionality
- [ ] Learn about JWT tokens
- [ ] Try profile updates

**Files to review:**
- `controllers/authController.js`
- `routes/authRoutes.js`

### Day 2: Admin Features (45 minutes)
- [ ] Get dashboard statistics
- [ ] List and filter users
- [ ] Update user status
- [ ] Create new admin (as SUPERADMIN)

**Files to review:**
- `controllers/adminController.js`
- `routes/adminRoutes.js`
- `middleware/auth.js`

### Day 3: Vendor Management (45 minutes)
- [ ] List vendors with filters
- [ ] View vendor details
- [ ] Approve/reject shops
- [ ] Verify documents

**Files to review:**
- Same as Day 2
- `database/schema.sql` (vendor tables)

## 🔧 Common Tasks

### Create a New Admin User

```bash
POST /api/admin/users/admin
Headers: Authorization: Bearer SUPERADMIN_TOKEN
Body: {
  "phone_number": "9876000001",
  "email": "newadmin@example.com",
  "password": "securepassword",
  "name": "New Admin"
}
```

### Approve a Vendor

```bash
PUT /api/admin/vendors/{vendor_id}/verification
Headers: Authorization: Bearer ADMIN_TOKEN
Body: {
  "status": "approved",
  "admin_comments": "All documents verified"
}
```

### Get Pending Vendors

```bash
GET /api/admin/vendors?status=pending
Headers: Authorization: Bearer ADMIN_TOKEN
```

## 📊 Database Schema Highlights

### Key Improvements

1. **Separated User Tables**
   ```
   users (constant data) ←→ user_profiles (updatable, versioned)
   ```

2. **Vendor Metrics**
   ```
   vendor_shop_details (static) ←→ vendor_metrics (analytics)
   ```

3. **Unified Documents**
   ```
   vendor_documents (images + certificates + licenses)
   ```

## 🐛 Troubleshooting

### Database Connection Error

```bash
# Check PostgreSQL is running
sudo service postgresql status

# Verify credentials in .env
cat .env | grep DB_
```

### Port Already in Use

```bash
# Change port in .env
PORT=5001
```

### Module Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Login Not Working

```bash
# Verify user exists in database
psql -U postgres -d booking_db
SELECT phone_number, user_type FROM users;
```

## 📚 Additional Resources

### Documentation Files
- **README.md** - Complete API reference
- **QUICKSTART.md** - Fast setup guide
- **PROJECT_SUMMARY.md** - Architecture overview
- **This file** - Getting started guide

### Database Files
- **schema.sql** - Complete database structure
- **seed.sql** - Sample data

### Testing
- **postman_collection.json** - API tests

## 🎯 Next Steps

### For Development
1. **Add More Features**
   - Booking creation
   - Service management
   - Review system
   - Notifications

2. **Enhance Security**
   - Add rate limiting
   - Implement refresh tokens
   - Add input validation middleware

3. **Improve Performance**
   - Add caching (Redis)
   - Optimize queries
   - Add database connection pooling

### For Production
1. **Environment Setup**
   - Configure production database
   - Set strong JWT secret
   - Enable HTTPS
   - Configure CORS properly

2. **Monitoring**
   - Add logging (Winston)
   - Set up error tracking (Sentry)
   - Add performance monitoring

3. **Deployment**
   - Containerize with Docker
   - Deploy to cloud (AWS, Heroku, etc.)
   - Set up CI/CD pipeline

## 💡 Tips & Best Practices

1. **Always use environment variables** for sensitive data
2. **Test endpoints in Postman** before integrating
3. **Read error messages** - they're usually helpful
4. **Use the seeded data** for testing
5. **Check the logs** when something goes wrong
6. **Review the code** to understand how it works

## 🆘 Need Help?

1. **Read the Documentation**
   - Start with README.md
   - Check PROJECT_SUMMARY.md for architecture

2. **Check the Code**
   - Controllers have detailed comments
   - Database schema is well-documented

3. **Review Sample Data**
   - See seed.sql for examples
   - Use Postman collection for testing

4. **Common Issues**
   - Database not created → Run setup.sh
   - Token expired → Login again
   - Permission denied → Check user role

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Server starts without errors
- [ ] Health endpoint responds
- [ ] Can login as SUPERADMIN
- [ ] Can get dashboard stats
- [ ] Can list users
- [ ] Can list vendors
- [ ] Database has sample data
- [ ] Postman collection works

## 🎉 You're Ready!

Congratulations! You now have a fully functional booking management API.

**Start building amazing features! 🚀**

---

**Questions?** Review the documentation files or check the code - everything is well-commented and organized.
