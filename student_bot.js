import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = "7998295848:AAEIFbTa5kLUpIbiLJvn_4mT_zBsFj3cBL8";
const bot = new TelegramBot(token, { polling: true });

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

// Inline sinf tanlash
function sendGradeSelection(chatId) {
  const inlineKeyboard = [];
  for (let i = 1; i <= 11; i++) {
    inlineKeyboard.push([{ text: `${i}-sinf`, callback_data: `class_${i}` }]);
  }
  bot.sendMessage(chatId, "Sinfni tanlang:", {
    reply_markup: {
      inline_keyboard: inlineKeyboard,
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

// Parallel variantlarni `uploads` papkasidagi fayllardan olish
function getParallels(selectedGrade) {
  const classDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(classDir)) return [];

  const files = fs.readdirSync(classDir);
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
  const classDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(classDir)) {
    bot.sendMessage(
      chatId,
      `❌ ${selectedClass} sinfi uchun rasm papkasi topilmadi.`
    );
    return;
  }

  const files = fs.readdirSync(classDir);
  const foundFile = files.find((file) =>
    file.toLowerCase().includes(selectedClass.toLowerCase())
  );

  if (foundFile) {
    const filePath = path.join(classDir, foundFile);
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
    const buttonsKeyboard = [parallels, ["Orqaga"]];

    bot.sendMessage(chatId, "Qaysi parallel?", {
      reply_markup: {
        inline_keyboard: buttonsInline,
        keyboard: buttonsKeyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
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
      const buttonsKeyboard = [parallels, ["Orqaga"]];

      bot.sendMessage(chatId, "Qaysi parallel?", {
        reply_markup: {
          inline_keyboard: buttonsInline,
          keyboard: buttonsKeyboard,
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      delete userState[chatId].class;
      return;
    } else if (userState[chatId]?.grade) {
      sendGradeSelection(chatId);
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
    const buttonsKeyboard = [parallels, ["Orqaga"]];

    bot.sendMessage(chatId, "Qaysi parallel?", {
      reply_markup: {
        inline_keyboard: buttonsInline,
        keyboard: buttonsKeyboard,
        resize_keyboard: true,
        one_time_keyboard: true,
      },
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
