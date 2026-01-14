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
const broadcastRoute = require("./routes/broadcast"); 
const cronRoute = require("./routes/cron"); 

dotenv.config();

const app = express();

// 🔥 STEP 1: CORS SETUP (MUST BE AT THE TOP)
// Database එකට කලින් මේක රන් වෙන්න ඕන.
app.use(cors({
    origin: true, // Allow any origin dynamically
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "token", "Authorization", "X-Requested-With"]
}));

// 🔥 STEP 2: HANDLE PREFLIGHT REQUESTS MANUALLY
// OPTIONS ආවම DB එකට යන්න එපා, කෙලින්ම 200 එවන්න.
app.options('*', (req, res) => {
    res.sendStatus(200);
});

app.use(express.json());

// 🔥 DB CONNECTION LOGIC
let isConnected = false; 

const connectDB = async () => {
  if (isConnected) {
    console.log("Using existing DB connection ✅");
    return;
  }
  try {
    const db = await mongoose.connect(process.env.MONGO_URL, {
      serverSelectionTimeoutMS: 5000, 
      socketTimeoutMS: 45000,
      family: 4 
    });
    isConnected = db.connections[0].readyState;
    console.log("New DB Connection Established ✅");
  } catch (err) {
    console.error("DB Connection Error: ❌", err);
  }
};

// 🔥 STEP 3: MIDDLEWARE (SKIP DB FOR 'OPTIONS')
// OPTIONS request එකක් නම් DB connect වෙන්න බලන් ඉන්න එපා.
app.use(async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
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
app.use("/api/broadcast", broadcastRoute); 
app.use("/api/cron", cronRoute); 

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

module.exports = app;