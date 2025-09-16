// teacher_bot.js
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.TEACHER_BOT_TOKEN;
const uploadDir = path.join(__dirname, process.env.TEACHER_UPLOAD_DIR || "teacher_uploads");

// Telegram botni webhook bilan ishga tushiramiz
const bot = new TelegramBot(token);
bot.setWebHook(`${process.env.WEBHOOK_URL}/teacher_bot/webhook`);

// Upload papkasi mavjudligini tekshirish
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// ====== Foydalanuvchilarni saqlash ======
const teachersFile = path.join(__dirname, "teachers.json");
let teachers = [];

// Fayl mavjud bo‘lsa yuklab olish
if (fs.existsSync(teachersFile)) {
  teachers = JSON.parse(fs.readFileSync(teachersFile, "utf-8"));
}

// Foydalanuvchi qo‘shish yoki yangilash funksiyasi
function addOrUpdateTeacher(msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "";
  const lastName = msg.from.last_name || "";
  const now = new Date().toISOString();

  const index = teachers.findIndex((t) => t.chatId === chatId);
  if (index !== -1) {
    teachers[index] = { chatId, firstName, lastName, lastStart: now };
  } else {
    teachers.push({ chatId, firstName, lastName, joinedAt: now, lastStart: now });
  }

  fs.writeFileSync(teachersFile, JSON.stringify(teachers, null, 2));
}

// ====== Jadvalni yuborish ======
function sendTeacherSchedule(chatId, teacherName) {
  if (!fs.existsSync(uploadDir)) {
    bot.sendMessage(chatId, `❌ ${teacherName} uchun papka topilmadi.`);
    return;
  }

  const files = fs.readdirSync(uploadDir);
  const foundFile = files.find((file) =>
    file.toLowerCase().includes(teacherName.toLowerCase())
  );

  if (foundFile) {
    const filePath = path.join(uploadDir, foundFile);
    bot.sendPhoto(chatId, fs.createReadStream(filePath), {
      caption: `${teacherName} dars jadvali 📅`,
    });
  } else {
    bot.sendMessage(chatId, `❌ ${teacherName} uchun jadval topilmadi.`);
  }
}

// ====== Webhook ======
export const teacherBotApp = express.Router();
teacherBotApp.use(express.json());

teacherBotApp.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====== /start buyrug‘i ======
bot.onText(/\/start/, (msg) => {
  addOrUpdateTeacher(msg);
  bot.sendMessage(
    msg.chat.id,
    "Assalomu alaykum, ustoz! 👩‍🏫\nIsm va familiyangizni yuboring (masalan: Aliyev Dilshod):"
  );
});

// ====== /stats komandasi ======
bot.onText(/\/stats/, (msg) => {
  bot.sendMessage(msg.chat.id, `Hozircha o‘qituvchilar soni: ${teachers.length}`);
});

// ====== Message handler ======
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith("/") || text.match(/\/\w+/)) return; // komandalarni tashlab ketamiz

  // Ism familiya qabul qilish
  const teacherName = text.trim();
  if (teacherName.length < 3) {
    bot.sendMessage(chatId, "❌ To‘liq ism familiya yuboring, masalan: Aliyev Dilshod.");
    return;
  }

  sendTeacherSchedule(chatId, teacherName);
});
