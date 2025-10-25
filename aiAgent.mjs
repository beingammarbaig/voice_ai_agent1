// aiAgent.mjs
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai"; // Official Gemini SDK
import { bookMeeting } from "./calendar.mjs";

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const GEMINI_MODEL = "gemini-2.5-flash"; // You can change to latest model if available

/**
 * Calls Gemini to extract structured data (name and datetime)
 * @param {string} prompt - Full instruction prompt
 * @returns {Promise<string>} - JSON string
 */
async function callGemini(prompt) {
  try {
    const response = await ai.responses.create({
      model: GEMINI_MODEL,
      input: prompt,
    });

    // Gemini response can have nested structure, extract text
    let outputText = "";
    if (response.output && response.output.length > 0) {
      for (const item of response.output) {
        if (item.content && item.content.length > 0) {
          for (const block of item.content) {
            if (block.text) outputText += block.text;
          }
        }
      }
    }
    return outputText;
  } catch (error) {
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
}

// Step 1: Handle initial call (unchanged)
export async function handleCallWebhook(req, res) {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    "Hello! I'm your scheduling assistant. Please tell me your name and the day and time you'd like to book your meeting."
  );

  // Record user voice and auto-transcribe
  twiml.record({
    transcribe: true,
    transcribeCallback: "/process-speech", // Twilio calls this after transcribing
  });

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}

// Step 2: Handle Twilio transcription callback
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  // --- Structured Extraction Prompt ---
  const PROMPT_INSTRUCTION = `
You are a data extraction assistant.
Extract the person's full name and the meeting datetime from the text below.

Output MUST be a single, valid JSON object:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"
}

Text:
"${transcription}"
`;

  let meetingData;

  try {
    const geminiOutput = await callGemini(PROMPT_INSTRUCTION);

    // Remove possible code fences or extra characters
    const cleanedOutput = geminiOutput.trim().replace(/^```json\s*|```\s*$/g, "");
    console.log("🤖 Gemini raw output:", geminiOutput);
    console.log("🧹 Cleaned JSON:", cleanedOutput);

    meetingData = JSON.parse(cleanedOutput);

    // Validate fields
    if (!meetingData.name || !meetingData.datetime) {
      throw new Error("Missing 'name' or 'datetime' field in Gemini output");
    }

    console.log(`✅ Extracted Name: ${meetingData.name}`);
    console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);
  } catch (err) {
    console.error("❌ Data extraction or parsing failed, using fallback:", err.message);
    // Fallback
    meetingData = {
      name: "Fallback User",
      datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // Book the meeting in Google Calendar
  await bookMeeting(meetingData.name, meetingData.datetime);

  // Respond via Twilio
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    `Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`
  );
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
