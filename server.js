const express = require('express');
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
const quickReplyRoute = require("./routes/quickReplies");
const templateRoute = require("./routes/templates"); 

dotenv.config();

const app = express();

// 🔥 FIXED CORS SETUP (ඔයාගේ වැඩ කරන පරණ කෝඩ් එකමයි)
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "token", "Authorization", "X-Requested-With"]
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("SmartReply CRM Backend is Running! 🚀 (Supabase Version)");
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
app.use("/api/templates", templateRoute);
app.use("/api/quick-replies", quickReplyRoute);

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