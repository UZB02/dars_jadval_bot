import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import cors from "cors";


const app = express();
app.use(cors()); // 🔹 Shu qator CORS ruxsat beradi
const PORT = process.env.PORT || 3000;
const usersFile = path.join(process.cwd(), "users.json");

app.use(express.static("public"));

// Foydalanuvchilarni qaytaruvchi endpoint
app.get("/api/users", (req, res) => {
  if (!fs.existsSync(usersFile)) return res.json([]);
  try {
    const data = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const usersArray = Object.entries(data).map(([chatId, user]) => ({
      chatId,
      firstName: user.firstName,
      lastName: user.lastName,
      startCount: user.startCount || 0,
    }));
    res.json(usersArray);
  } catch (err) {
    console.error("users.json o'qishda xato:", err);
    res.status(500).json({ error: "Foydalanuvchilarni olishda xato" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
