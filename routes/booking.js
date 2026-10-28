const express = require("express");
const appointmentService = require("../services/appointmentService");
const getStripeClient = require("../services/stripeClient");

const router = express.Router();

const doctorsBySpecialty = {
  "General Physician": "Dr. Sara Ahmed",
  ENT: "Dr. Omar Khan",
  Dentist: "Dr. Lina Haddad",
  Cardiologist: "Dr. Raj Mehta",
};

const timeSlots = [];
for (let minutes = 9 * 60; minutes < 21 * 60; minutes += 30) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const displayHour = hour % 12 || 12;
  timeSlots.push({
    value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    label: `${displayHour}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`,
  });
}

function getClinicDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validateBooking(body) {
  const errors = {};
  const specialty = typeof body.specialty === "string" ? body.specialty : "";
  const doctor = typeof body.doctor === "string" ? body.doctor : "";
  const date = typeof body.date === "string" ? body.date : "";
  const time = typeof body.time === "string" ? body.time : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!Object.hasOwn(doctorsBySpecialty, specialty)) {
    errors.specialty = "Choose one of the listed specialties.";
  }
  if (!errors.specialty && doctor !== doctorsBySpecialty[specialty]) {
    errors.doctor = "Choose the doctor listed for your specialty.";
  }

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!validDate) {
    errors.date = "Enter a valid appointment date.";
  } else if (date < getClinicDate()) {
    errors.date = "Choose today or a future date.";
  } else if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) {
    errors.date = "The clinic is closed on Sundays.";
  }

  if (!timeSlots.some((slot) => slot.value === time)) {
    errors.time = "Choose a time between 9am and 9pm in 30-minute steps.";
  }
  if (!name || name.length > 100) {
    errors.name = "Enter your name (up to 100 characters).";
  }
  if (!/^\+?[0-9\s().-]{7,20}$/.test(phone)) {
    errors.phone = "Enter a valid phone number.";
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  return {
    errors,
    booking: { specialty, doctor, date, time, name, phone, email },
  };
}

function renderBooking(req, res, {
  errors = {},
  booking = {},
  step = 1,
  confirmed = false,
  paymentError = "",
} = {}) {
  if (req.session.user) {
    booking = {
      ...booking,
      name: booking.name || req.session.user.name,
      email: req.session.user.email,
    };
  }

  res.status(Object.keys(errors).length ? 400 : 200).render("booking", {
    title: `Book an appointment | ${req.app.locals.clinic.name}`,
    clinic: req.app.locals.clinic,
    doctorsBySpecialty,
    timeSlots,
    clinicToday: getClinicDate(),
    errors,
    booking,
    step,
    confirmed,
    paymentError,
  });
}

function getBaseUrl() {
  if (!process.env.BASE_URL) {
    throw new Error("BASE_URL must be set to the public application URL.");
  }

  const baseUrl = new URL(process.env.BASE_URL);
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("BASE_URL must use HTTP or HTTPS.");
  }
  return baseUrl.origin;
}

router.get("/", (req, res) => {
  renderBooking(req, res);
});

router.post("/", async (req, res) => {
  const submittedBody = req.session.user
    ? { ...req.body, email: req.session.user.email }
    : req.body;
  const { errors, booking } = validateBooking(submittedBody);
  if (Object.keys(errors).length) {
    const step = errors.specialty ? 1
      : errors.doctor ? 2
        : errors.date || errors.time ? 3 : 4;
    return renderBooking(req, res, { errors, booking, step });
  }

  if (req.body.action === "confirm") {
    let savedBooking;
    try {
      savedBooking = appointmentService.createBooking({
        specialty: booking.specialty,
        doctor: booking.doctor,
        appointmentDateTime: `${booking.date}T${booking.time}:00`,
        patientName: booking.name,
        patientPhone: booking.phone,
        patientEmail: booking.email,
      });
    } catch (error) {
      console.error("Unable to save appointment booking:", error);
      return res.status(500).render("booking", {
        title: `Book an appointment | ${req.app.locals.clinic.name}`,
        clinic: req.app.locals.clinic,
        doctorsBySpecialty,
        timeSlots,
        clinicToday: getClinicDate(),
        errors: { form: "We couldn’t save your booking. Please try again." },
        booking,
        step: 4,
        confirmed: false,
      });
    }

    try {
      const stripe = getStripeClient();
      const baseUrl = getBaseUrl();
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: savedBooking.patientEmail,
        client_reference_id: String(savedBooking.id),
        metadata: { appointmentId: String(savedBooking.id) },
        line_items: [{
          price_data: {
            currency: "aed",
            product_data: {
              name: "Refundable consultation deposit",
              description: "One-off refundable consultation deposit",
            },
            unit_amount: 10000,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/booking`,
      });

      if (!checkoutSession.url) {
        throw new Error("Stripe did not return a Checkout URL.");
      }
      if (!appointmentService.saveStripeSessionId(savedBooking.id, checkoutSession.id)) {
        throw new Error("Unable to save the Stripe Checkout Session for the appointment.");
      }

      return res.redirect(303, checkoutSession.url);
    } catch (error) {
      console.error("Unable to start Stripe Checkout for appointment:", error);
      return res.status(503).render("booking", {
        title: `Book an appointment | ${req.app.locals.clinic.name}`,
        clinic: req.app.locals.clinic,
        doctorsBySpecialty,
        timeSlots,
        clinicToday: getClinicDate(),
        errors: {},
        booking: {
          ...booking,
          id: savedBooking.id,
          status: savedBooking.status,
        },
        step: 5,
        confirmed: true,
        paymentError: "We saved your appointment as Pending, but couldn’t start payment. Please contact the clinic for help completing your refundable AED 100 deposit.",
      });
    }
  }
  if (req.body.action !== "review") {
    return renderBooking(req, res, {
      errors: { form: "Please review your details before confirming." },
      booking,
      step: 4,
    });
  }

  return renderBooking(req, res, { booking, step: 5 });
});

module.exports = router;
