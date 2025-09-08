import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.STUDENT_BOT_TOKEN;
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || "uploads");
const bot = new TelegramBot(token, { polling: true });

// Upload papkasi mavjudligini tekshirish
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Foydalanuvchi holatini saqlash
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

// Parallel variantlarni `uploads` papkasidagi fayllardan olish
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

// Jadvalni yuborish funksiyasi
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

// Foydalanuvchi birinchi marta kirsa start
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (!userState[chatId]) {
    userState[chatId] = {};
    sendStart(chatId);
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
    if (parallels.length === 0) {
      bot.sendMessage(
        chatId,
        `❌ ${selectedGrade} sinfi uchun parallel topilmadi.`
      );
      return;
    }

    const buttonsInline = [
      parallels.map((p) => ({ text: p, callback_data: `parallel_${p}` })),
    ];

    bot.sendMessage(chatId, "Qaysi parallel?", {
      reply_markup: { inline_keyboard: buttonsInline },
    });
  }

  // Parallel tanlandi
  else if (data.startsWith("parallel_")) {
    const selectedClass = data.split("_")[1];
    userState[chatId].class = selectedClass;
    sendClassSchedule(chatId, selectedClass);
  }

  bot.answerCallbackQuery(query.id);
});

// Reply keyboard handler
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

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
        `❌ ${selectedGrade} sinfi uchun parallel topilmadi.`
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
  const parallelMatch = text.match(/^(\d+)(Green|Blue)$/);
  if (parallelMatch) {
    userState[chatId].class = text;
    sendClassSchedule(chatId, text);
    return;
  }
});