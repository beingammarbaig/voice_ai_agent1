import { processSpeech } from "../aiAgent.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    await processSpeech(req, res);
  } else {
    res.status(405).send("Method Not Allowed");
  }
}
