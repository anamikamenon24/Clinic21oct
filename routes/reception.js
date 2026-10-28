const express = require("express");
const bcrypt = require("bcryptjs");
const appointmentService = require("../services/appointmentService");
const emailService = require("../services/emailService");

const router = express.Router();
const receptionEmail = "reception@lakeside.local";
const receptionStatuses = new Set(["Arrived", "Done", "No-show"]);

function getDubaiDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatAppointment(appointment) {
  const value = appointment.appointmentDateTime;
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const appointmentDate = new Date(hasTimezone ? value : `${value}+04:00`);
  return {
    ...appointment,
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      hour: "numeric",
      minute: "2-digit",
    }).format(appointmentDate),
  };
}

function groupByDoctor(appointments) {
  const groups = new Map();
  for (const appointment of appointments) {
    if (!groups.has(appointment.doctor)) {
      groups.set(appointment.doctor, []);
    }
    groups.get(appointment.doctor).push(appointment);
  }
  return [...groups.entries()].map(([doctor, items]) => ({ doctor, appointments: items }));
}

function renderReception(req, res, {
  groups = [],
  todayCount = 0,
  errors = {},
  reminderSent = false,
  statusUpdated = false,
  status = 200,
} = {}) {
  return res.status(status).render("reception", {
    title: `Reception | ${req.app.locals.clinic.name}`,
    clinic: req.app.locals.clinic,
    groups,
    todayCount,
    errors,
    reminderSent,
    statusUpdated,
    authenticated: req.session.user?.role === "reception",
  });
}

function requireReception(req, res, next) {
  if (req.session.user?.role === "reception") return next();
  return renderReception(req, res);
}

function loadTodayAppointments() {
  const appointments = appointmentService
    .getAppointmentsByDate(getDubaiDate())
    .map(formatAppointment);
  return {
    groups: groupByDoctor(appointments),
    todayCount: appointments.length,
  };
}

router.get("/", requireReception, (req, res) => {
  try {
    return renderReception(req, res, {
      ...loadTodayAppointments(),
      reminderSent: req.query.reminderSent === "1",
      statusUpdated: req.query.updated === "1",
    });
  } catch (error) {
    console.error("Unable to load reception appointments:", error);
    return renderReception(req, res, {
      errors: { page: "We couldn’t load today’s appointments. Please try again." },
      status: 500,
    });
  }
});

router.post("/login", async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!process.env.RECEPTION_PASSWORD || !process.env.RECEPTION_PASSWORD.trim()) {
    return renderReception(req, res, {
      errors: { form: "Reception access is not configured. Set RECEPTION_PASSWORD in .env and restart the server." },
      status: 503,
    });
  }

  try {
    const user = email === receptionEmail ? appointmentService.getUserByEmail(receptionEmail) : null;
    const passwordMatches = user?.role === "reception"
      && Buffer.byteLength(password, "utf8") <= 72
      && await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return renderReception(req, res, {
        errors: { form: "The email or password is incorrect." },
        status: 401,
      });
    }

    return req.session.regenerate((error) => {
      if (error) {
        console.error("Unable to start reception session:", error);
        return renderReception(req, res, {
          errors: { form: "We couldn’t sign you in. Please try again." },
          status: 500,
        });
      }

      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
      return req.session.save((saveError) => {
        if (saveError) {
          console.error("Unable to save reception session:", saveError);
          return res.status(500).send("We couldn’t sign you in. Please try again.");
        }
        return res.redirect("/reception");
      });
    });
  } catch (error) {
    console.error("Unable to sign in reception user:", error);
    return renderReception(req, res, {
      errors: { form: "We couldn’t sign you in. Please try again." },
      status: 500,
    });
  }
});

router.post("/logout", requireReception, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("connect.sid");
    return res.redirect("/reception");
  });
});

router.post("/:id/status", requireReception, (req, res) => {
  const id = Number(req.params.id);
  const status = typeof req.body.status === "string" ? req.body.status : "";
  if (!Number.isSafeInteger(id) || id < 1 || !receptionStatuses.has(status)) {
    return res.sendStatus(400);
  }

  try {
    const updated = appointmentService.updateReceptionStatus(id, status, getDubaiDate());
    if (!updated) return res.sendStatus(404);
    return res.redirect("/reception?updated=1");
  } catch (error) {
    console.error("Unable to update reception appointment status:", error);
    try {
      return renderReception(req, res, {
        ...loadTodayAppointments(),
        errors: { page: "We couldn’t update that appointment. Please try again." },
        status: 500,
      });
    } catch (loadError) {
      console.error("Unable to reload reception appointments after status update failure:", loadError);
      return renderReception(req, res, {
        errors: { page: "We couldn’t update or reload appointments. Please try again." },
        status: 500,
      });
    }
  }
});

router.post("/:id/reminder", requireReception, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404);

  try {
    const appointment = appointmentService.getBookedAppointmentById(id);
    if (!appointment) return res.sendStatus(404);

    await emailService.sendReminderEmail(appointment, req.app.locals.clinic);
    return res.redirect("/reception?reminderSent=1");
  } catch (error) {
    console.error("Unable to send appointment reminder:", error);
    try {
      return renderReception(req, res, {
        ...loadTodayAppointments(),
        errors: { page: "We couldn’t send that reminder. Check the email settings and try again." },
        status: 503,
      });
    } catch (loadError) {
      console.error("Unable to reload reception appointments after reminder failure:", loadError);
      return renderReception(req, res, {
        errors: { page: "We couldn’t send the reminder or reload appointments. Please try again." },
        status: 503,
      });
    }
  }
});

module.exports = router;
