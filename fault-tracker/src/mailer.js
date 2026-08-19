const nodemailer = require('nodemailer');

// If SMTP_HOST is set (see .env.example), we send through that real
// provider. Otherwise we fall back to Ethereal, nodemailer's fake-SMTP
// testing service: it accepts the message and gives back a preview URL, but
// never delivers to a real inbox. That fallback is what makes `npm start`
// and the test suite work out of the box with zero configuration.
let transporterPromise = null;

function hasRealSmtpConfig() {
  return Boolean(process.env.SMTP_HOST);
}

// Pure and side-effect free (just reads env vars) so it can be unit tested
// without actually connecting to anything.
function realTransportConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  };
}

function fromAddress() {
  return process.env.SMTP_FROM || '"Fault Tracker" <no-reply@fault-tracker.example>';
}

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve()
      .then(() => {
        if (hasRealSmtpConfig()) {
          return nodemailer.createTransport(realTransportConfig());
        }
        return nodemailer
          .createTestAccount()
          .then((testAccount) =>
            nodemailer.createTransport({
              host: testAccount.smtp.host,
              port: testAccount.smtp.port,
              secure: testAccount.smtp.secure,
              auth: { user: testAccount.user, pass: testAccount.pass },
            })
          );
      })
      .catch((err) => {
        transporterPromise = null; // allow retrying on the next call
        throw err;
      });
  }
  return transporterPromise;
}

async function sendFaultNotification(landlordEmails, fault) {
  if (!landlordEmails || landlordEmails.length === 0) return null;

  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: fromAddress(),
    to: landlordEmails.join(', '),
    subject: `New fault reported: ${fault.title}`,
    text: [
      `${fault.tenantName} (unit ${fault.unit}) reported a new fault:`,
      '',
      fault.title,
      fault.description,
      '',
      fault.photos && fault.photos.length > 0
        ? `${fault.photos.length} photo(s) attached — view them in the landlord dashboard.`
        : null,
      `Reported at ${fault.createdAt}`,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[email] fault notification sent, preview: ${previewUrl}`);
  } else {
    console.log(`[email] fault notification sent to ${landlordEmails.join(', ')}`);
  }
  return info;
}

module.exports = { sendFaultNotification, getTransporter, hasRealSmtpConfig, realTransportConfig };
