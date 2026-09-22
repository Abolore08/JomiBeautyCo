const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const session = require('express-session');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8,
  },
}));
app.use(express.static(path.join(__dirname)));

function isAdmin(req) {
  return req.session.isAdmin === true;
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({ success: false, message: 'Admin login required.' });
  }
  return next();
}

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/admin/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(500).json({
      success: false,
      message: 'Admin credentials are not configured on the server.',
    });
  }

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Incorrect username or password.' });
  }

  req.session.isAdmin = true;
  return res.json({ success: true });
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(error => {
    if (error) {
      console.error('Admin logout error:', error);
      return res.status(500).json({ success: false, message: 'Could not log out.' });
    }
    return res.json({ success: true });
  });
});

app.get('/admin/status', (req, res) => {
  res.json({ authenticated: isAdmin(req) });
});

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const smtpPort = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !pass) {
    return nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
  }

  return nodemailer.createTransport({
    host,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user,
      pass,
    },
  });
}

async function sendSubscriptionEmail({ email, name }) {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  if (!adminEmail) {
    throw new Error('ADMIN_EMAIL or SMTP_USER is not configured.');
  }

  const transporter = createTransport();
  const subscribedAt = new Date().toLocaleString();

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'JomiBeautyCO <noreply@example.com>',
    to: adminEmail,
    replyTo: email,
    subject: `New subscription from ${name || 'a customer'}`,
    text: `A new subscriber has signed up for JomiBeautyCO updates.\n\nName: ${name || 'Not provided'}\nEmail: ${email}\nTime: ${subscribedAt}`,
    html: `
      <h2>New subscription</h2>
      <p><strong>Name:</strong> ${name || 'Not provided'}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subscribed at:</strong> ${subscribedAt}</p>
    `,
  };

  return transporter.sendMail(mailOptions);
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/subscribe', async (req, res) => {
  const email = String(req.body.email || '').trim();
  const name = String(req.body.name || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid email address.',
    });
  }

  try {
    await sendSubscriptionEmail({ email, name });
    return res.json({
      success: true,
      message: 'Thanks for subscribing. Your details have been sent to the admin inbox.',
    });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({
      success: false,
      message: 'The subscription could not be sent right now. Please try again later.',
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
}

module.exports = { app, sendSubscriptionEmail };
