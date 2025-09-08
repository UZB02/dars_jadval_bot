// index.js
import("./admin_bot.js")
  .then(() => console.log("✅ Admin bot ishga tushdi"))
  .catch((err) => console.error("❌ Admin botda xatolik:", err));

import("./student_bot.js")
  .then(() => console.log("✅ Student bot ishga tushdi"))
  .catch((err) => console.error("❌ Student botda xatolik:", err));

console.log("🚀 Ikkala bot ham ishga tushirilmoqda...");
