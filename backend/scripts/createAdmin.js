require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Admin = require('../models/Admin');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => rl.question(question, (answer) => resolve(answer)));

(async () => {
  try {
    await connectDB();

    const username = (await ask('Enter admin username: ')).trim().toLowerCase();
    const password = await ask('Enter admin password: ');

    if (!username || !password) {
      console.log('Username and password are required.');
      process.exit(1);
    }

    if (password.length < 6) {
      console.log('Password must be at least 6 characters.');
      process.exit(1);
    }

    const existing = await Admin.findOne({ username });
    if (existing) {
      console.log(`An admin with username "${username}" already exists.`);
      process.exit(1);
    }

    const admin = await Admin.create({ username, password });

    console.log('\n✅ Admin account created successfully:');
    console.log(`   Username: ${admin.username}`);
    console.log(`   ID:       ${admin._id}\n`);

    process.exit(0);
  } catch (err) {
    console.error('Error creating admin:', err.message);
    process.exit(1);
  } finally {
    rl.close();
    mongoose.connection.close();
  }
})();