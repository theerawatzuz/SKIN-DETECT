require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const app = express();
app.use(bodyParser.json());

// ตั้งค่า Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

async function cleanGeminiResponse(responseText) {
  try {
    // ลบ markdown code blocks และ newlines
    const cleanText = responseText.replace(/```json\n|\n```\n?/g, "");

    // แปลงเป็น JSON object
    const jsonData = JSON.parse(cleanText);

    return jsonData;
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการ clean data:", error);
    throw new Error("ไม่สามารถแปลงข้อมูลเป็น JSON ได้");
  }
}

async function analyzeImage(imageUrl) {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0,
      topP: 1,
      topK: 1,
      maxOutputTokens: 1024,
    },
  });

  // ดึงข้อมูลรูปภาพจาก URL
  const imageResponse = await fetch(imageUrl);
  const imageData = await imageResponse.arrayBuffer();

  // แปลงข้อมูลรูปภาพให้อยู่ในรูปแบบที่ Gemini ต้องการ
  const imageParts = {
    inlineData: {
      data: Buffer.from(imageData).toString("base64"),
      mimeType: imageResponse.headers.get("content-type"),
    },
  };

  // สร้าง prompt
  const prompt = `
Analyze the person's skin tone and provide recommendations in JSON format. Return ONLY valid JSON data without any markdown formatting or additional text.

DO NOT:
- Include any explanatory text
- Add markdown formatting
- Suggest more than 5 colors
- Include colors that clash with the skin tone
- Return invalid JSON format

  {
    "skinTone": {
      "type": "Fitzpatrick Type",
      "hexCode": "#HEX"
    },
    "recommendedColors": [
      {
        "name": "color name",
        "hexCode": "#HEX"
      }
    ]
  }
  Provide exactly 5 recommended colors. Return only valid JSON without any additional text.
  `;

  // วิเคราะห์ภาพ
  const result = await model.generateContent([prompt, imageParts]);
  const response = await result.response;

  // เพิ่มขั้นตอน clean data
  const cleanedData = await cleanGeminiResponse(response.text());
  return cleanedData;
}

app.post("/api/analyze-image", async (req, res) => {
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "ต้องระบุ URL ของรูปภาพ" });
  }

  try {
    const analysis = await analyzeImage(imageUrl);
    res.json({
      analysis: analysis,
      imageUrl: imageUrl,
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการวิเคราะห์ภาพ:", error);
    res.status(500).json({
      error: "ไม่สามารถวิเคราะห์ภาพได้",
      details: error.message,
    });
  }
});

// ฟังก์ชันสร้าง presigned URL
async function generatePresignedUrl(fileName) {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileName,
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 นาที
    return url;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw error;
  }
}

app.post("/api/get-upload-url", async (req, res) => {
  const { fileName } = req.body;

  if (!fileName) {
    return res.status(400).json({
      error: "กรุณาระบุชื่อไฟล์",
    });
  }

  try {
    const uploadUrl = await generatePresignedUrl(fileName);
    res.json({
      uploadUrl: uploadUrl,
      fileName: fileName,
      image_url: `${process.env.AWS_BUCKET_URL}/${fileName}`,
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการสร้าง URL:", error);
    res.status(500).json({
      error: "ไม่สามารถสร้าง upload URL ได้",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`เซิร์ฟเวอร์ทำงานที่ http://localhost:${PORT}`);
});
