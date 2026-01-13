const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Routes Import
const authRoute = require('./routes/auth');
const userRoute = require('./routes/users');
const botRoute = require('./routes/bot'); 
const webhookRoute = require('./routes/webhook');
const logsRoute = require("./routes/logs");
const messagesRoute = require("./routes/messages");
const analyticsRoute = require("./routes/analytics");
const teamRoute = require('./routes/team');
const crmRoute = require("./routes/crm");

// 🔥 NOTE: Broadcast & Templates තාම හදලා නැති නිසා ඒවා මෙතනින් අයින් කළා.
// නැත්නම් Server එක Crash වෙනවා.

dotenv.config();

const app = express();

app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "token", "Authorization"]
}));

app.use(express.json());

// 🔥 VERCEL OPTIMIZED DB CONNECTION (Caching Fix)
let isConnected = false; // Track connection status

const connectDB = async () => {
  if (isConnected) {
    console.log("Using existing DB connection ✅");
    return;
  }

  try {
    const db = await mongoose.connect(process.env.MONGO_URL, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s (Fail fast)
      socketTimeoutMS: 45000,
      family: 4 // IPv4 Force
    });

    isConnected = db.connections[0].readyState;
    console.log("New DB Connection Established ✅");
  } catch (err) {
    console.error("DB Connection Error: ❌", err);
  }
};

// 🔥 MIDDLEWARE: Ensure DB is connected before handling ANY request
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

app.get("/", (req, res) => {
  res.send("SmartReply CRM Backend is Running! 🚀");
});

// ✅ Routes Definitions
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/bot-config", botRoute);
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

// For Local Development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Backend server is running on port ${PORT}!`);
    });
}

// For Vercel
module.exports = app;