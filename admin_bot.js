// admin_bot.js
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== Bot tokeni va upload papkasi .env dan ====
const token = process.env.ADMIN_BOT_TOKEN;
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || "uploads");
const usersFile = path.join(__dirname, "users.json"); // foydalanuvchilar saqlanadigan fayl

// Telegram botni webhook bilan ishga tushiramiz
const bot = new TelegramBot(token);
bot.setWebHook(`${process.env.WEBHOOK_URL}/admin_bot/webhook`);

// Upload papkasi mavjudligini tekshirish
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Foydalanuvchilarni saqlash
let users = {};
if (fs.existsSync(usersFile)) {
  try {
    users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  } catch (err) {
    console.error("users.json o'qishda xato:", err);
  }
}

// Admin state
const adminStates = {};

// === Doimiy pastki tugmalar ===
function mainKeyboard() {
  return {
    keyboard: [["Sinf qo'shish", "Sinflar ro'yxati"]],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

// Foydalanuvchi saqlash funksiyasi
function saveUser(msg) {
  const chatId = msg.chat.id;
  const firstName = msg.chat.first_name || "";
  const lastName = msg.chat.last_name || "";

  users[chatId] = { firstName, lastName }; // mavjud bo'lsa yangilaydi, yo'q bo'lsa qo'shadi
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf8");
}

// Inline tugmalar bilan mavjud sinflarni ko‘rsatish
async function showClassList(chatId) {
  const files = fs.readdirSync(uploadDir).filter((f) => !f.startsWith("."));
  if (!files.length) {
    return bot.sendMessage(chatId, "❌ Hali hech qanday sinf mavjud emas.", {
      reply_markup: mainKeyboard(),
    });
  }

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

// Express router yaratamiz (webhook uchun)
export const adminBotApp = express.Router();
adminBotApp.use(express.json());

adminBotApp.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// /start buyrug‘i
bot.onText(/\/start/, (msg) => {
  saveUser(msg); // foydalanuvchini saqlash
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "📌 Admin panelga xush kelibsiz!\n\nPastdagi tugmalardan foydalaning:",
    { reply_markup: mainKeyboard() }
  );
});

// Message listener
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = adminStates[chatId];

  saveUser(msg); // har safar message kelganda foydalanuvchi saqlansin

  if (!state) {
    if (text === "Sinf qo'shish") {
      adminStates[chatId] = { step: "awaiting_class" };
      return bot.sendMessage(
        chatId,
        "✏️ Yangi sinf nomini kiriting (masalan: 5A, 6B):",
        { reply_markup: mainKeyboard() }
      );
    }

    if (text === "Sinflar ro'yxati") {
      return showClassList(chatId);
    }

    return;
  }

  // Orqaga tugmasi
  if (text === "Orqaga") {
    delete adminStates[chatId];
    return bot.sendMessage(chatId, "📌 Asosiy menyu:", {
      reply_markup: mainKeyboard(),
    });
  }

  // Yangi sinf qo‘shish
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

  // Rasm qabul qilish
  if (state.step === "awaiting_image" && msg.photo) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(photoId);
    const filePath = file.file_path;
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const ext = path.extname(filePath) || ".jpg";
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
      .catch((err) => {
        console.error("❌ Yuklab olishda xato:", err);
        bot.sendMessage(chatId, "❌ Rasmni yuklab bo‘lmadi.", {
          reply_markup: mainKeyboard(),
        });
      });
  }
});

// Callback query handler
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("view_")) {
    const className = data.split("_")[1];
    const files = fs.readdirSync(uploadDir);
    const fileName = files.find((f) => path.parse(f).name === className);
    if (!fileName)
      return bot.sendMessage(
        chatId,
        `❌ ${className} sinfi uchun jadval mavjud emas.`
      );

    const filePath = path.join(uploadDir, fileName);
    bot.sendPhoto(chatId, fs.createReadStream(filePath), {
      caption: `${className} sinfi jadvali`,
      reply_markup: mainKeyboard(),
    });
  }

  if (data.startsWith("delete_")) {
    const className = data.split("_")[1];
    const files = fs.readdirSync(uploadDir);
    const fileName = files.find((f) => path.parse(f).name === className);
    if (fileName) fs.unlinkSync(path.join(uploadDir, fileName));
    bot.sendMessage(chatId, `✅ ${className} sinfi o‘chirildi.`, {
      reply_markup: mainKeyboard(),
    });
    showClassList(chatId);
  }

  bot.answerCallbackQuery(query.id);
});
