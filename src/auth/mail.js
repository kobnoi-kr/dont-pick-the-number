"use strict";

const nodemailer = require("nodemailer");

let transporter = null;

function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!mailConfigured()) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "1",
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
        : undefined
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || "NUMVERSE <noreply@localhost>";
  const tx = getTransporter();
  if (!tx) {
    console.log("[mail:dev]", { to, subject, text });
    return { queued: false, dev: true };
  }
  await tx.sendMail({ from, to, subject, text, html });
  return { queued: true };
}

module.exports = { mailConfigured, sendMail };
