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

// ==== Bot token va papkalar ====
const token = process.env.ADMIN_BOT_TOKEN;
const classUploadDir = path.join(
  __dirname,
  process.env.UPLOAD_DIR || "uploads"
);
const teacherUploadDir = path.join(
  __dirname,
  process.env.TEACHER_UPLOAD_DIR || "teacher_uploads"
);
const usersFile = path.join(__dirname, "users.json");

// Telegram botni webhook bilan ishga tushiramiz
const bot = new TelegramBot(token);
bot.setWebHook(`${process.env.WEBHOOK_URL}/admin_bot/webhook`);

// Upload papkalari mavjud bo‘lishini ta’minlash
if (!fs.existsSync(classUploadDir)) fs.mkdirSync(classUploadDir);
if (!fs.existsSync(teacherUploadDir)) fs.mkdirSync(teacherUploadDir);

// Foydalanuvchilarni saqlash
let users = {};
if (fs.existsSync(usersFile)) {
  try {
    users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  } catch (err) {
    console.error("users.json o‘qishda xato:", err);
  }
}

// Admin state
const adminStates = {};

// === Doimiy menyu ===
function mainKeyboard() {
  return {
    keyboard: [
      ["Sinf qo'shish", "O‘qituvchi qo'shish"],
      ["Sinflar ro'yxati", "O‘qituvchilar ro'yxati"],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

// Foydalanuvchini saqlash
function saveUser(msg) {
  const chatId = msg.chat.id;
  const firstName = msg.chat.first_name || "";
  const lastName = msg.chat.last_name || "";

  users[chatId] = { firstName, lastName };
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf8");
}

// Jadval ro‘yxatini chiqarish (sinf yoki o‘qituvchi)
async function showList(chatId, type) {
  const dir = type === "class" ? classUploadDir : teacherUploadDir;
  const title = type === "class" ? "Sinf" : "O‘qituvchi";

  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  if (!files.length) {
    return bot.sendMessage(
      chatId,
      `❌ Hali hech qanday ${title} mavjud emas.`,
      {
        reply_markup: mainKeyboard(),
      }
    );
  }

  for (let file of files) {
    const name = path.parse(file).name;
    const inlineButtons = [
      { text: "Ko‘rish", callback_data: `view_${type}_${name}` },
      { text: "O‘chirish", callback_data: `delete_${type}_${name}` },
    ];

    bot.sendMessage(chatId, `📘 ${name}`, {
      reply_markup: { inline_keyboard: [inlineButtons] },
    });
  }
}

// ====== Webhook ======
export const adminBotApp = express.Router();
adminBotApp.use(express.json());

adminBotApp.post("/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====== /start ======
bot.onText(/\/start/, (msg) => {
  saveUser(msg);
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "📌 Admin panelga xush kelibsiz!\n\nKerakli menyuni tanlang:",
    { reply_markup: mainKeyboard() }
  );
});

// ====== Message handler ======
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = adminStates[chatId];

  saveUser(msg);

  if (!state) {
    if (text === "Sinf qo'shish") {
      adminStates[chatId] = { step: "awaiting_class" };
      return bot.sendMessage(
        chatId,
        "✏️ Yangi sinf nomini kiriting (masalan: 5A):"
      );
    }

    if (text === "O‘qituvchi qo'shish") {
      adminStates[chatId] = { step: "awaiting_teacher" };
      return bot.sendMessage(
        chatId,
        "✏️ O‘qituvchining to‘liq ismini kiriting (masalan: Aliyev Dilshod):"
      );
    }

    if (text === "Sinflar ro'yxati") return showList(chatId, "class");
    if (text === "O‘qituvchilar ro'yxati") return showList(chatId, "teacher");

    return;
  }

  // === Yangi sinf nomi qabul qilish ===
  if (state.step === "awaiting_class" && text) {
    adminStates[chatId] = {
      step: "awaiting_class_image",
      className: text.trim(),
    };
    return bot.sendMessage(
      chatId,
      `🖼 Endi ${text} sinfi uchun jadval rasmni yuboring:`
    );
  }

  // === Yangi o‘qituvchi ismi qabul qilish ===
  if (state.step === "awaiting_teacher" && text) {
    adminStates[chatId] = {
      step: "awaiting_teacher_image",
      teacherName: text.trim(),
    };
    return bot.sendMessage(
      chatId,
      `🖼 Endi ${text} uchun jadval rasmni yuboring:`
    );
  }

  // === Sinf rasm qabul qilish ===
  if (state.step === "awaiting_class_image" && msg.photo) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(photoId);
    const filePath = file.file_path;
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const ext = path.extname(filePath) || ".jpg";
    const fileName = `${state.className}${ext}`;
    const savePath = path.join(classUploadDir, fileName);

    fetch(url).then((res) => {
      const dest = fs.createWriteStream(savePath);
      res.body.pipe(dest);
      dest.on("finish", () => {
        bot.sendMessage(
          chatId,
          `✅ ${state.className} sinf jadvali saqlandi!`,
          { reply_markup: mainKeyboard() }
        );
        delete adminStates[chatId];
      });
    });
  }

  // === O‘qituvchi rasm qabul qilish ===
  if (state.step === "awaiting_teacher_image" && msg.photo) {
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    const file = await bot.getFile(photoId);
    const filePath = file.file_path;
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const ext = path.extname(filePath) || ".jpg";
    const fileName = `${state.teacherName}${ext}`;
    const savePath = path.join(teacherUploadDir, fileName);

    fetch(url).then((res) => {
      const dest = fs.createWriteStream(savePath);
      res.body.pipe(dest);
      dest.on("finish", () => {
        bot.sendMessage(chatId, `✅ ${state.teacherName} jadvali saqlandi!`, {
          reply_markup: mainKeyboard(),
        });
        delete adminStates[chatId];
      });
    });
  }
});

// ====== Callback handler ======
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // === Ko‘rish ===
  if (data.startsWith("view_")) {
    const [, type, name] = data.split("_");
    const dir = type === "class" ? classUploadDir : teacherUploadDir;
    const files = fs.readdirSync(dir);
    const fileName = files.find((f) => path.parse(f).name === name);
    if (!fileName)
      return bot.sendMessage(chatId, `❌ ${name} uchun jadval mavjud emas.`);
    const filePath = path.join(dir, fileName);
    bot.sendPhoto(chatId, fs.createReadStream(filePath), {
      caption: `${name} jadvali 📅`,
    });
  }

  // === O‘chirish ===
  if (data.startsWith("delete_")) {
    const [, type, name] = data.split("_");
    const dir = type === "class" ? classUploadDir : teacherUploadDir;
    const files = fs.readdirSync(dir);
    const fileName = files.find((f) => path.parse(f).name === name);
    if (fileName) fs.unlinkSync(path.join(dir, fileName));
    bot.sendMessage(chatId, `✅ ${name} o‘chirildi.`, {
      reply_markup: mainKeyboard(),
    });
    showList(chatId, type);
  }

  bot.answerCallbackQuery(query.id);
});
