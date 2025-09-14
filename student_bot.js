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
bot.setWebHook(`${process.env.WEBHOOK_URL}/student_bot`);

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Foydalanuvchi holati
let userState = {}; // { chatId: { grade, class } }

// Start funksiyasi
function sendStart(chatId) {
  bot.sendMessage(
    chatId,
    "Assalomu alaykum! 📚\nDars jadvalini olish uchun sinfni tanlang:",
    {
      reply_markup: {
        keyboard: [
          ["1-sinf", "2-sinf", "3-sinf", "4-sinf"],
          ["5-sinf", "6-sinf", "7-sinf", "8-sinf"],
          ["9-sinf", "10-sinf", "11-sinf"],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

// Parallel variantlarni uploads papkasidan olish
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

// Jadvalni yuborish
function sendClassSchedule(chatId, selectedClass) {
  if (!fs.existsSync(uploadDir)) {
    bot.sendMessage(
      chatId,
      `❌ ${selectedClass} sinfi uchun rasm papkasi topilmadi.`
    );
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
    });
  } else {
    bot.sendMessage(
      chatId,
      `❌ ${selectedClass} sinfi uchun jadval topilmadi.`
    );
  }
}

// Express router
export const studentBotApp = express.Router();
studentBotApp.use(express.json());

studentBotApp.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Yagona message handler
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // /start yoki yangi foydalanuvchi
  if (!userState[chatId] || text === "/start") {
    userState[chatId] = {};
    return sendStart(chatId);
  }

  // Orqaga tugmasi
  if (text === "Orqaga") {
    if (userState[chatId]?.class) {
      const grade = userState[chatId].grade;
      const parallels = getParallels(grade);
      const buttonsInline = [
        parallels.map((p) => ({ text: p, callback_data: `parallel_${p}` })),
      ];
      bot.sendMessage(chatId, "Qaysi parallel?", {
        reply_markup: { inline_keyboard: buttonsInline },
      });
      delete userState[chatId].class;
      return;
    } else if (userState[chatId]?.grade) {
      delete userState[chatId].grade;
      return sendStart(chatId);
    }
  }

  // Sinf tanlash (reply keyboard)
  const match = text.match(/^(\d+)-sinf$/);
  if (match) {
    const selectedGrade = match[1];
    userState[chatId].grade = selectedGrade;

    const parallels = getParallels(selectedGrade);
    if (!parallels.length) {
      return bot.sendMessage(
        chatId,
        `❌ ${selectedGrade} sinfi uchun parallel topilmadi.`
      );
    }

    const buttonsInline = [
      parallels.map((p) => ({ text: p, callback_data: `parallel_${p}` })),
    ];
    return bot.sendMessage(chatId, "Qaysi parallel?", {
      reply_markup: { inline_keyboard: buttonsInline },
    });
  }

  // Parallel tanlash (reply keyboard)
  const parallelMatch = text.match(/^(\d+)(Green|Blue)$/);
  if (parallelMatch) {
    userState[chatId].class = text;
    return sendClassSchedule(chatId, text);
  }
});

// Callback query handler
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // Sinf tanlandi
  if (data.startsWith("class_")) {
    const selectedGrade = data.split("_")[1];
    userState[chatId].grade = selectedGrade;

    const parallels = getParallels(selectedGrade);
    if (!parallels.length)
      return bot.sendMessage(
        chatId,
        `❌ ${selectedGrade} sinfi uchun parallel topilmadi.`
      );

    const buttonsInline = [
      parallels.map((p) => ({ text: p, callback_data: `parallel_${p}` })),
    ];
    return bot.sendMessage(chatId, "Qaysi parallel?", {
      reply_markup: { inline_keyboard: buttonsInline },
    });
  }

  // Parallel tanlandi
  if (data.startsWith("parallel_")) {
    const selectedClass = data.split("_")[1];
    userState[chatId].class = selectedClass;
    sendClassSchedule(chatId, selectedClass);
  }

  bot.answerCallbackQuery(query.id);
});
