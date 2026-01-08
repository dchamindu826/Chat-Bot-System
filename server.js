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
const messageRoute = require("./routes/messages");
const analyticsRoute = require("./routes/analytics");
const teamRoute = require('./routes/team');
const crmRoute = require("./routes/crm"); // ✅ CRM Route එක හරියටම Import කළා

dotenv.config();
const app = express();

// --- CORS FIX ---
app.use(cors({
    origin: ["http://localhost:5173", "https://chat-bot-system-frontend.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "token", "Authorization"]
}));

app.use(express.json());

// Database Connection
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("DB Connection Successful! ✅"))
  .catch((err) => console.log("DB Connection Error: ❌", err));

app.get("/", (req, res) => {
  res.send("SmartReply CRM Backend is Running! 🚀");
});

// Routes Definitions
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/bot", botRoute);
app.use("/api/webhook", webhookRoute);
app.use("/api/logs", logsRoute);
app.use("/api/messages", messageRoute);
app.use("/api/analytics", analyticsRoute);
app.use("/api/team", teamRoute);
app.use("/api/crm", crmRoute); // ✅ CRM Route එක Use කළා

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}!`);
});

module.exports = app;