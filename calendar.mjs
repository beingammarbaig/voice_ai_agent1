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
 * - Keeps exact local time (Asia/Karachi)
 * - Sends email invitation to user
 */
export async function bookMeeting(name, dateTime, email) {
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  const startTime = new Date(dateTime);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

  // Format to RFC3339 with local offset
  const toRFC3339Local = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hour = pad(d.getHours());
    const minute = pad(d.getMinutes());
    const second = pad(d.getSeconds());
    return `${year}-${month}-${day}T${hour}:${minute}:${second}+05:00`; // Asia/Karachi
  };

  // ✅ Include attendees for invitation
  const event = {
    summary: `Meeting with ${name}`,
    description: "Scheduled via AI Voice Agent.",
    start: {
      dateTime: toRFC3339Local(startTime),
      timeZone: "Asia/Karachi",
    },
    end: {
      dateTime: toRFC3339Local(endTime),
      timeZone: "Asia/Karachi",
    },
    attendees: [
      { email }, // user invitation
      { email: process.env.ADMIN_EMAIL || "youremail@gmail.com" }, // organizer/admin copy
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 30 }, // email reminder before meeting
        { method: "popup", minutes: 10 }, // popup reminder
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
      sendUpdates: "all", // ✅ ensures email invites are sent
    });

    console.log(`📅 Meeting created successfully for ${name}`);
    console.log("🔗 Google Calendar link:", response.data.htmlLink);
    return response.data.id;
  } catch (err) {
    console.error("❌ Failed to create Google Calendar event:", err.message);
    return null;
  }
}
