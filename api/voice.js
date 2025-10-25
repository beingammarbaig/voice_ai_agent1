import { handleCallWebhook } from "../aiAgent.mjs";

export default async function handler(req, res) {
  if (req.method === "POST") {
    await handleCallWebhook(req, res);
  } else {
    res.status(405).send("Method Not Allowed");
  }
}
