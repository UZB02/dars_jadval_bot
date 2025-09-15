// student_bot.js
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.STUDENT_BOT_TOKEN;
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || "uploads");

// Telegram botni webhook bilan ishga tushiramiz
const bot = new TelegramBot(token);
bot.setWebHook(`${process.env.WEBHOOK_URL}/student_bot/webhook`);

// Upload papkasi mavjudligini tekshirish
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Foydalanuvchi holatini saqlash
const userState = {}; // { chatId: { grade, class } }

// ====== Foydalanuvchilarni saqlash ======
const usersFile = path.join(__dirname, "users.json");
let users = [];

// Fayl mavjud bo'lsa yuklab olish
if (fs.existsSync(usersFile)) {
  users = JSON.parse(fs.readFileSync(usersFile, "utf-8"));
}

// Foydalanuvchi qo‘shish yoki yangilash funksiyasi
function addOrUpdateUser(msg) {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "";
  const lastName = msg.from.last_name || "";
  const now = new Date().toISOString();

  const index = users.findIndex(u => u.chatId === chatId);
  if (index !== -1) {
    // Foydalanuvchi mavjud, yangilash
    users[index] = { 
      chatId, 
      firstName, 
      lastName, 
      lastStart: now 
    };
  } else {
    // Yangi foydalanuvchi qo‘shish
    users.push({ 
      chatId, 
      firstName, 
      lastName, 
      joinedAt: now, 
      lastStart: now 
    });
  }

  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// ====== Tugmalar ======
function startKeyboard() {
  return {
    keyboard: [
      ["1-sinf", "2-sinf", "3-sinf", "4-sinf"],
      ["5-sinf", "6-sinf", "7-sinf", "8-sinf"],
      ["9-sinf", "10-sinf", "11-sinf"],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function backKeyboard() {
  return {
    keyboard: [["Orqaga"]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

// ====== Start funksiyasi ======
function sendStart(chatId) {
  userState[chatId] = {}; // foydalanuvchi holatini boshlash
  bot.sendMessage(
    chatId,
    "Assalomu alaykum! 📚\nDars jadvalini olish uchun sinfni tanlang:",
    { reply_markup: startKeyboard() }
  );
}

// ====== Parallel variantlarni olish ======
function getParallels(selectedGrade) {
  if (!fs.existsSync(uploadDir)) return [];
  const files = fs.readdirSync(uploadDir);
  const parallelsSet = new Set();

  files.forEach((file) => {
    if (file.toLowerCase().includes(selectedGrade.toLowerCase())) {
      const match = file.match(new RegExp(`${selectedGrade}(\\w+)`, "i"));
      if (match) {
        const parallel = `${selectedGrade}${
          match[1].charAt(0).toUpperCase() + match[1].slice(1)
        }`;
        parallelsSet.add(parallel);
      }
    }
  });

  return Array.from(parallelsSet);
}

// ====== Jadvalni yuborish ======
function sendClassSchedule(chatId, selectedClass) {
  if (!fs.existsSync(uploadDir)) {
    bot.sendMessage(chatId, `❌ ${selectedClass} sinfi uchun papka topilmadi.`);
    return;
  }

  const files = fs.readdirSync(uploadDir);
  const foundFile = files.find((file) =>
    file.toLowerCase().includes(selectedClass.toLowerCase())
  );

  if (foundFile) {
    const filePath = path.join(uploadDir, foundFile);
    bot.sendPhoto(chatId, fs.createReadStream(filePath), {
      caption: `${selectedClass} sinfi dars jadvali 📅`,
      reply_markup: backKeyboard(),
    });
  } else {
    bot.sendMessage(
      chatId,
      `❌ ${selectedClass} sinfi uchun jadval topilmadi.`,
      { reply_markup: backKeyboard() }
    );
  }
}

// ====== Webhook ======
export const studentBotApp = express.Router();
studentBotApp.use(express.json());

studentBotApp.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====== /start buyrug‘i ======
bot.onText(/\/start/, (msg) => {
  addOrUpdateUser(msg); // foydalanuvchi saqlash/yangilash
  sendStart(msg.chat.id);
});

// ====== /stats komandasi ======
bot.onText(/\/stats/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Hozircha foydalanuvchilar soni: ${users.length}`);
});

// ====== Callback query handler (inline tugmalar) ======
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("parallel_")) {
    const selectedClass = data.split("_")[1];
    userState[chatId].class = selectedClass;
    sendClassSchedule(chatId, selectedClass);
  }

  bot.answerCallbackQuery(query.id);
});

// ====== Message handler (reply keyboard) ======
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "/start") return; // /start alohida ishlaydi

  // Orqaga tugmasi
  if (text === "Orqaga") {
    if (userState[chatId]?.class) {
      const grade = userState[chatId].grade;
      const parallels = getParallels(grade);
      if (parallels.length > 0) {
        const buttonsInline = [
          parallels.map((p) => ({ text: p, callback_data: `parallel_${p}` })),
        ];
        bot.sendMessage(chatId, "Qaysi parallel?", {
          reply_markup: { inline_keyboard: buttonsInline },
        });
      } else {
        sendStart(chatId);
      }
      delete userState[chatId].class;
      return;
    } else if (userState[chatId]?.grade) {
      sendStart(chatId);
      delete userState[chatId].grade;
      return;
    }
  }

  // Sinf tanlash (reply keyboard)
  const match = text.match(/^(\d+)-sinf$/);
  if (match) {
    const selectedGrade = match[1];
    userState[chatId].grade = selectedGrade;

    const parallels = getParallels(selectedGrade);
    if (parallels.length === 0) {
      bot.sendMessage(
        chatId,
        `❌ ${selectedGrade} sinfi uchun parallel topilmadi.`,
        { reply_markup: backKeyboard() }
      );
      return;
    }

    const buttonsInline = [
      parallels.map((p) => ({ text: p, callback_data: `parallel_${p}` })),
    ];
    bot.sendMessage(chatId, "Qaysi parallel?", {
      reply_markup: { inline_keyboard: buttonsInline },
    });
    return;
  }

  // Parallel tanlash (reply keyboard)
  const parallelMatch = text.match(/^(\d+)(\w+)$/);
  if (parallelMatch) {
    userState[chatId].class = text;
    sendClassSchedule(chatId, text);
    return;
  }
});
