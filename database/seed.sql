-- ============================================
-- DATABASE SEED FILE
-- Sample data for testing
-- ============================================

BEGIN;

-- ============================================
-- CLEAR EXISTING DATA (Optional - Use with caution!)
-- ============================================
-- TRUNCATE TABLE notifications CASCADE;
-- TRUNCATE TABLE vendor_early_closures CASCADE;
-- TRUNCATE TABLE vendor_holidays CASCADE;
-- TRUNCATE TABLE reviews CASCADE;
-- TRUNCATE TABLE vendor_metrics CASCADE;
-- TRUNCATE TABLE booking_services CASCADE;
-- TRUNCATE TABLE bookings CASCADE;
-- TRUNCATE TABLE vendor_services CASCADE;
-- TRUNCATE TABLE services_master CASCADE;
-- TRUNCATE TABLE vendor_documents CASCADE;
-- TRUNCATE TABLE vendor_shop_details CASCADE;
-- TRUNCATE TABLE user_profiles CASCADE;
-- TRUNCATE TABLE users CASCADE;

-- ============================================
-- USERS & PROFILES
-- ============================================

-- 1. SUPERADMIN (Password: admin123)
-- Generate hash: node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('admin123', 10));"
INSERT INTO users (phone_number, email, password_hash, user_type, phone_verified, status)
VALUES 
('9999999999', 'superadmin@admin.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'SUPERADMIN', true, 'active')
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO user_profiles (user_id, name, is_current)
VALUES (1, 'Super Admin', true)
ON CONFLICT DO NOTHING;

-- 2. ADMIN (Password: admin123)
INSERT INTO users (phone_number, email, password_hash, user_type, phone_verified, status, created_by)
VALUES 
('9999888877', 'admin@admin.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ADMIN', true, 'active', 1)
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO user_profiles (user_id, name, is_current)
VALUES (2, 'Admin User', true)
ON CONFLICT DO NOTHING;

-- 3. CUSTOMERS (Password: customer123)
INSERT INTO users (phone_number, email, password_hash, user_type, phone_verified, status)
VALUES 
('9876543210', 'john.doe@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'CUSTOMER', true, 'active'),
('9876543211', 'jane.smith@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'CUSTOMER', true, 'active'),
('9876543212', 'mike.johnson@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'CUSTOMER', true, 'active')
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO user_profiles (user_id, name, city, state, gender, is_current)
VALUES 
(3, 'John Doe', 'Mumbai', 'Maharashtra', 'male', true),
(4, 'Jane Smith', 'Pune', 'Maharashtra', 'female', true),
(5, 'Mike Johnson', 'Mumbai', 'Maharashtra', 'male', true)
ON CONFLICT DO NOTHING;

-- 4. VENDORS (Password: vendor123)
INSERT INTO users (phone_number, email, password_hash, user_type, phone_verified, status)
VALUES 
('9123456780', 'modern.salon@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'VENDOR', true, 'active'),
('9123456781', 'classic.barber@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'VENDOR', true, 'active'),
('9123456782', 'elite.spa@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'VENDOR', true, 'active'),
('9123456783', 'beauty.lounge@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'VENDOR', true, 'active')
ON CONFLICT (phone_number) DO NOTHING;

INSERT INTO user_profiles (user_id, name, city, state, is_current)
VALUES 
(6, 'Modern Salon Owner', 'Mumbai', 'Maharashtra', true),
(7, 'Classic Barber Owner', 'Pune', 'Maharashtra', true),
(8, 'Elite Spa Owner', 'Mumbai', 'Maharashtra', true),
(9, 'Beauty Lounge Owner', 'Mumbai', 'Maharashtra', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- SERVICES MASTER
-- ============================================

INSERT INTO services_master (service_name, service_description, default_duration_minutes, service_type)
VALUES 
('Haircut', 'Professional haircut service', 30, 'normal'),
('Hair Styling', 'Hair styling and treatment', 45, 'normal'),
('Shaving', 'Clean shave service', 20, 'normal'),
('Beard Trim', 'Beard trimming and styling', 15, 'normal'),
('Facial', 'Facial treatment and cleansing', 60, 'normal'),
('Head Massage', 'Relaxing head and shoulder massage', 30, 'normal'),
('Hair Coloring', 'Professional hair coloring', 90, 'premium'),
('Spa Treatment', 'Full spa treatment package', 120, 'premium'),
('Manicure', 'Hand and nail care', 30, 'normal'),
('Pedicure', 'Foot and nail care', 45, 'normal'),
('Hair Spa', 'Deep conditioning hair treatment', 60, 'premium'),
('Threading', 'Eyebrow and facial threading', 15, 'normal')
ON CONFLICT (service_name) DO NOTHING;

-- ============================================
-- VENDOR SHOP DETAILS
-- ============================================

INSERT INTO vendor_shop_details (
    user_id, shop_name, shop_address, city, state, 
    latitude, longitude, open_time, close_time,
    break_start_time, break_end_time, weekly_holiday,
    no_of_seats, no_of_workers, status,
    admin_comments, verified_by, verified_at,
    business_license, tax_number, bank_account_number, bank_ifsc_code
)
VALUES 
(
    6, 'Modern Salon & Spa', 
    'Shop No. 12, Linking Road, Bandra West', 
    'Mumbai', 'Maharashtra',
    19.0596, 72.8295,
    '10:00:00', '20:00:00',
    '13:00:00', '14:00:00', 'Monday',
    5, 4, 'approved',
    'All documents verified. Excellent setup.',
    1, CURRENT_TIMESTAMP,
    'BL2024001', 'GST29ABCDE1234F1Z5',
    '1234567890', 'SBIN0001234'
),
(
    7, 'Classic Barber Shop', 
    '45, FC Road, Shivaji Nagar', 
    'Pune', 'Maharashtra',
    18.5196, 73.8553,
    '09:00:00', '21:00:00',
    NULL, NULL, 'Sunday',
    3, 2, 'approved',
    'Traditional setup, all papers in order.',
    1, CURRENT_TIMESTAMP,
    'BL2024002', 'GST27FGHIJ5678K1Z5',
    '0987654321', 'HDFC0001234'
),
(
    8, 'Elite Spa & Wellness', 
    'Tower B, Hiranandani Gardens, Powai', 
    'Mumbai', 'Maharashtra',
    19.1197, 72.9072,
    '11:00:00', '22:00:00',
    '14:00:00', '15:00:00', 'Tuesday',
    8, 6, 'pending',
    NULL, NULL, NULL,
    'BL2024003', 'GST29KLMNO9012P1Z5',
    '1122334455', 'ICIC0001234'
),
(
    9, 'Beauty Lounge', 
    'Phoenix Mall, Lower Parel', 
    'Mumbai', 'Maharashtra',
    19.0089, 72.8303,
    '10:30:00', '21:30:00',
    '13:30:00', '14:30:00', 'Wednesday',
    6, 5, 'pending',
    NULL, NULL, NULL,
    'BL2024004', 'GST29QRSTU3456V1Z5',
    '6677889900', 'AXIS0001234'
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- VENDOR METRICS
-- ============================================

INSERT INTO vendor_metrics (vendor_id, total_bookings, completed_bookings, cancelled_bookings, total_revenue, average_rating, total_reviews)
VALUES 
(6, 156, 148, 8, 234500.00, 4.5, 120),
(7, 203, 195, 8, 152300.00, 4.7, 180),
(8, 0, 0, 0, 0.00, 0.00, 0),
(9, 0, 0, 0, 0.00, 0.00, 0)
ON CONFLICT (vendor_id) DO NOTHING;

-- ============================================
-- VENDOR DOCUMENTS
-- ============================================

INSERT INTO vendor_documents (vendor_id, document_url, document_type, is_primary, status, admin_comments)
VALUES 
-- Modern Salon
(6, 'https://example.com/images/salon1_shop.jpg', 'shop_image', true, 'approved', 'Clear image'),
(6, 'https://example.com/images/salon1_interior.jpg', 'shop_image', false, 'approved', 'Good'),
(6, 'https://example.com/docs/salon1_license.pdf', 'license', false, 'approved', 'Valid license'),
(6, 'https://example.com/docs/salon1_tax.pdf', 'tax_certificate', false, 'approved', 'Valid'),

-- Classic Barber
(7, 'https://example.com/images/barber1_shop.jpg', 'shop_image', true, 'approved', 'Clear image'),
(7, 'https://example.com/docs/barber1_license.pdf', 'license', false, 'approved', 'Valid license'),

-- Elite Spa (Pending)
(8, 'https://example.com/images/spa1_shop.jpg', 'shop_image', true, 'pending', NULL),
(8, 'https://example.com/docs/spa1_license.pdf', 'license', false, 'pending', NULL),

-- Beauty Lounge (Pending)
(9, 'https://example.com/images/lounge1_shop.jpg', 'shop_image', true, 'pending', NULL);

-- ============================================
-- VENDOR SERVICES
-- ============================================

-- Modern Salon Services
INSERT INTO vendor_services (vendor_id, service_id, price, is_available)
VALUES 
(6, 1, 500.00, true),   -- Haircut
(6, 2, 800.00, true),   -- Hair Styling
(6, 5, 1200.00, true),  -- Facial
(6, 6, 400.00, true),   -- Head Massage
(6, 7, 2500.00, true),  -- Hair Coloring
(6, 11, 1500.00, true); -- Hair Spa

-- Classic Barber Services
INSERT INTO vendor_services (vendor_id, service_id, price, is_available)
VALUES 
(7, 1, 300.00, true),   -- Haircut
(7, 3, 150.00, true),   -- Shaving
(7, 4, 100.00, true),   -- Beard Trim
(7, 6, 200.00, true);   -- Head Massage

-- Elite Spa Services
INSERT INTO vendor_services (vendor_id, service_id, price, is_available)
VALUES 
(8, 5, 1500.00, true),  -- Facial
(8, 8, 3500.00, true),  -- Spa Treatment
(8, 9, 600.00, true),   -- Manicure
(8, 10, 800.00, true);  -- Pedicure

-- Beauty Lounge Services
INSERT INTO vendor_services (vendor_id, service_id, price, is_available)
VALUES 
(9, 2, 700.00, true),   -- Hair Styling
(9, 7, 2000.00, true),  -- Hair Coloring
(9, 9, 500.00, true),   -- Manicure
(9, 12, 200.00, true);  -- Threading

-- ============================================
-- SAMPLE BOOKINGS
-- ============================================

INSERT INTO bookings (user_id, vendor_id, booking_date, total_amount, payment_method, payment_status, booking_status)
VALUES 
(3, 6, CURRENT_DATE, 1300.00, 'online', 'completed', 'completed'),
(4, 6, CURRENT_DATE + 1, 800.00, 'cash', 'pending', 'confirmed'),
(5, 7, CURRENT_DATE, 450.00, 'online', 'completed', 'completed'),
(3, 7, CURRENT_DATE + 2, 300.00, 'cash', 'pending', 'confirmed');

-- ============================================
-- BOOKING SERVICES
-- ============================================

INSERT INTO booking_services (booking_id, service_id, service_name, service_price, start_time, end_time, duration_minutes)
VALUES 
(1, 1, 'Haircut', 500.00, '10:00:00', '10:30:00', 30),
(1, 2, 'Hair Styling', 800.00, '10:30:00', '11:15:00', 45),
(2, 2, 'Hair Styling', 800.00, '14:00:00', '14:45:00', 45),
(3, 1, 'Haircut', 300.00, '11:00:00', '11:30:00', 30),
(3, 3, 'Shaving', 150.00, '11:30:00', '11:50:00', 20),
(4, 1, 'Haircut', 300.00, '15:00:00', '15:30:00', 30);

-- ============================================
-- REVIEWS
-- ============================================

INSERT INTO reviews (booking_id, user_id, vendor_id, rating, review_text)
VALUES 
(1, 3, 6, 5, 'Excellent service! Very professional and clean.'),
(3, 5, 7, 4, 'Good traditional barber. Quick service.');

-- ============================================
-- VENDOR HOLIDAYS
-- ============================================

INSERT INTO vendor_holidays (vendor_id, holiday_date, holiday_reason)
VALUES 
(6, CURRENT_DATE + 10, 'Diwali Festival'),
(7, CURRENT_DATE + 15, 'Personal Holiday');

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check users count
SELECT user_type, COUNT(*) as count FROM users GROUP BY user_type;

-- Check vendors
SELECT u.user_id, up.name, vs.shop_name, vs.status 
FROM users u
JOIN user_profiles up ON u.user_id = up.user_id AND up.is_current = true
LEFT JOIN vendor_shop_details vs ON u.user_id = vs.user_id
WHERE u.user_type = 'VENDOR';

-- Check services
SELECT COUNT(*) as total_services FROM services_master;

-- Check bookings
SELECT COUNT(*) as total_bookings FROM bookings;

SELECT 'Database seeded successfully! ✅' as status;
