const express = require("express");
const bcrypt = require("bcryptjs");
const appointmentService = require("../services/appointmentService");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSafeReturnTo(value) {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    ? value
    : "/my-appointments";
}

function renderAuthPage(req, res, page, { errors = {}, values = {}, status = 200 } = {}) {
  res.status(status).render(page, {
    title: `${page === "register" ? "Register" : "Login"} | ${req.app.locals.clinic.name}`,
    clinic: req.app.locals.clinic,
    errors,
    values,
    returnTo: getSafeReturnTo(req.body?.returnTo || req.query.returnTo),
  });
}

function regenerateSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      req.session.save((saveError) => {
        if (saveError) return reject(saveError);
        resolve();
      });
    });
  });
}

router.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/my-appointments");
  renderAuthPage(req, res, "register");
});

router.post("/register", async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const passwordConfirmation = typeof req.body.passwordConfirmation === "string"
    ? req.body.passwordConfirmation
    : "";
  const values = { name, email };
  const errors = {};

  if (!name || name.length > 100) errors.name = "Enter your name (up to 100 characters).";
  if (email.length > 254 || !emailPattern.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    errors.password = "Use a password between 8 and 72 bytes.";
  }
  if (password !== passwordConfirmation) errors.passwordConfirmation = "Passwords do not match.";

  if (Object.keys(errors).length) {
    return renderAuthPage(req, res, "register", { errors, values, status: 400 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = appointmentService.createUser({ name, email, passwordHash });
    await regenerateSession(req, user);
    return res.redirect("/my-appointments");
  } catch (error) {
    if (error.code === "ERR_SQLITE_ERROR" && error.message.includes("UNIQUE constraint failed: users.email")) {
      return renderAuthPage(req, res, "register", {
        errors: { email: "An account with this email already exists." },
        values,
        status: 409,
      });
    }
    console.error("Unable to register patient:", error);
    return renderAuthPage(req, res, "register", {
      errors: { form: "We couldn’t create your account. Please try again." },
      values,
      status: 500,
    });
  }
});

router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect(getSafeReturnTo(req.query.returnTo));
  renderAuthPage(req, res, "login");
});

router.post("/login", async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const values = { email };

  if (
    email.length > 254
    || !emailPattern.test(email)
    || !password
    || Buffer.byteLength(password, "utf8") > 72
  ) {
    return renderAuthPage(req, res, "login", {
      errors: { form: "Enter a valid email and password." },
      values,
      status: 400,
    });
  }

  try {
    const user = appointmentService.getUserByEmail(email);
    const passwordMatches = user && await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return renderAuthPage(req, res, "login", {
        errors: { form: "The email or password is incorrect." },
        values,
        status: 401,
      });
    }

    await regenerateSession(req, user);
    return res.redirect(getSafeReturnTo(req.body.returnTo));
  } catch (error) {
    console.error("Unable to log in patient:", error);
    return renderAuthPage(req, res, "login", {
      errors: { form: "We couldn’t log you in. Please try again." },
      values,
      status: 500,
    });
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

module.exports = router;
