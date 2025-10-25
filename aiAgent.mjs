import twilio from "twilio";
import { bookMeeting } from "./calendar.mjs";
import { generateText } from "ai"; // Gemini SDK

// Gemini model
const model = "gemini-2.0-flash";

// Step 1: Handle initial call
export async function handleCallWebhook(req, res) {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    "Hello! I'm your scheduling assistant. Please tell me your name and what day and time you'd like to book your meeting."
  );

  // Record and auto-transcribe user’s voice
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

  try {
    // ✅ Gemini API call to extract both name and ISO datetime
    const prompt = `
      Extract the user's name and the meeting time from the following sentence.
      Respond in JSON with keys "name" and "datetime" (ISO 8601 format).
      Sentence: "${transcription}"
    `;

    const response = await generateText({
      model,
      prompt,
      temperature: 0,
      max_output_tokens: 100,
    });

    // Parse Gemini response as JSON
    const data = JSON.parse(response.text.trim());
    const userName = data.name || "User";
    const meetingTime = data.datetime || "2025-10-26T15:00:00"; // fallback

    console.log("🤖 Gemini Extracted:", { userName, meetingTime });

    // Book in Google Calendar
    await bookMeeting(userName, meetingTime);

    // Reply via Twilio
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(`Great! I have booked your meeting with ${userName} for ${meetingTime}.`);
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());

  } catch (error) {
    console.error("Error with Gemini API:", error);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      "Sorry, I couldn't process your request. Please try again later."
    );
    res.writeHead(500, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
  }
}
