require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");
const { PromptTemplate } = require("@langchain/core/prompts");
const { LLMChain } = require("langchain/chains");

const app = express();

// Middleware
app.use(bodyParser.json());

// LangChain Configuration
const chat = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0.7,
  modelName: "gpt-3.5-turbo",
});

// สร้าง prompt template
const promptTemplate = new PromptTemplate({
  template: "คุณเป็นผู้ช่วยที่เป็นมิตร ตอบคำถามต่อไปนี้: {question}",
  inputVariables: ["question"],
});

// สร้าง chain
const chain = new LLMChain({
  llm: chat,
  prompt: promptTemplate,
});

app.get("/", (req, res) => {
  res.send("ChatGPT API with LangChain is running!");
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    // ใช้ chain เพื่อสร้างการตอบกลับ
    const response = await chain.call({
      question: message,
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error("Error communicating with LangChain:", error.message);
    res.status(500).json({
      error: "Failed to get a response",
    });
  }
});

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
