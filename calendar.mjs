import { google } from "googleapis";

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

export async function bookMeeting(name, time) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  
  const startTime = new Date(time); // ISO string converted to Date
  const endTime = new Date(startTime.getTime() + 30 * 60000); // 30-minute meeting

  const event = {
    summary: `Meeting with ${name}`,
    start: { dateTime: startTime.toISOString(), timeZone: "Asia/Karachi" },
    end: { dateTime: endTime.toISOString(), timeZone: "Asia/Karachi" },
  };

  const response = await calendar.events.insert({ calendarId: "primary", resource: event });
  console.log("📅 Meeting created:", response.data.htmlLink);
}

