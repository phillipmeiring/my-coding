const nodemailer = require('nodemailer');

// Ethereal is nodemailer's fake-SMTP testing service: it accepts the message
// and gives back a preview URL, but never delivers to a real inbox. There's
// no real email provider configured for this demo app, so this stands in
// for one — see README.md.
let transporterPromise = null;

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = nodemailer
      .createTestAccount()
      .then((testAccount) =>
        nodemailer.createTransport({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: { user: testAccount.user, pass: testAccount.pass },
        })
      )
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
    from: '"Fault Tracker" <no-reply@fault-tracker.example>',
    to: landlordEmails.join(', '),
    subject: `New fault reported: ${fault.title}`,
    text: [
      `${fault.tenantName} (unit ${fault.unit}) reported a new fault:`,
      '',
      fault.title,
      fault.description,
      '',
      `Reported at ${fault.createdAt}`,
    ].join('\n'),
  });

  console.log(`[email] fault notification sent, preview: ${nodemailer.getTestMessageUrl(info)}`);
  return info;
}

module.exports = { sendFaultNotification, getTransporter };
