const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;

const IMAGES_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use("/images", express.static(IMAGES_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

app.get("/", (req, res) => {
  res.json({
    message: "Image Storage Server",
    status: "running",
    totalImages: fs.readdirSync(IMAGES_DIR).length,
  });
});

app.post("/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/images/${req.file.filename}`;
    
    res.json({
      success: true,
      filename: req.file.filename,
      url: imageUrl,
      path: `/images/${req.file.filename}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/upload-base64", (req, res) => {
  try {
    const { image, filename } = req.body;

    if (!image) {
      return res.status(400).json({ success: false, error: "No image data provided" });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const ext = image.match(/^data:image\/(\w+);base64,/)?.[1] || "png";
    const finalFilename = filename || `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    
    const filepath = path.join(IMAGES_DIR, finalFilename);
    fs.writeFileSync(filepath, buffer);

    const imageUrl = `${req.protocol}://${req.get("host")}/images/${finalFilename}`;

    res.json({
      success: true,
      filename: finalFilename,
      url: imageUrl,
      path: `/images/${finalFilename}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/upload-url", async (req, res) => {
  try {
    const { url, filename } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: "No URL provided" });
    }

    const response = await axios.get(url, { responseType: "arraybuffer" });

    const ext = path.extname(new URL(url).pathname) || ".jpg";
    const finalFilename = filename || `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
    
    const filepath = path.join(IMAGES_DIR, finalFilename);
    fs.writeFileSync(filepath, response.data);

    const imageUrl = `${req.protocol}://${req.get("host")}/images/${finalFilename}`;

    res.json({
      success: true,
      filename: finalFilename,
      url: imageUrl,
      path: `/images/${finalFilename}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/images/:filename", (req, res) => {
  const filepath = path.join(IMAGES_DIR, req.params.filename);
  
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ success: false, error: "Image not found" });
  }

  res.sendFile(filepath);
});

app.delete("/images/:filename", (req, res) => {
  try {
    const filepath = path.join(IMAGES_DIR, req.params.filename);
    
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: "Image not found" });
    }

    fs.unlinkSync(filepath);
    res.json({ success: true, message: "Image deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/list", (req, res) => {
  try {
    const files = fs.readdirSync(IMAGES_DIR);
    const images = files.map((file) => ({
      filename: file,
      url: `${req.protocol}://${req.get("host")}/images/${file}`,
      path: `/images/${file}`,
      size: fs.statSync(path.join(IMAGES_DIR, file)).size,
    }));

    res.json({ success: true, count: images.length, images });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🖼️  Image Storage Server running on http://localhost:${PORT}`);
  console.log(`📁 Images stored in: ${IMAGES_DIR}`);
  console.log(`🌐 Access images at: http://localhost:${PORT}/images/{filename}`);
});
