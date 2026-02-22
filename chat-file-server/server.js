import express from "express";
import fileUpload from "express-fileupload";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";

const app = express();
app.use(cors());
app.use(fileUpload());

// 🔑 Твой Service Role Key
const supabase = createClient(
  "https://zrzvdcjfieymqhvxzwca.supabase.co", // Project URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyenZkY2pmaWV5bXFodnh6d2NhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MzcxNiwiZXhwIjoyMDg3MzI5NzE2fQ.gL8RnAc_Ye41f5vZIGQQBkQtPlMlPDGoZtkEE4xvNlk"// Service role ключ
);

// Загружаем файл
app.post("/upload", async (req, res) => {
  if (!req.files || !req.files.file) return res.status(400).send("No file uploaded");

  const file = req.files.file;

  // безопасное имя файла
  const safeFileName = `${Date.now()}_${file.name}`
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "_");

  const { data, error } = await supabase
    .storage
    .from("chat-files")   // Имя bucket
    .upload(safeFileName, file.data);

  if (error) return res.status(500).send(error.message);

  const { publicUrl } = supabase
    .storage
    .from("chat-files")
    .getPublicUrl(safeFileName);

  res.json({ url: publicUrl });
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));