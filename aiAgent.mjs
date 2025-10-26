// aiAgent.mjs
import twilio from "twilio";
import OpenAI from "openai";
import { bookMeeting } from "./calendar.mjs";

// Initialize OpenRouter client
const ai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

/**
 * Calls OpenRouter GPT API to extract structured data (name + datetime)
 * @param {string} prompt
 * @returns {Promise<string>} - raw JSON text from GPT
 */
async function callOpenRouter(prompt) {
  try {
    const response = await ai.chat.completions.create({
      model: "gpt-4", // or "gpt-3.5-turbo"
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const text = response.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenRouter response missing content");
    return text;
  } catch (error) {
    throw new Error(`OpenRouter API call failed: ${error.message}`);
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

  // Prompt for GPT
  const PROMPT_INSTRUCTION = `
You are a data extraction assistant.
Extract the person's full name and meeting datetime from the text below.

Output MUST be a single, valid JSON object:
{
  "name": "Full Name",
  "datetime": "YYYY-MM-DDTHH:MM:SS"
}

Assume the current date is ${new Date().toISOString().split("T")[0]} to interpret relative dates like "tomorrow" or "next Monday".

Text:
"${transcription}"
`;

  let meetingData;

  try {
    const gptOutput = await callOpenRouter(PROMPT_INSTRUCTION);

    // Clean and parse JSON
    const cleanedOutput = gptOutput.trim().replace(/^```json\s*|```\s*$/g, "");
    console.log("🤖 GPT raw output:", gptOutput);
    console.log("🧹 Cleaned JSON:", cleanedOutput);

    meetingData = JSON.parse(cleanedOutput);

    if (!meetingData.name || !meetingData.datetime) {
      throw new Error("Missing 'name' or 'datetime' field in GPT output");
    }

    console.log(`✅ Extracted Name: ${meetingData.name}`);
    console.log(`✅ Extracted Datetime: ${meetingData.datetime}`);
  } catch (err) {
    console.error("❌ Data extraction failed. No meeting will be created:", err.message);
    return res.status(200).send("Could not extract meeting info, skipping booking.");
  }

  // Book the meeting
  await bookMeeting(meetingData.name, meetingData.datetime);

  // Respond via Twilio
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    `Great! I have booked your meeting with ${meetingData.name} for ${meetingData.datetime}.`
  );
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
