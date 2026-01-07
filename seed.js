const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

dotenv.config();

const seedDB = async () => {
  try {
    // 1. මුලින්ම Database එකට connect වෙනකම් බලන් ඉන්නවා
    console.log("⏳ Connecting to Database...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ DB Connected!");

    // 2. පරණ Admin කෙනෙක් ඉන්නවා නම් මකනවා
    await User.deleteMany({ email: "admin@smartreply.com" });

    // 3. Password එක Hash කරනවා
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("admin123", salt);

    // 4. අලුත් Admin User හදනවා
    const newAdmin = new User({
      name: "Super Admin",
      email: "admin@smartreply.com",
      password: hashedPassword,
      role: "admin",
      businessName: "Headquarters"
    });

    await newAdmin.save();
    console.log("🎉 Admin User Created Successfully!");
    
    // 5. Connection එක වහනවා
    mongoose.connection.close();
    process.exit();

  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
};

seedDB();