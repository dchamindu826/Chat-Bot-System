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

// 🔥 FIXED CORS SETUP
// අපි "origin: true" වෙනුවට function එකක් පාවිච්චි කරනවා.
// මේකෙන් එන ඕනම request එකකට "ඔයාට එන්න පුළුවන්" කියලා හරියටම කියනවා.
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow any origin dynamically
        return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true, // Cookies/Tokens allow කරන්න
    allowedHeaders: ["Content-Type", "token", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

// 🔥 DB CONNECTION (Stable Version)
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

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
    // OPTIONS requests වලට DB connect වෙන්න එපා (Fast response)
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