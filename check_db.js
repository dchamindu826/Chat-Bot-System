const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

const checkBroadcasts = async () => {
  try {
    console.log("🔌 Connecting to Database...");
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ Connected!");

    // Get the broadcasts collection directly
    const collection = mongoose.connection.db.collection("broadcasts");

    // Find last 5 broadcasts
    const broadcasts = await collection.find({})
        .sort({_id: -1}) // Sort by newest first
        .limit(5)
        .toArray();

    console.log("\n📊 --- RECENT BROADCASTS --- 📊\n");

    broadcasts.forEach((b, index) => {
        console.log(`🔹 Broadcast #${index + 1}: ${b.name || 'Unnamed'}`);
        console.log(`   📅 Scheduled: ${b.scheduledTime}`);
        console.log(`   🚦 Status: ${b.status}`);
        console.log(`   ✅ Success Count: ${b.successCount || 0}`);
        console.log(`   ❌ Fail Count: ${b.failCount || 0}`);
        console.log(`   👥 Total Recipients in List: ${b.recipients ? b.recipients.length : 0}`);
        console.log("-------------------------------------------------\n");
    });

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
};

checkBroadcasts();
