const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Routes Import
const authRoute = require('./routes/auth');
const userRoute = require('./routes/users'); // <--- මේක අනිවාර්යයි
const botRoute = require('./routes/bot');
const webhookRoute = require('./routes/webhook');
const logsRoute = require("./routes/logs");
const messageRoute = require("./routes/messages");
const analyticsRoute = require("./routes/analytics");

dotenv.config();
const app = express();

app.use(cors({
    origin: ["http://localhost:5173", "https://chat-bot-system-two.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("DB Connection Successful!"))
  .catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.send("CRM Backend is Running on Vercel! 🚀");
});

// Routes Definitions
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute); // <--- Settings Page එකට මේක ඕන
app.use("/api/bot", botRoute);
app.use("/api/webhook", webhookRoute);
app.use("/api/logs", logsRoute);
app.use("/api/messages", messageRoute);
app.use("/api/analytics", analyticsRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}!`);
});

module.exports = app;