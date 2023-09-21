/*jslint node*/
const nodemailer = require("nodemailer");
const {
    mailer_account,
    mailer_password,
    mailer_host
} = process.env;

function createMailer() {
    const transporter = nodemailer.createTransport({
        auth: {
            user: mailer_account,
            pass: mailer_password
        },
        host: mailer_host,
        secure: true,
        port: 465,
        pool: true,
        tls: {
            rejectUnauthorized: false
        }
    });
    function sendEmail({callback, html, sender, subject, text, to}) {
        const options = {
            envelope: {
                from: (
                    (sender ?? "Vamvam errata") +
                    "< " + mailer_account + " >"
                ),
                to
            },
            from: mailer_account,
            html,
            priority: "high",
            subject: subject ?? "New Exception raised in the vamvam api",
            text,
            to

        };
        transporter.sendMail(options, callback);
    }
    function handleResponse(err, info) {
        if (err) {
            console.error(err);
        } else {
            console.log(JSON.stringify(info, null, 4));
        }
    }
    return Object.freeze({handleResponse, sendEmail});
}

module.exports = Object.freeze(createMailer);