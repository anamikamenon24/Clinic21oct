const Stripe = require("stripe");

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith("sk_test_")) {
    throw new Error("A Stripe test secret key must be set in STRIPE_SECRET_KEY.");
  }
  return new Stripe(secretKey);
}

module.exports = getStripeClient;
