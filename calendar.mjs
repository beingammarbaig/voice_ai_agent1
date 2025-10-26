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
 * 🗓️ Book a 30-minute Google Calendar meeting
 * - Keeps exact local time from input (Asia/Karachi)
 * - No UTC conversion or 5-hour shift
 */
export async function bookMeeting(name, dateTime) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  // Keep the input as exact local time
  const startTime = new Date(dateTime);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

  // Convert to local RFC3339 format for Google (YYYY-MM-DDTHH:MM:SS+05:00)
  const toRFC3339Local = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hour = pad(d.getHours());
    const minute = pad(d.getMinutes());
    const second = pad(d.getSeconds());
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+05:00`; // Asia/Karachi offset
  };

  const event = {
    summary: `Meeting with ${name}`,
    start: {
      dateTime: toRFC3339Local(startTime),
      timeZone: "Asia/Karachi",
    },
    end: {
      dateTime: toRFC3339Local(endTime),
      timeZone: "Asia/Karachi",
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
    });

    console.log(`📅 Meeting created successfully for ${name}`);
    console.log("📆 Start:", toRFC3339Local(startTime));
    console.log("📆 End:", toRFC3339Local(endTime));
    console.log("🔗 Google Calendar link:", response.data.htmlLink);
    return response.data.id;
  } catch (err) {
    console.error("❌ Failed to create Google Calendar event:", err.message);
    return null;
  }
}
