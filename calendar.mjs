import { google } from "googleapis";

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

export async function bookMeeting(name, startTime, endTime) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  const event = {
    summary: `Meeting with ${name}`,
    start: { dateTime: startTime, timeZone: "Asia/Karachi" },
    end: { dateTime: endTime, timeZone: "Asia/Karachi" },
  };
  const response = await calendar.events.insert({ calendarId: "primary", resource: event });
  console.log("📅 Meeting created:", response.data.htmlLink);
}


