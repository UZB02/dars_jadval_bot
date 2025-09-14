import TelegramBot from "node-telegram-bot-api";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.ADMIN_BOT_TOKEN;
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || "uploads");

// Telegram botni webhook bilan ishga tushiramiz
const bot = new TelegramBot(token);
bot.setWebHook(`${process.env.WEBHOOK_URL}/admin_bot`);

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Admin state
const adminStates = {};

function mainKeyboard() {
  return {
    keyboard: [["Sinf qo'shish", "Sinflar ro'yxati"]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

// Show class list
async function showClassList(chatId) {
  const files = fs.readdirSync(uploadDir).filter((f) => !f.startsWith("."));
  if (!files.length)
    return bot.sendMessage(chatId, "❌ Hali hech qanday sinf mavjud emas.", {
      reply_markup: mainKeyboard(),
    });

  for (let file of files) {
    const className = path.parse(file).name;
    const inlineButtons = [
      { text: "Ko‘rish", callback_data: `view_${className}` },
      { text: "O‘chirish", callback_data: `delete_${className}` },
    ];
    bot.sendMessage(chatId, `📘 ${className}`, {
      reply_markup: { inline_keyboard: [inlineButtons] },
    });
  }
}

// Express router
export const adminBotApp = express.Router();
adminBotApp.use(express.json());
adminBotApp.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Yagona message handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = adminStates[chatId];

  // Yangi foydalanuvchi yoki /start
  if (!state || text === "/start") {
    adminStates[chatId] = {};
    return bot.sendMessage(
      chatId,
      "📌 Admin panelga xush kelibsiz!\n\nPastdagi tugmalardan foydalaning:",
      { reply_markup: mainKeyboard() }
    );
  }

  // Orqaga tugmasi
  if (text === "Orqaga") {
    delete adminStates[chatId];
    return bot.sendMessage(chatId, "📌 Asosiy menyu:", {
      reply_markup: mainKeyboard(),
    });
  }

  // Sinf qo'shish
  if (state.step === "awaiting_class" && text) {
    const className = text.trim();
    const existingFile = fs
      .readdirSync(uploadDir)
      .find((f) => path.parse(f).name === className);
    if (existingFile) {
      delete adminStates[chatId];
      return bot.sendMessage(chatId, "❌ Bu sinf allaqachon mavjud.", {
        reply_markup: mainKeyboard(),
      });
    }
    adminStates[chatId] = { step: "awaiting_image", className };
    return bot.sendMessage(
      chatId,
      `🖼 Endi ${className} sinfi uchun jadval rasmni yuboring:`,
      { reply_markup: mainKeyboard() }
    );
  }

  // Message bilan step boshqarish
  if (text === "Sinf qo'shish") {
    adminStates[chatId] = { step: "awaiting_class" };
    return bot.sendMessage(
      chatId,
      "✏️ Yangi sinf nomini kiriting (masalan: 5A, 6B):",
      { reply_markup: mainKeyboard() }
    );
  }

  if (text === "Sinflar ro'yxati") return showClassList(chatId);

  // Rasm qabul qilish
  if (state?.step === "awaiting_image" && msg.photo) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(photoId);
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const ext = path.extname(file.file_path) || ".jpg";
    const fileName = `${state.className}${ext}`;
    const savePath = path.join(uploadDir, fileName);

    fetch(url)
      .then((res) => {
        const dest = fs.createWriteStream(savePath);
        res.body.pipe(dest);
        dest.on("finish", () => {
          bot.sendMessage(
            chatId,
            `✅ ${state.className} jadval rasm saqlandi!`,
            { reply_markup: mainKeyboard() }
          );
          delete adminStates[chatId];
        });
      })
      .catch((err) =>
        bot.sendMessage(chatId, "❌ Rasmni yuklab bo‘lmadi.", {
          reply_markup: mainKeyboard(),
        })
      );
  }
});

// Callback query
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("view_")) {
    const className = data.split("_")[1];
    const fileName = fs
      .readdirSync(uploadDir)
      .find((f) => path.parse(f).name === className);
    if (!fileName)
      return bot.sendMessage(
        chatId,
        `❌ ${className} sinfi uchun jadval mavjud emas.`
      );
    bot.sendPhoto(chatId, fs.createReadStream(path.join(uploadDir, fileName)), {
      caption: `${className} sinfi jadvali`,
      reply_markup: mainKeyboard(),
    });
  }

  if (data.startsWith("delete_")) {
    const className = data.split("_")[1];
    const fileName = fs
      .readdirSync(uploadDir)
      .find((f) => path.parse(f).name === className);
    if (fileName) fs.unlinkSync(path.join(uploadDir, fileName));
    bot.sendMessage(chatId, `✅ ${className} sinfi o‘chirildi.`, {
      reply_markup: mainKeyboard(),
    });
    showClassList(chatId);
  }

  bot.answerCallbackQuery(query.id);
});
