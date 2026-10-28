const express = require("express");
const appointmentService = require("../services/appointmentService");

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect(`/login?returnTo=${encodeURIComponent("/my-appointments")}`);
  }
  next();
}

function formatAppointmentDateTime(dateTime) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(`${dateTime}+04:00`));
}

router.use(requireLogin);

router.get("/", (req, res) => {
  try {
    const appointments = appointmentService
      .getBookingsByEmail(req.session.user.email)
      .map((booking) => ({
        ...booking,
        formattedDateTime: formatAppointmentDateTime(booking.appointmentDateTime),
      }));

    res.render("my-appointments", {
      title: `My Appointments | ${req.app.locals.clinic.name}`,
      clinic: req.app.locals.clinic,
      appointments,
      cancelled: req.query.cancelled === "1",
      errors: {},
    });
  } catch (error) {
    console.error("Unable to load patient appointments:", error);
    res.status(500).render("my-appointments", {
      title: `My Appointments | ${req.app.locals.clinic.name}`,
      clinic: req.app.locals.clinic,
      appointments: [],
      cancelled: false,
      errors: { page: "We couldn’t load your appointments. Please try again." },
    });
  }
});

router.post("/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404);

  try {
    const cancelled = appointmentService.updateStatus(
      id,
      "Cancelled",
      req.session.user.email,
    );
    if (!cancelled) return res.sendStatus(404);
    return res.redirect("/my-appointments?cancelled=1");
  } catch (error) {
    console.error("Unable to cancel patient appointment:", error);
    return res.status(500).send("We couldn’t cancel this appointment. Please try again.");
  }
});

module.exports = router;
