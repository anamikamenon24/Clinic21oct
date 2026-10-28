const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.resolve(
  process.env.DB_PATH || path.join(__dirname, "lakeside.db"),
);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    specialty TEXT NOT NULL,
    doctor TEXT NOT NULL,
    appointmentDateTime TEXT NOT NULL,
    patientName TEXT NOT NULL,
    patientPhone TEXT NOT NULL,
    patientEmail TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Booked',
    createdAt TEXT NOT NULL,
    stripeSessionId TEXT,
    confirmationEmailSentAt TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'patient'
  )
`);

const appointmentColumns = db.prepare("PRAGMA table_info(appointments)").all();
if (!appointmentColumns.some((column) => column.name === "stripeSessionId")) {
  db.exec("ALTER TABLE appointments ADD COLUMN stripeSessionId TEXT");
}
if (!appointmentColumns.some((column) => column.name === "confirmationEmailSentAt")) {
  db.exec("ALTER TABLE appointments ADD COLUMN confirmationEmailSentAt TEXT");
}

const userColumns = db.prepare("PRAGMA table_info(users)").all();
if (!userColumns.some((column) => column.name === "role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'patient'");
}

module.exports = db;
