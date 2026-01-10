const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Routes Import
const authRoute = require('./routes/auth');
const userRoute = require('./routes/users');
const botRoute = require('./routes/bot'); // ⚠️ Note: File එකේ නම 'bot.js' ම විය යුතුයි (routes folder එකේ)
const webhookRoute = require('./routes/webhook');
const logsRoute = require("./routes/logs");
const messagesRoute = require("./routes/messages");
const analyticsRoute = require("./routes/analytics");
const teamRoute = require('./routes/team');
const crmRoute = require("./routes/crm");

dotenv.config();

const app = express();

// CORS Settings - ඕනෑම තැනක ඉඳන් වැඩ කරන්න හදමු (Debugging ලේසි වෙන්න)
app.use(cors({
    origin: "*", // මෙය ආරක්ෂිත නැතත් දැනට Error එක හොයාගන්න ලේසියි
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "token", "Authorization"]
}));

app.use(express.json());

// ✅ OPTIMIZED DATABASE CONNECTION (Timeout Fix)
const connectDB = async () => {
  try {
    // දැනටමත් connect වෙලා නම් ආයේ හදන්න එපා
    if (mongoose.connection.readyState === 1) {
        console.log("Using existing DB connection ✅");
        return;
    }

    await mongoose.connect(process.env.MONGO_URL, {
      // Timeout settings වැඩි කරමු (තත්පර 60ක් දක්වා)
      serverSelectionTimeoutMS: 60000, 
      socketTimeoutMS: 60000,
      family: 4 // IPv4 Force කරන්න (Vercel IP අවුල් මගහරින්න)
    });

    console.log("DB Connection Successful! ✅");
  } catch (err) {
    console.error("DB Connection Error: ❌", err);
  }
};

// Server Run වෙද්දිම DB Connect කරන්න
connectDB();

app.get("/", (req, res) => {
  res.send("SmartReply CRM Backend is Running! 🚀");
});

// ✅ Routes Definitions
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);

// 👇 මෙන්න මේක වෙනස් කළා. Frontend එක ඉල්ලන්නේ "/api/bot" නිසා.
app.use("/api/bot", botRoute); 

app.use("/api/webhook", webhookRoute);
app.use("/api/logs", logsRoute);
app.use("/api/messages", messagesRoute);
app.use("/api/analytics", analyticsRoute);
app.use("/api/team", teamRoute);
app.use("/api/crm", crmRoute);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}!`);
});

module.exports = app;