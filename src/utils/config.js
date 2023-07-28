/*jslint
node
*/
"use strict";
const availableRoles = {
    admin: "admin",
    client: "client",
    driver: "driver"
};
const errors = {
    alreadyAssigned: {
        message: {
            en: "Sorry this resource has already been assigned",
            fr: "Désolé, cette ressource a déjà été attribuée"
        },
        status: 451
    },
    alreadyCancelled: {
        message: {
            en: "Sorry this resource has already been cancelled",
            fr: "Désolé, cette ressource a déjà été annulée"
        },
        status: 450
    },
    cannotPerformAction: {
        message: {
            en: "You can not perform this action now",
            fr: "Vous ne pouvez pas effectuer cette action actuellement"
        },
        status: 454
    },
    internalError: {
        message: {
            en: "Something went wrong while processing your request",
            fr: "Un problème s'est produit lors du traitement de votre demande"
        },
        status: 501
    },
    invalidCredentials: {
        message: {
            en: "You provided invalid authentication credentials",
            fr: "Vous avez fourni des informations " +
            "d'authentification non valides"
        },
        status: 400
    },
    invalidCode: {
        message: {
            en: "you provided an invalid verification code",
            fr: "vous avez fourni un code de vérification non valide"
        },
        status: 441
    },
    invalidLocation: {
        message: {
            en: "The latitude and longitude must be a valid number",
            fr: "La latitude et la longitude doivent être des nombres valides."
        },
        status: 440
    },
    invalidValues: {
        message: {
            en: "you provided one or many invalid informations",
            fr: "Vous avez fourni une ou plusieurs informations invalide"
        },
        status: 400
    },
    invalidUploadValues: {
        message: {
            en: "you should provide informations you want to update",
            fr: "vous devez fournir les informations que vous " +
            "souhaitez mettre à jour"
        },
        status: 400
    },
    notAuthorized: {
        message: {
            en: "You are not authorized to perform this action",
            fr: "Vous n'êtes pas autorisé à effectuer cette action"
        },
        status: 401
    },
    notFound: {
        message: {
            en: "Item not found",
            fr: "Objet non trouvé"
        },
        status: 404
    },
    otpSendingFail: {
        message: {
            en: "Could not send OTP through SMS",
            fr: "Impossible d'envoyer l'OTP par SMS"
        },
        status: 440
    },
    otpVerificationFail: {
        message: {
            en: "Could not verify OTP right now",
            fr: "Impossible de vérifier l'OTP pour le moment"
        },
        status: 440
    },
    requestOTP: {
        message: {
            en: "invalid OTP, you should consider requesting another one",
            fr: "OTP non valide, vous devriez envisager d'en demander un autre."
        },
        status: 448
    },
    tokenExpired: {
        message: {
            en: "Your access Token has expired, please login again",
            fr: "Votre accès a expiré, veuillez vous connecter à nouveau."
        },
        status: 402
    }
};

const defaultValues = {
    ttl: 180
};
const config = Object.freeze({
    availableRoles,
    defaultValues,
    errors,
    getOTPConfig() {
        const {
            otp_key,
            otp_send,
            otp_verify
        } = process.env;
        return Object.freeze({
            getSendingBody: function (receiver, signature) {
                return {
                    api_key: otp_key,
                    channel: "generic",
                    from: "VAMVAM",
                    message_text: "<#> Your verification code is" +
                    " @vamvam@ \n\n" + signature,
                    message_type: "ALPHANUMERIC",
                    pin_attempts: 3,
                    pin_length: 6,
                    pin_placeholder: "@vamvam@",
                    pin_time_to_live: 3,
                    to: receiver
                };
            },
            getVerificationBody: function (pin_id, pin) {
                return {
                    api_key: otp_key,
                    pin,
                    pin_id
                };
            },
            sent_url: otp_send,
            verify_url: otp_verify
        });
    },
    getdbConfig() {
        const {
            dev_db,
            NODE_ENV: env = "test",
            DB_PASSWORD: password = null,
            db_port: port,
            production_db,
            test_db,
            DB_USER: username = "root"
        } = process.env;
        const configs = {
            development: {
                database: dev_db,
                password,
                port,
                username
            },
            production: {
                database: production_db,
                password,
                port,
                username
            },
            test: {
                database: test_db,
                password,
                port,
                username
            }
        };
        return configs[env];
    }
});

module.exports = config;