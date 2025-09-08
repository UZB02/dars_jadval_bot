import express from "express";
import dotenv from "dotenv";

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

app.listen(PORT, () => {
  console.log(`🚀 Server port ${PORT} da ishlayapti`);
});
