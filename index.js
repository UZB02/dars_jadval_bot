// index.js
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import path from "path";

dotenv.config();

import { adminBotApp } from "./admin_bot.js";
import { studentBotApp } from "./student_bot.js";

const app = express();
const PORT = process.env.PORT || 3000;
const usersFile = path.join(process.cwd(), "users.json");

app.use(express.json());
app.use(cors()); // CORS ruxsat berish

// === Bot webhooks ===
app.use("/admin_bot", adminBotApp);
app.use("/student_bot", studentBotApp);

// === API ===
app.get("/api/users", (req, res) => {
  if (!fs.existsSync(usersFile)) return res.json([]);
  try {
    const data = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const usersArray = Object.entries(data).map(([chatId, user]) => ({
      chatId,
      firstName: user.firstName,
      lastName: user.lastName,
      startCount: user.startCount || 0,
    }));
    res.json(usersArray);
  } catch (err) {
    console.error("users.json o'qishda xato:", err);
    res.status(500).json({ error: "Foydalanuvchilarni olishda xato" });
  }
});

// Root
app.get("/", (req, res) => {
  res.send("📌 Bot server ishlayapti!");
});

// === Auto-ping (Render Free tarifida uxlab qolmasligi uchun) ===
if (process.env.WEBHOOK_URL) {
  setInterval(() => {
    fetch(`${process.env.WEBHOOK_URL}/`)
      .then(() =>
        console.log("🔄 Auto-ping yuborildi:", new Date().toLocaleString())
      )
      .catch((err) => console.error("❌ Auto-ping xato:", err));
  }, 10 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`🚀 Server port ${PORT} da ishlayapti`);
});
