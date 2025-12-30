const transporter = require('../config/mailer');
const newEventTemplate = require('../templates/newEvent');
const forgotPasswordTemplate = require('../templates/forgotPassword');
const registrationTemplate = require('../templates/registration');
const reminderTemplate = require('../templates/reminder');
const passwordResetConfirmationTemplate = require('../templates/passwordResetConfirmation');

const sendMail = async (to, subject, html) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    console.log(`✓ Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('✗ Email sending failed:', error);
    throw error;
  }
};

const processNewEvent = async (job) => {
  const { eventId, title, startDate, location, description, recipientEmail } = job.data;

  const html = newEventTemplate({
    title,
    startDate: new Date(startDate).toLocaleString(),
    location,
    description,
  });

  await sendMail(
    recipientEmail || process.env.ADMIN_EMAIL,
    `New Event Created: ${title}`,
    html
  );

  return { success: true, eventId };
};

const processForgotPassword = async (job) => {
  const { email, name, resetToken, expiryTime = 24 } = job.data;

  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const html = forgotPasswordTemplate({
    name: name || 'User',
    resetLink,
    expiryTime,
  });

  await sendMail(
    email,
    'Password Reset Request',
    html
  );

  return { success: true, email };
};

const processRegistration = async (job) => {
  const { email, name, registrationDate } = job.data;

  const loginLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;

  const html = registrationTemplate({
    name,
    email,
    registrationDate: new Date(registrationDate).toLocaleDateString(),
    loginLink,
    year: new Date().getFullYear(),
  });

  await sendMail(
    email,
    'Welcome to Our Platform!',
    html
  );

  return { success: true, email };
};

const processReminder = async (job) => {
  const {
    email,
    name,
    eventTitle,
    eventDescription,
    eventDate,
    eventTime,
    location,
    timeUntilEvent,
    eventId
  } = job.data;

  const eventLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/events/${eventId}`;

  const html = reminderTemplate({
    name,
    eventTitle,
    eventDescription,
    eventDate,
    eventTime,
    location,
    timeUntilEvent,
    eventLink,
  });

  await sendMail(
    email,
    `Reminder: ${eventTitle}`,
    html
  );

  return { success: true, email, eventId };
};

const processPasswordResetConfirmation = async (job) => {
  const { email, name, resetDate } = job.data;

  const html = passwordResetConfirmationTemplate({
    name: name || 'User',
    email,
    resetDate: new Date(resetDate).toLocaleString(),
  });

  await sendMail(
    email,
    'Password Successfully Reset',
    html
  );

  return { success: true, email };
};

module.exports = {
  processNewEvent,
  processForgotPassword,
  processRegistration,
  processReminder,
  processPasswordResetConfirmation,
};
