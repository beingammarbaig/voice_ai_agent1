// aiAgent.mjs (Updated)
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai"; // New SDK
import { bookMeeting } from "./calendar.mjs";

// Initialize the GoogleGenAI client (will auto-detect GEMINI_API_KEY)
const ai = new GoogleGenAI();
const GEMINI_MODEL = "gemini-2.5-flash"; 

/**
 * Calls Gemini to extract structured data (name and datetime).
 * @param {string} prompt - The full instruction prompt for the model.
 * @returns {Promise<string>} The raw JSON output string from Gemini.
 */
async function callGemini(prompt) {
  try {
    const response = await ai.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0,
        maxOutputTokens: 200,
      },
    });

    // The raw text output contains the JSON string
    return response.text;
  } catch (error) {
    // Re-throw errors from the API call itself (like ENOTFOUND, 403, 429)
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
}

// Step 1: Handle initial call (no change)
export async function handleCallWebhook(req, res) {
  // ... (unchanged Twilio logic)
}

// Step 2: Handle Twilio transcription callback (Updated logic for extraction)
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  // --- Start of Structured Extraction Logic ---
  const PROMPT_INSTRUCTION = `
You are a reliable data extraction agent.
Your task is to extract the person's full name and the specified meeting date and time from the provided user text.

The output MUST be a single, valid JSON object with two fields:
1. "name": The extracted person's full name (e.g., "Ammar").
2. "datetime": The extracted datetime in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). Assume the current date for the year and month if not provided, and today's year if only month/day is provided.

USER TEXT:
"${transcription}"

JSON OUTPUT:
`;
  
  let meetingData;
  try {
    const geminiOutput = await callGemini(PROMPT_INSTRUCTION);
    
    // Clean up and ensure the output is pure JSON before parsing
    // Gemini sometimes wraps JSON in code fences (```json...)
    const cleanedOutput = geminiOutput.trim().replace(/^```json\s*|```\s*$/g, '');
    
    console.log("🤖 Gemini raw output:", geminiOutput);
    console.log("🧹 Cleaned JSON:", cleanedOutput);
    
    meetingData = JSON.parse(cleanedOutput);

    // Verify the data structure (optional but recommended)
    if (!meetingData.name || !meetingData.datetime) {
        throw new Error("Missing 'name' or 'datetime' field in Gemini output.");
    }
    
    // The data is now available as meetingData.name and meetingData.datetime
    console.log(`✅ Extracted Name: ${meetingData.name}`);
    console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);

  } catch (err) {
    console.error("❌ Data extraction or parsing failed, using fallback:", err.message);
    
    // Fallback: This ensures the process doesn't crash even if AI fails
    meetingData = {
      name: "Fallback User",
      datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  }
  // --- End of Structured Extraction Logic ---


  // Book in Google Calendar
  await bookMeeting(meetingData.name, meetingData.datetime); // Uses extracted data

  // Reply via Twilio
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`);
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}