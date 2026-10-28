const express = require("express");
const appointmentService = require("../services/appointmentService");
const emailService = require("../services/emailService");
const getStripeClient = require("../services/stripeClient");

const router = express.Router();

function renderPaymentResult(req, res, {
  appointment = null,
  paymentComplete = false,
  paymentReceived = false,
  message = "Payment not completed. Your appointment remains Pending.",
  status = 200,
} = {}) {
  return res.status(status).render("booking-success", {
    title: `Booking payment | ${req.app.locals.clinic.name}`,
    clinic: req.app.locals.clinic,
    appointment,
    paymentComplete,
    paymentReceived,
    message,
  });
}

router.get("/booking-success", async (req, res) => {
  const sessionId = req.query.session_id;
  if (typeof sessionId !== "string" || sessionId.length > 255) {
    return renderPaymentResult(req, res);
  }

  try {
    let appointment = appointmentService.getBookingByStripeSessionId(sessionId);
    if (!appointment) {
      return renderPaymentResult(req, res, {
        message: "We couldn’t find this appointment. Payment has not been confirmed.",
      });
    }

    const checkoutSession = await getStripeClient().checkout.sessions.retrieve(sessionId);
    const sessionMatchesAppointment = checkoutSession.id === sessionId
      && checkoutSession.mode === "payment"
      && checkoutSession.metadata?.appointmentId === String(appointment.id);
    if (sessionMatchesAppointment && checkoutSession.payment_status === "paid") {
      appointmentService.markBookedBySessionId(sessionId);
      appointment = appointmentService.getBookingByStripeSessionId(sessionId);
    }

    const paymentComplete = sessionMatchesAppointment
      && checkoutSession.payment_status === "paid"
      && appointment?.status === "Booked";
    const paymentReceived = sessionMatchesAppointment
      && checkoutSession.payment_status === "paid";

    if (paymentComplete && !appointment.confirmationEmailSentAt) {
      await emailService.sendConfirmationEmail(appointment, req.app.locals.clinic);
      appointment = appointmentService.getBookingByStripeSessionId(sessionId);
    }

    return renderPaymentResult(req, res, {
      appointment,
      paymentComplete,
      paymentReceived,
      message: paymentComplete
        ? "Payment received. Your appointment is confirmed."
        : paymentReceived
          ? "Payment received, but this appointment is not active. Please contact the clinic."
          : appointment.status === "Pending"
            ? "Payment not completed. Your appointment remains Pending."
            : "Payment not completed. This appointment is no longer active.",
    });
  } catch (error) {
    console.error("Unable to verify Stripe payment for appointment:", error);
    return renderPaymentResult(req, res, {
      message: "We couldn’t verify your payment. Your appointment has not been confirmed.",
      status: 503,
    });
  }
});

module.exports = router;
