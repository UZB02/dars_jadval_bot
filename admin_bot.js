// admin_bot.js
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== MongoDB ulanish ====
mongoose
  .connect("mongodb://127.0.0.1:27017/schoolBot", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB ulandi (Admin Bot)"))
  .catch((err) => console.error("❌ MongoDB ulanish xatosi:", err));

// ==== MongoDB Schema ====
const classSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  schedule: { type: String }, // endi faqat bitta rasm yo‘li
});
const ClassModel = mongoose.model("Class", classSchema);

// ==== Bot ====
const token = "8426561809:AAG7EeGTlKZB5kUGRghPb4FU5OgQqaDo4Gs";
const bot = new TelegramBot(token, { polling: true });

// Fayl yo‘llari
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

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

// /start buyrug‘i
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "📌 Admin panelga xush kelibsiz!\n\nPastdagi tugmalardan foydalaning:",
    { reply_markup: mainKeyboard() }
  );
});

// Inline tugmalar bilan mavjud sinflarni ko‘rsatish
async function showClassList(chatId) {
  const classes = await ClassModel.find();
  if (!classes.length) {
    return bot.sendMessage(chatId, "❌ Hali hech qanday sinf mavjud emas.", {
      reply_markup: mainKeyboard(),
    });
  }

  for (let cls of classes) {
    const inlineButtons = [
      { text: "Ko‘rish", callback_data: `view_${cls.name}` },
      { text: "Tahrirlash", callback_data: `edit_${cls.name}` },
      { text: "O‘chirish", callback_data: `delete_${cls.name}` },
    ];

    bot.sendMessage(chatId, `📘 ${cls.name}`, {
      reply_markup: { inline_keyboard: [inlineButtons] },
    });
  }
}

// === Bitta message listener ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = adminStates[chatId];

  // === State bo‘lmasa: asosiy tugmalar ===
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

  // === Orqaga tugmasi ===
  if (text === "Orqaga") {
    delete adminStates[chatId];
    return bot.sendMessage(chatId, "📌 Asosiy menyu:", {
      reply_markup: mainKeyboard(),
    });
  }

  // === Yangi sinf qo‘shish ===
  if (state.step === "awaiting_class" && text) {
    const className = text.trim();
    const exists = await ClassModel.findOne({ name: className });
    if (exists) {
      delete adminStates[chatId];
      return bot.sendMessage(chatId, "❌ Bu sinf allaqachon mavjud.", {
        reply_markup: mainKeyboard(),
      });
    }

    await ClassModel.create({ name: className, schedule: "" });
    adminStates[chatId] = { step: "awaiting_image", className };
    return bot.sendMessage(
      chatId,
      `🖼 Endi ${className} sinfi uchun jadval rasmni yuboring:`,
      { reply_markup: mainKeyboard() }
    );
  }

  // === Tahrirlash nomini qabul qilish ===
  if (state.step === "edit_class" && text) {
    const oldName = state.oldName;
    const exists = await ClassModel.findOne({ name: text.trim() });
    if (exists) {
      return bot.sendMessage(
        chatId,
        "❌ Bunday nomli sinf allaqachon mavjud.",
        { reply_markup: mainKeyboard() }
      );
    }

    const cls = await ClassModel.findOne({ name: oldName });
    if (!cls)
      return bot.sendMessage(chatId, "❌ Sinf topilmadi.", {
        reply_markup: mainKeyboard(),
      });

    cls.name = text.trim();
    await cls.save();
    bot.sendMessage(chatId, `✅ Sinf nomi yangilandi: ${cls.name}`, {
      reply_markup: mainKeyboard(),
    });
    delete adminStates[chatId];

    return showClassList(chatId);
  }

  // === Rasm qabul qilish ===
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

        dest.on("finish", async () => {
          const cls = await ClassModel.findOne({ name: state.className });
          cls.schedule = savePath; // endi faqat bitta rasm
          await cls.save();

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

// === Callback query handler ===
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const state = adminStates[chatId] || {};

  // === Sinfni ko‘rsatish ===
  if (data.startsWith("view_")) {
    const className = data.split("_")[1];
    const cls = await ClassModel.findOne({ name: className });
    if (!cls)
      return bot.sendMessage(chatId, "❌ Sinf topilmadi.", {
        reply_markup: mainKeyboard(),
      });

    if (!cls.schedule || !fs.existsSync(cls.schedule)) {
      return bot.sendMessage(
        chatId,
        `❌ ${className} sinfi uchun hali jadval mavjud emas.`,
        { reply_markup: mainKeyboard() }
      );
    }

    bot.sendPhoto(chatId, fs.createReadStream(cls.schedule), {
      caption: `${className} sinfi jadvali`,
      reply_markup: mainKeyboard(),
    });
  }

  // === Sinfni tahrirlash ===
  if (data.startsWith("edit_")) {
    const className = data.split("_")[1];
    adminStates[chatId] = { step: "edit_class", oldName: className };
    bot.sendMessage(
      chatId,
      `✏️ ${className} nomini yangilash uchun yangi nomni kiriting:`,
      { reply_markup: mainKeyboard() }
    );
  }

  // === Sinfni o‘chirish ===
  if (data.startsWith("delete_")) {
    const className = data.split("_")[1];
    const cls = await ClassModel.findOne({ name: className });
    if (!cls)
      return bot.sendMessage(chatId, "❌ Sinf topilmadi.", {
        reply_markup: mainKeyboard(),
      });

    if (cls.schedule && fs.existsSync(cls.schedule))
      fs.unlinkSync(cls.schedule);
    await cls.deleteOne();
    bot.sendMessage(chatId, `✅ ${className} sinfi o‘chirildi.`, {
      reply_markup: mainKeyboard(),
    });
    showClassList(chatId);
  }

  // === Orqaga tugmasi ===
  if (data === "back_to_main" || data === "back_to_class") {
    bot.sendMessage(chatId, "📌 Asosiy menyu:", {
      reply_markup: mainKeyboard(),
    });
  }

  bot.answerCallbackQuery(query.id);
});
