// aiAgent.mjs
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import { bookMeeting } from "./calendar.mjs";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const GEMINI_MODEL = "gemini-2.5-flash";

/**
 * Calls Gemini to extract structured data (name and datetime)
 */
async function callGemini(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { temperature: 0, maxOutputTokens: 200 },
    });

    // Gemini SDK might wrap the response in different ways:
    // 1. response.text
    // 2. response[0].text
    // 3. response.candidates[0].content
    let text =
      response?.text ||
      response?.[0]?.text ||
      response?.candidates?.[0]?.content;

    if (!text) throw new Error("Gemini response missing text");

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
    console.log("🤖 Full Gemini output:", geminiOutput);

    const cleanedOutput = geminiOutput
      .trim()
      .replace(/^```json\s*|```\s*$/g, "");
    console.log("🧹 Cleaned JSON:", cleanedOutput);

    meetingData = JSON.parse(cleanedOutput);

    if (!meetingData.name || !meetingData.datetime) {
      throw new Error("Missing 'name' or 'datetime' in Gemini output");
    }

    console.log(`✅ Extracted Name: ${meetingData.name}`);
    console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);
  } catch (err) {
    console.error(
      "❌ Data extraction or parsing failed, using fallback:",
      err.message
    );

    meetingData = {
      name: "Fallback User",
      datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  await bookMeeting(meetingData.name, meetingData.datetime);

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    `Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`
  );
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
