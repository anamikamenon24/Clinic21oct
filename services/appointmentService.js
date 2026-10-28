const db = require("../data/db");

const insertAppointment = db.prepare(`
  INSERT INTO appointments (
    specialty,
    doctor,
    appointmentDateTime,
    patientName,
    patientPhone,
    patientEmail,
    status,
    createdAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const findAppointmentById = db.prepare(`
  SELECT id, specialty, doctor, appointmentDateTime, patientName, patientPhone, patientEmail, status, createdAt, stripeSessionId, confirmationEmailSentAt
  FROM appointments
  WHERE id = ?
`);

const selectBookingsByEmail = db.prepare(`
  SELECT id, specialty, doctor, appointmentDateTime, patientName, patientPhone, patientEmail, status, createdAt, stripeSessionId, confirmationEmailSentAt
  FROM appointments
  WHERE patientEmail = ?
  ORDER BY createdAt DESC, id DESC
`);

const selectBookingsByDate = db.prepare(`
  SELECT id, specialty, doctor, appointmentDateTime, patientName, patientPhone, patientEmail, status, createdAt, stripeSessionId, confirmationEmailSentAt
  FROM appointments
  WHERE substr(appointmentDateTime, 1, 10) = ?
  ORDER BY appointmentDateTime
`);

const selectBookedAppointments = db.prepare(`
  SELECT id, specialty, doctor, appointmentDateTime, patientName, patientEmail, status
  FROM appointments
  WHERE status = 'Booked'
  ORDER BY appointmentDateTime, id
`);

const selectAppointmentsByDate = db.prepare(`
  SELECT id, specialty, doctor, appointmentDateTime, patientName, patientEmail, status
  FROM appointments
  WHERE substr(appointmentDateTime, 1, 10) = ?
  ORDER BY doctor, appointmentDateTime, id
`);

const selectBookingByStripeSessionId = db.prepare(`
  SELECT id, specialty, doctor, appointmentDateTime, patientName, patientPhone, patientEmail, status, createdAt, stripeSessionId, confirmationEmailSentAt
  FROM appointments
  WHERE stripeSessionId = ?
`);

const setStripeSessionId = db.prepare(`
  UPDATE appointments
  SET stripeSessionId = ?
  WHERE id = ?
`);

const markBookedByStripeSessionId = db.prepare(`
  UPDATE appointments
  SET status = 'Booked'
  WHERE stripeSessionId = ? AND status = 'Pending'
`);

const claimConfirmationEmail = db.prepare(`
  UPDATE appointments
  SET confirmationEmailSentAt = ?
  WHERE id = ? AND status = 'Booked' AND confirmationEmailSentAt IS NULL
`);

const releaseConfirmationEmailClaim = db.prepare(`
  UPDATE appointments
  SET confirmationEmailSentAt = NULL
  WHERE id = ? AND confirmationEmailSentAt = ?
`);

const changeAppointmentStatus = db.prepare(`
  UPDATE appointments
  SET status = ?
  WHERE id = ? AND patientEmail = ?
`);

const changeReceptionAppointmentStatus = db.prepare(`
  UPDATE appointments
  SET status = ?
  WHERE id = ? AND substr(appointmentDateTime, 1, 10) = ?
`);

const insertUser = db.prepare(`
  INSERT INTO users (name, email, passwordHash, createdAt)
  VALUES (?, ?, ?, ?)
`);

const selectUserByEmail = db.prepare(`
  SELECT id, name, email, passwordHash, createdAt, role
  FROM users
  WHERE email = ?
`);

const upsertReceptionUser = db.prepare(`
  INSERT INTO users (name, email, passwordHash, createdAt, role)
  VALUES (?, ?, ?, ?, 'reception')
  ON CONFLICT(email) DO UPDATE SET
    name = excluded.name,
    passwordHash = excluded.passwordHash,
    role = 'reception'
`);

function createBooking({ specialty, doctor, appointmentDateTime, patientName, patientPhone, patientEmail }) {
  const result = insertAppointment.run(
    specialty,
    doctor,
    appointmentDateTime,
    patientName,
    patientPhone,
    patientEmail,
    "Pending",
    new Date().toISOString(),
  );

  return findAppointmentById.get(Number(result.lastInsertRowid));
}

function getBookingsByEmail(email) {
  return selectBookingsByEmail.all(email);
}

function getBookingsByDate(date) {
  return selectBookingsByDate.all(date);
}

function getBookedAppointments() {
  return selectBookedAppointments.all();
}

function getAppointmentsByDate(date) {
  return selectAppointmentsByDate.all(date);
}

function getBookedAppointmentById(id) {
  return db.prepare(`
    SELECT id, specialty, doctor, appointmentDateTime, patientName, patientEmail, status
    FROM appointments
    WHERE id = ? AND status = 'Booked'
  `).get(id) || null;
}

function saveStripeSessionId(id, stripeSessionId) {
  const result = setStripeSessionId.run(stripeSessionId, id);
  return result.changes > 0;
}

function getBookingByStripeSessionId(stripeSessionId) {
  return selectBookingByStripeSessionId.get(stripeSessionId) || null;
}

function markBookedBySessionId(stripeSessionId) {
  const result = markBookedByStripeSessionId.run(stripeSessionId);
  return result.changes > 0;
}

function claimAppointmentConfirmationEmail(id, claimedAt) {
  const result = claimConfirmationEmail.run(claimedAt, id);
  return result.changes > 0;
}

function releaseAppointmentConfirmationEmailClaim(id, claimedAt) {
  const result = releaseConfirmationEmailClaim.run(id, claimedAt);
  return result.changes > 0;
}

function updateStatus(id, status, patientEmail) {
  const result = changeAppointmentStatus.run(status, id, patientEmail);
  return result.changes ? findAppointmentById.get(id) : null;
}

function updateReceptionStatus(id, status, date) {
  const result = changeReceptionAppointmentStatus.run(status, id, date);
  return result.changes > 0;
}

function createUser({ name, email, passwordHash }) {
  const result = insertUser.run(name, email, passwordHash, new Date().toISOString());
  return {
    id: Number(result.lastInsertRowid),
    name,
    email,
    role: "patient",
  };
}

function saveReceptionUser({ name, email, passwordHash }) {
  upsertReceptionUser.run(name, email, passwordHash, new Date().toISOString());
  return getUserByEmail(email);
}

function getUserByEmail(email) {
  return selectUserByEmail.get(email);
}

module.exports = {
  createBooking,
  getBookingsByEmail,
  getBookingsByDate,
  getBookedAppointments,
  getAppointmentsByDate,
  getBookedAppointmentById,
  saveStripeSessionId,
  getBookingByStripeSessionId,
  markBookedBySessionId,
  claimAppointmentConfirmationEmail,
  releaseAppointmentConfirmationEmailClaim,
  updateStatus,
  updateReceptionStatus,
  createUser,
  saveReceptionUser,
  getUserByEmail,
};
