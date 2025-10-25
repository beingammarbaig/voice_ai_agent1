// aiAgent.mjs
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import { bookMeeting } from "./calendar.mjs";

// Initialize Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Calls Gemini to extract structured data (name and datetime)
 * @param {string} prompt
 * @returns {Promise<string>} - raw text from Gemini
 */
async function callGemini(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { temperature: 0, maxOutputTokens: 200 },
    });

    // response.text may be undefined
    console.log(response.candidates.content)
    console.log(response.candidates[0].content.data)
    const text = response.candidates[0].content[0].text;
    if (!text) throw new Error("Gemini response missing content");

    return text;
  } catch (error) {
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
}

// Step 1: Handle initial call
export async function handleCallWebhook(req, res) {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    "Hello! I'm your scheduling assistant. Please tell me your name and the day and time you'd like to book your meeting."
  );

  twiml.record({
    transcribe: true,
    transcribeCallback: "/process-speech",
  });

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}

// Step 2: Handle Twilio transcription callback
export async function processSpeech(req, res) {
  const transcription = req.body.TranscriptionText || "User did not speak";
  console.log("🗣 Transcription received:", transcription);

  const nowISO = new Date().toISOString();

  const PROMPT_INSTRUCTION = `
You are a data extraction assistant.
Extract the person's full name and the meeting datetime from the text below.

Todays date and time is: "${nowISO}"

Output MUST be a single, valid JSON object:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"
}

Text:
"${transcription}"
`;

  let meetingData = null;

  try {
    const geminiOutput = await callGemini(PROMPT_INSTRUCTION);

    // Clean and parse JSON
    const cleanedOutput = geminiOutput.trim().replace(/^```json\s*|```\s*$/g, "");
    console.log("🤖 Gemini raw output:", geminiOutput);
    console.log("🧹 Cleaned JSON:", cleanedOutput);

    const parsed = JSON.parse(cleanedOutput);

    // Only proceed if both fields exist
    if (parsed.name && parsed.datetime) {
      meetingData = parsed;
      console.log(`✅ Extracted Name: ${meetingData.name}`);
      console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);
    } else {
      console.warn("⚠️ Gemini returned incomplete data. No meeting will be created.");
    }
  } catch (err) {
    console.error("❌ Data extraction failed. No meeting will be created:", err.message);
  }

  const twiml = new twilio.twiml.VoiceResponse();

  if (meetingData) {
    // Book the meeting only if valid data exists
    await bookMeeting(meetingData.name, meetingData.datetime);
    twiml.say(`Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`);
  } else {
    // Inform user that meeting could not be booked
    twiml.say("Sorry, I could not understand your meeting details. Please try again.");
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
