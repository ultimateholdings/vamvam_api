/*jslint node*/
const nodemailer = require("nodemailer");
const Handlebars = require("handlebars");
const buildEmailTemplate = require("./email-template");
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
    function getEmailTemplate({title, content, redirectLink}){
        return Handlebars.compile(
            buildEmailTemplate({title, content, redirectLink})
        );
    }
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
    function notifyWithEmail({email, notification}) {
        const html = getEmailTemplate({
            title: notification.title,
            content: notification.body
        })();
        if (typeof email === "string" && email.length > 0) {
            sendEmail({
                callback: handleResponse,
                html,
                subject: notification.title,
                text: notification.body,
                to: email
            })
        }
    }
    return Object.freeze({
        getEmailTemplate,
        handleResponse,
        notifyWithEmail,
        sendEmail
    });
}

module.exports = Object.freeze(createMailer);