#!/bin/bash

# ============================================
# Booking Management API - Setup Script
# ============================================

echo "╔═══════════════════════════════════════════════════╗"
echo "║   Booking Management API - Automated Setup       ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if Node.js is installed
echo "Checking prerequisites..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi
print_success "Node.js found: $(node --version)"

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    print_error "PostgreSQL is not installed. Please install PostgreSQL first."
    exit 1
fi
print_success "PostgreSQL found"

echo ""
echo "Step 1: Installing dependencies..."
npm install
if [ $? -eq 0 ]; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

echo ""
echo "Step 2: Setting up environment variables..."
if [ ! -f .env ]; then
    cp .env.example .env
    print_success ".env file created"
    print_warning "Please edit .env file with your database credentials"
    
    # Prompt for database credentials
    read -p "Enter PostgreSQL username (default: postgres): " DB_USER
    DB_USER=${DB_USER:-postgres}
    
    read -sp "Enter PostgreSQL password: " DB_PASSWORD
    echo ""
    
    read -p "Enter database name (default: booking_db): " DB_NAME
    DB_NAME=${DB_NAME:-booking_db}
    
    # Update .env file
    sed -i "s/DB_USER=postgres/DB_USER=$DB_USER/" .env
    sed -i "s/DB_PASSWORD=your_password/DB_PASSWORD=$DB_PASSWORD/" .env
    sed -i "s/DB_NAME=booking_db/DB_NAME=$DB_NAME/" .env
    
    # Generate random JWT secret
    JWT_SECRET=$(openssl rand -base64 32)
    sed -i "s/JWT_SECRET=your_super_secret_jwt_key_change_this_in_production/JWT_SECRET=$JWT_SECRET/" .env
    
    print_success "Environment variables configured"
else
    print_warning ".env file already exists, skipping..."
fi

echo ""
echo "Step 3: Creating database..."
createdb -U $DB_USER $DB_NAME 2>/dev/null
if [ $? -eq 0 ]; then
    print_success "Database '$DB_NAME' created"
else
    print_warning "Database might already exist or creation failed"
fi

echo ""
echo "Step 4: Running database schema..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -f database/schema.sql > /dev/null 2>&1
if [ $? -eq 0 ]; then
    print_success "Database schema applied successfully"
else
    print_error "Failed to apply database schema"
    print_warning "You may need to run manually: psql -U $DB_USER -d $DB_NAME -f database/schema.sql"
fi

echo ""
read -p "Do you want to seed the database with sample data? (y/n): " SEED_DB
if [[ $SEED_DB =~ ^[Yy]$ ]]; then
    echo "Seeding database..."
    PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -d $DB_NAME -f database/seed.sql > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        print_success "Database seeded with sample data"
        echo ""
        echo "Sample Credentials:"
        echo "  SUPERADMIN - Phone: 9999999999, Password: admin123"
        echo "  ADMIN      - Phone: 9999888877, Password: admin123"
        echo "  CUSTOMER   - Phone: 9876543210, Password: customer123"
        echo "  VENDOR     - Phone: 9123456780, Password: vendor123"
    else
        print_warning "Database seeding failed"
    fi
fi

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║              Setup Complete! 🎉                   ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Start the server: npm run dev"
echo "  2. Test API: curl http://localhost:5000/health"
echo "  3. Import postman_collection.json into Postman"
echo ""
echo "Documentation:"
echo "  - README.md - Complete API documentation"
echo "  - QUICKSTART.md - Quick start guide"
echo "  - PROJECT_SUMMARY.md - Project overview"
echo ""
print_success "Happy coding! 🚀"
