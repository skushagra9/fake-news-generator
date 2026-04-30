import OpenAI from "openai";
import { config } from "../config";

// Single shared client. The OpenAI SDK is connection-pool aware so this is
// safe and preferred.
export const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  // Without a timeout a hung network leaves FakeArticle stuck in PROCESSING forever.
  timeout: 120_000,
  maxRetries: 2,
});

export const MODEL = config.OPENAI_MODEL;
