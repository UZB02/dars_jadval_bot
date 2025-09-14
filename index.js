import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

import { adminBotApp } from "./admin_bot.js";
import { studentBotApp } from "./student_bot.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Admin bot webhook
app.use("/admin_bot", adminBotApp);

// Student bot webhook
app.use("/student_bot", studentBotApp);

app.get("/", (req, res) => {
  res.send("📌 Bot server ishlayapti!");
});

// 🚀 Auto-ping (Render Free tarifida sleep bo‘lmasligi uchun)
if (process.env.WEBHOOK_URL) {
  setInterval(() => {
    fetch(`${process.env.WEBHOOK_URL}/`) // faqat rootni ping qilamiz
      .then(() =>
        console.log("🔄 Auto-ping yuborildi:", new Date().toLocaleString())
      )
      .catch((err) => console.error("❌ Auto-ping xato:", err));
  }, 10 * 60 * 1000); // har 10 daqiqada
}

app.listen(PORT, () => {
  console.log(`🚀 Server port ${PORT} da ishlayapti`);
});
