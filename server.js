const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoute = require('./routes/auth');
const userRoute = require('./routes/users');
const botRoute = require('./routes/bot');
const webhookRoute = require('./routes/webhook');

dotenv.config();
const app = express();

// 1. CORS Configuration (Frontend එකට Access දෙනවා)
app.use(cors({
    origin: "*", // ඕනම තැනකින් එන request එකක් ගන්නවා (Production වලදී Frontend URL එක දාන එක ආරක්ෂිතයි)
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());

// 2. Database Connection
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("DB Connection Successful!"))
  .catch((err) => console.log(err));

// 3. Default Route (Server එක වැඩද කියලා බලන්න)
app.get("/", (req, res) => {
  res.send("CRM Backend is Running on Vercel! 🚀");
});

// API Routes
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/bot", botRoute);
app.use("/api/webhook", webhookRoute);

// 4. Local Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}!`);
});

// 5. IMPORTANT: Export App for Vercel
module.exports = app;