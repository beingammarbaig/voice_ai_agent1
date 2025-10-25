import twilio from "twilio";
import { bookMeeting } from "./calendar.mjs";

// Step 1: Handle initial call
export async function handleCallWebhook(req, res) {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    "Hello! I'm your scheduling assistant. Please tell me what day and time you'd like to book your meeting."
  );

  // Record and auto-transcribe user’s voice
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

  // ✅ Use hardcoded ISO datetime instead of AI
  const meetingTime = "2025-10-26T15:00:00"; // Hardcoded date & time
  console.log("🤖 Using mock AI, meetingTime:", meetingTime);

  // Book in Google Calendar
  await bookMeeting("User", meetingTime);

  // Reply via Twilio
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(`Great! I have booked your meeting for ${meetingTime}.`);
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
}
