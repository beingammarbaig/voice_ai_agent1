import { google } from "googleapis";

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oAuth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

/**
 * 📅 Books a 30-minute meeting
 */
export async function bookMeeting(name, startTime) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  const start = new Date(startTime);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const event = {
    summary: `Meeting with ${name}`,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Karachi" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Karachi" },
  };

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });
    console.log("📅 Meeting created:", res.data.htmlLink);
    return res.data.id; // ✅ return event ID for DB
  } catch (err) {
    console.error("❌ Google Calendar error:", err.message);
    return null;
  }
}
