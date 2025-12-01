# 🚀 Quick Start Guide

## Prerequisites Check
- [ ] Node.js installed (v14+)
- [ ] PostgreSQL installed (v12+)
- [ ] Git installed

## Setup Steps

### 1. Database Setup (5 minutes)

```bash
# Create database
createdb booking_db

# OR using psql
psql -U postgres
CREATE DATABASE booking_db;
\q

# Run schema
psql -U postgres -d booking_db -f database/schema.sql
```

### 2. Install Dependencies (2 minutes)

```bash
npm install
```

### 3. Environment Configuration (2 minutes)

```bash
# Copy example env file
cp .env.example .env

# Edit .env file with your database credentials
# Update DB_PASSWORD and JWT_SECRET
```

### 4. Create First SUPERADMIN (3 minutes)

Generate password hash:
```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('admin123', 10));"
```

Insert into database:
```sql
psql -U postgres -d booking_db

INSERT INTO users (phone_number, email, password_hash, user_type, phone_verified)
VALUES ('9999999999', 'superadmin@admin.com', 'YOUR_GENERATED_HASH', 'SUPERADMIN', true);

INSERT INTO user_profiles (user_id, name, is_current)
VALUES (1, 'Super Admin', true);

\q
```

### 5. Start Server (1 minute)

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### 6. Test API (2 minutes)

```bash
# Health check
curl http://localhost:5000/health

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"9999999999","password":"admin123"}'
```

## 🎉 You're Ready!

Your API is now running at: `http://localhost:5000`

### Next Steps:

1. **Import Postman Collection**
   - Import `postman_collection.json` into Postman
   - Test all endpoints

2. **Create Test Users**
   - Register a customer
   - Register a vendor
   - Test different user roles

3. **Explore Admin Features**
   - View dashboard
   - Manage users
   - Verify vendors

## 📚 Important URLs

- API Base: `http://localhost:5000/api`
- Health Check: `http://localhost:5000/health`
- Documentation: See README.md

## 🔑 Default Credentials

**SUPERADMIN:**
- Phone: 9999999999
- Password: admin123

⚠️ **CHANGE THIS IN PRODUCTION!**

## 🆘 Common Issues

### Database Connection Error
```bash
# Check PostgreSQL is running
sudo service postgresql status

# Check credentials in .env file
cat .env
```

### Port Already in Use
```bash
# Change PORT in .env file
PORT=5001
```

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## 📞 Need Help?

- Check README.md for detailed docs
- Review API endpoints in Postman collection
- Check server logs for errors

---

**Total Setup Time: ~15 minutes** ⏱️
