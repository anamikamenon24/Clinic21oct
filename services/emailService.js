const nodemailer = require("nodemailer");
const appointmentService = require("./appointmentService");

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM must be configured.");
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from,
  };
}

function formatAppointmentDateTime(appointmentDateTime) {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    dateStyle: "long",
  }).format(new Date(`${appointmentDateTime}+04:00`));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(`${appointmentDateTime}+04:00`));
  return { date, time };
}

function createTransporter(smtp) {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.auth.user, pass: smtp.auth.pass },
  });
}

async function sendConfirmationEmail(appointment, clinic) {
  const claimedAt = new Date().toISOString();
  if (!appointmentService.claimAppointmentConfirmationEmail(appointment.id, claimedAt)) {
    return false;
  }

  let transporter;
  try {
    const smtp = getSmtpConfig();
    transporter = createTransporter(smtp);

    const { date, time } = formatAppointmentDateTime(appointment.appointmentDateTime);
    await transporter.sendMail({
      from: { name: clinic.name, address: smtp.from },
      to: appointment.patientEmail,
      subject: "Your appointment is confirmed",
      text: [
        `Hello ${appointment.patientName},`,
        "",
        "Your appointment is confirmed.",
        "",
        `Specialty: ${appointment.specialty}`,
        `Doctor: ${appointment.doctor}`,
        `Date and time: ${date} at ${time}`,
        `Clinic address: ${clinic.address}`,
        "",
        `${clinic.name} · built at London International · lisrc.ae · by Anamika Menon`,
      ].join("\n"),
    });

    return true;
  } catch (error) {
    console.error("Unable to send appointment confirmation email:", error);
    try {
      appointmentService.releaseAppointmentConfirmationEmailClaim(appointment.id, claimedAt);
    } catch (releaseError) {
      console.error("Unable to release appointment confirmation email claim:", releaseError);
    }
    return false;
  } finally {
    if (transporter) transporter.close();
  }
}

async function sendReminderEmail(appointment, clinic) {
  const smtp = getSmtpConfig();
  const transporter = createTransporter(smtp);
  const { date, time } = formatAppointmentDateTime(appointment.appointmentDateTime);

  try {
    return await transporter.sendMail({
      from: { name: clinic.name, address: smtp.from },
      to: appointment.patientEmail,
      subject: "Reminder: your appointment",
      text: [
        `Hi ${appointment.patientName}, a reminder that your ${appointment.specialty} appointment with ${appointment.doctor} is on ${date} at ${time} at ${clinic.name}, ${clinic.area}. Reply to reschedule.`,
        "",
        "Powered by London International · lisrc.ae · built by Anamika Menon",
      ].join("\n"),
    });
  } finally {
    transporter.close();
  }
}

module.exports = { sendConfirmationEmail, sendReminderEmail };
