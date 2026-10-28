const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const appointmentService = require("./services/appointmentService");
const { getAssistantReply } = require("./services/assistantService");
const bookingRouter = require("./routes/booking");
const bookingSuccessRouter = require("./routes/bookingSuccess");
const authRouter = require("./routes/auth");
const myAppointmentsRouter = require("./routes/myAppointments");
const receptionRouter = require("./routes/reception");

const app = express();
const port = process.env.PORT || 3000;
const sessionSecret = process.env.SESSION_SECRET
  || (process.env.VERCEL ? crypto.randomBytes(32).toString("hex") : null);
const receptionEmail = "reception@lakeside.local";

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set in the environment or .env file.");
}
if (process.env.VERCEL && !process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET is unset. Set it in Vercel to keep sessions stable across function instances.");
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.locals.clinic = {
  name: "Lakeside Medical Clinic",
  area: "JLT, Dubai",
  tagline: "Expert care, close to home",
  address: "Cluster X, JLT, Dubai",
  phone: "+971 4 000 0000",
  hours: "Monday–Saturday, 9am–9pm",
};

app.get("/", (req, res) => {
  res.render("index", { title: app.locals.clinic.name });
});

app.post("/api/chat", async (req, res) => {
  try {
    const conversation = Array.isArray(req.body?.conversation)
      ? req.body.conversation
      : [{ role: "user", content: String(req.body?.message || "") }];

    const reply = await getAssistantReply(conversation);
    res.json({ reply });
  } catch (error) {
    console.error("Chat route error:", error);
    res.status(500).json({
      reply: `I’m not able to answer right now. Please call the clinic for help.\n— Lakeside Medical, powered by London International · lisrc.ae`,
    });
  }
});

app.use("/booking", bookingRouter);
app.use("/", bookingSuccessRouter);
app.use("/", authRouter);
app.use("/my-appointments", myAppointmentsRouter);
app.use("/reception", receptionRouter);

async function startServer() {
  const receptionPassword = process.env.RECEPTION_PASSWORD;
  if (receptionPassword && receptionPassword.trim()) {
    if (Buffer.byteLength(receptionPassword, "utf8") > 72) {
      throw new Error("RECEPTION_PASSWORD must be 72 bytes or fewer.");
    }
    const passwordHash = await bcrypt.hash(receptionPassword, 12);
    appointmentService.saveReceptionUser({
      name: "Reception",
      email: receptionEmail,
      passwordHash,
    });
  } else {
    console.warn("RECEPTION_PASSWORD is not configured; reception staff login is disabled.");
  }

  app.listen(port, () => {
    console.log(`Lakeside Medical Clinic is running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Unable to initialize the clinic server:", error);
  process.exitCode = 1;
});
