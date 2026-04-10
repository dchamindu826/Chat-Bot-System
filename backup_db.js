const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const backupDatabase = async () => {
  try {
    console.log("🔌 Connecting to Database...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ Connected!");

    // 1. Create a Backup Folder with Date & Time
    const date = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    const backupDir = path.join(__dirname, "backups", `backup_${date}`);

    if (!fs.existsSync(path.join(__dirname, "backups"))) {
      fs.mkdirSync(path.join(__dirname, "backups"));
    }
    fs.mkdirSync(backupDir);

    console.log(`📂 Creating backup in: ${backupDir}`);

    // 2. Get All Collections
    const collections = await mongoose.connection.db.listCollections().toArray();

    for (let col of collections) {
      console.log(`⬇️  Backing up: ${col.name}`);
      
      const data = await mongoose.connection.db.collection(col.name).find({}).toArray();
      
      const filePath = path.join(backupDir, `${col.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    console.log("\n✅ BACKUP COMPLETED SUCCESSFULLY!");
    console.log(`📍 Location: ${backupDir}`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Backup Failed:", err);
    process.exit(1);
  }
};

backupDatabase();
