// Quick test to verify controller is working
const path = require('path');

console.log('🔍 Testing Controller File...\n');

try {
  // Try to load the controller
  const controller = require('./adminController.js');
  
  console.log('✅ Controller loaded successfully');
  console.log('📋 Available functions:', Object.keys(controller).length);
  console.log('\n📝 Functions list:');
  
  Object.keys(controller).forEach((fn, index) => {
    console.log(`  ${index + 1}. ${fn}`);
  });
  
  console.log('\n✅ Controller file is valid!');
  console.log('👉 Next step: Replace your current controller with this one');
  
} catch (error) {
  console.error('❌ Error loading controller:', error.message);
  console.error('\n📍 Error details:', error.stack);
}