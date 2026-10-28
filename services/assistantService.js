const { Anthropic } = require("@anthropic-ai/sdk");

const CLINIC_NAME = "Lakeside Medical";
const SIGN_OFF = "— Lakeside Medical, powered by London International · lisrc.ae";
const MODEL_NAME = "claude-3-5-haiku-20241022";

const systemPrompt = `You are the front-desk assistant for Lakeside Medical Clinic.

Answer using ONLY this info:
- Specialties — GP, ENT, Dentist, Cardiologist.
- Doctors — Dr. Sara Ahmed (GP), Dr. Omar Khan (ENT), Dr. Lina Haddad (Dentist), Dr. Raj Mehta (Cardiologist)
- Hours — Mon–Sat 9am–9pm, closed Sunday
- Insurance — Daman, AXA, or cash
- Location — Cluster X, JLT, Dubai
- Deposit — AED 100

If the answer is not in this info, say you don't know and suggest calling the clinic.
Guardrail: do NOT give medical advice or discuss symptoms, diagnoses, or treatments.
If asked, say you can't give medical advice, offer to book the right specialist, and suggest urgent/emergency care if it sounds serious.
Keep answers short and friendly.
End each reply with a one-line sign-off exactly as:
${SIGN_OFF}`;

function normalizeReply(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return `I don't know. Please call the clinic to confirm.\n${SIGN_OFF}`;
  }

  const hasSignOff = trimmed.endsWith(SIGN_OFF);
  return hasSignOff ? trimmed : `${trimmed}\n${SIGN_OFF}`;
}

function includesAny(message, values) {
  const normalized = String(message || "").toLowerCase();
  return values.some((value) => normalized.includes(value.toLowerCase()));
}

function isMedicalAdviceQuestion(message) {
  return includesAny(message, [
    "symptom",
    "symptoms",
    "diagnosis",
    "diagnose",
    "treatment",
    "medication",
    "medicine",
    "pain",
    "fever",
    "sick",
    "ill",
    "rash",
    "cough",
    "flu",
    "infection",
    "prescription",
    "what should i do",
    "can you advise",
  ]);
}

function hasAnthropicApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !key.trim()) {
    return false;
  }

  const normalized = key.trim().toLowerCase();
  return ![
    "your_anthropic_api_key_here",
    "your-api-key-here",
    "your_key_here",
    "placeholder",
    "test-placeholder",
    "changeme",
  ].includes(normalized);
}

function getLocalReply(message) {
  const text = String(message || "").trim();
  if (!text) {
    return "Hi! I can help with clinic hours, doctors, insurance, location, and deposit questions. Please call the clinic for anything else.\n" + SIGN_OFF;
  }

  if (isMedicalAdviceQuestion(text)) {
    return "I can’t give medical advice. I can help you book the right specialist or direct you to urgent/emergency care if it sounds serious. Please call the clinic for the best next step.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["hours", "open", "opening", "closed", "sunday", "mon", "tuesday", "wednesday", "thursday", "friday", "saturday"])) {
    return "We’re open Mon–Sat, 9am–9pm, and closed Sunday.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["insurance", "insurer", "daman", "axa", "cash"])) {
    return "We accept Daman, AXA, and cash.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["location", "address", "where", "jlt", "dubai", "cluster x"])) {
    return "We’re at Cluster X, JLT, Dubai.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["deposit", "booking deposit", "fee"])) {
    return "The deposit is AED 100.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["gp", "general physician", "family doctor", "doctor sara", "sara ahmed"])) {
    return "Our GP is Dr. Sara Ahmed.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["ent", "ear", "nose", "throat", "omar khan"])) {
    return "Our ENT specialist is Dr. Omar Khan.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["dentist", "dental", "lina haddad"])) {
    return "Our Dentist is Dr. Lina Haddad.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["cardiologist", "heart", "raj mehta"])) {
    return "Our Cardiologist is Dr. Raj Mehta.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["specialty", "specialties", "gp", "ent", "dentist", "cardiologist"])) {
    return "Our specialties are GP, ENT, Dentist, and Cardiologist.\n" + SIGN_OFF;
  }

  if (includesAny(text, ["who are you", "hello", "hi", "help"])) {
    return "Hi! I can help with our specialties, doctors, opening hours, insurance, location, and deposit details.\n" + SIGN_OFF;
  }

  return "I don’t know. Please call the clinic to confirm.\n" + SIGN_OFF;
}

function toAnthropicMessages(conversation = []) {
  return (Array.isArray(conversation) ? conversation : [])
    .filter((entry) => entry && typeof entry.content === "string")
    .slice(-10)
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: entry.content.trim(),
    }))
    .filter((entry) => entry.content.length > 0);
}

async function getAssistantReply(conversation = []) {
  const messages = toAnthropicMessages(conversation);
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";

  if (!hasAnthropicApiKey()) {
    return normalizeReply(getLocalReply(lastUserMessage));
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: MODEL_NAME,
      max_tokens: 250,
      temperature: 0.2,
      system: systemPrompt,
      messages: messages.length > 0 ? messages : [{ role: "user", content: "Hello" }],
    });

    const answer = response.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return normalizeReply(answer);
  } catch (error) {
    console.error("Assistant API error:", error);
    return normalizeReply(getLocalReply(lastUserMessage));
  }
}

module.exports = {
  getAssistantReply,
  CLINIC_NAME,
  SIGN_OFF,
  getLocalReply,
};
