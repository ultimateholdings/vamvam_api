/*jslint
node
*/
"use strict";
function settingReducer(acc, [key, setting]) {
    acc[setting.value] = {
        options: Object.entries(setting.options).reduce(function (
            prev,
            [otp_key, opt_value]
        ) {
            prev[opt_value] = otp_key;
            return prev;
        }, Object.create(null)),
        value: key
    };
    return acc;
}
const availableRoles = {
    adminRole: "admin",
    clientRole: "client",
    conflictManager: "conflict-manager",
    driverRole: "driver",
    registrationManager: "registration-manager"
};
const apiRoles = {
    client: availableRoles.clientRole,
    conflict: availableRoles.conflictManager,
    driver: availableRoles.driverRole,
    registration: availableRoles.registrationManager
};
const defaultConflicts = [
    {code: "level_1", en: "outage", fr: "panne"},
    {code: "level_2", en: "accident", fr: "accident"},
    {code: "level_3", en: "dispute", fr: "litige"},
    {code: "level_4", en: "assault", fr: "agression"},
    {code: "level_5", en: "non-payment", fr: "défaut de paiement"}
];
const defaultPackageType = [
    {code: "type_1", en: "fragile", fr: "fragile"},
    {code: "type_2", en: "solid", fr: "solide"},
    {code: "type_3", en: "sensitive", fr: "délicat"}
];
const apiSettings = {
    delivery: {
        defaultValues: {
            delivery_conflicts: defaultConflicts,
            delivery_packages: defaultPackageType,
            delivery_ttl: 180,
            driver_search_radius: 5500
        },
        options: {
            conflict_types: "delivery_conflicts",
            package_types: "delivery_packages",
            search_radius: "driver_search_radius",
            ttl: "delivery_ttl"
        },
        value: "delivery-settings"
    },
    otp: {
        defaultValues: {otp_ttl: 180},
        options: {
            ttl: "otp_ttl"
        },
        value: "otp-settings"
    }
};
const errors = {
    alreadyAssigned: {
        message: {
            en: "Sorry this delivery has already been assigned",
            fr: "Désolé, cette livraison a déjà été attribuée"
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
    alreadyRated: {
        message: {
            en: "Sorry this delivery has already been rated",
            fr: "Désolé, cette livraison a déjà été évaluée"
        },
        status: 452
    },
    alreadyRegistered: {
        message: {
            en: "Sorry but you've already made apply for a registration",
            fr: "Désolé, mais vous avez déjà fait une demande d'enregistrement."
        },
        status: 452
    },
    alreadyReported: {
        message: {
            en: "Sorry this delivery already has conflicts",
            fr: "Désolé, cette livraison a déjà des conflits"
        },
        status: 452
    },
    cannotPerformAction: {
        message: {
            en: "You can not perform this action now",
            fr: "Vous ne pouvez pas effectuer cette action actuellement"
        },
        status: 454
    },
    conflictNotFound: {
        message: {
            en: "you're looking for a non-existing conflict",
            fr: "vous recherchez un conflit inexistant"
        },
        status: 404
    },
    deliveryNotConflicted: {
        message: {
            en: "This delivery has no conflicts",
            fr: "Cette livraison n'est pas conflictuelle"
        },
        status: 454
    },
    deliveryTimeout: {
        message: {
            en: "The delay to react to this delivery request is over",
            fr: "Le délai de réaction à cette demande de livraison est dépassé"
        },
        status: 410
    },
    driverNotFound: {
        message: {
            en: "The driver you're looking for does not exists",
            fr: "Le transporteur que vous recherchez n'existe pas"
        },
        status: 404
    },
    emptyWallet: {
        en: "An empty wallet cannot be debited!",
        fr: "Un portefeuille vide ne peut être débité!",
        status: 424
    },
    existingUser: {
        message: {
            en: "This user already exists consider loggin in",
            fr: "Cet utilisateur existe déjà, pensez à vous connecter"
        },
        status: 453
    },
    forbiddenAccess: {
        message: {
            en: "You are forbidden from accessing this resource",
            fr: "L'accès à cette ressource vous est interdit"
        },
        status: 403
    },
    inactiveAccount: {
        message: {
            en:
            "Your account is not yet active please contact the support" +
            " for any issue",
            fr:
            "Votre compte n'est pas encore actif, veuillez contacter le" +
            " support pour tout problème."
        },
        status: 401
    },
    internalError: {
        message: {
            en: "Something went wrong while processing your request",
            fr: "Un problème s'est produit lors du traitement" +
            " de votre demande"
        },
        status: 500
    },
    invalidCode: {
        message: {
            en: "you provided an invalid verification code",
            fr: "vous avez fourni un code de vérification non valide"
        },
        status: 441
    },
    invalidCredentials: {
        message: {
            en: "You provided invalid authentication credentials",
            fr:
            "Vous avez fourni des informations " +
            "d'authentification non valides"
        },
        status: 400
    },
    invalidLocation: {
        message: {
            en: "The latitude and longitude must be a valid number",
            fr: "La latitude et la longitude doivent être des nombres valides."
        },
        status: 440
    },
    invalidUploadValues: {
        message: {
            en: "you should provide informations you want to update",
            fr:
            "vous devez fournir les informations que vous " +
            "souhaitez mettre à jour"
        },
        status: 400
    },
    invalidValues: {
        message: {
            en: "you provided one or many invalid informations",
            fr: "Vous avez fourni une ou plusieurs informations invalide"
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
    paymentApproveFail: {
        message: {
            en: "Unapproved payment!",
            fr: "Paiement non approuvé!"
        },
        status: 401
    },
    paymentSendingFail: {
        message: {
            en: "Could not initalize payment",
            fr: "Impossible d'initialiser le payment"
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
    tokenInvalid: {
        message: {
            en: "Your access key is invalid, please login again",
            fr: "Votre clé d'accès est Invalide, " +
            "veuillez vous connecter à nouveau"
        },
        status: 402
    },
    ttlNotExpired: {
        message: {
            en: "your previous request has not yet expired please wait",
            fr: "votre demande précédente n'a pas encore expiré" +
            " veuillez patienter"
        },
        status: 422
    },
    unsupportedType: {
        message: {
            en: "the type you provided is not yet supported",
            fr: "le type que vous avez fourni n'est pas encore pris en charge"
        },
        status: 414
    },
    withdrawingExeption: {
        message:{
            en: "Error when withdrawing a delivery point",
            fr: "Erreur survenu lors du retrait du point de livraison"
        },
        status: 500
    }
};

const eventMessages = {
    addBonus: {
        en: {
            title:"Incentive bonus!",
            body: "You have received yy bonus points "
        },
        fr: {
            title:"Prime d'encouragement!",
            body: "Vous avez reçus yy points bonus"
        }
    },
    deliveryAccepted: {
        en: {
            body: "A driver is available for your delivery",
            title: "Delivery accepted"
        },
        fr: {
            body: "Un chauffeur est disponible pour votre livraison",
            title: "Livraison acceptée"
        }
    },
    deliveryCancelled: {
        en: {
            body: "Sorry but the client has cancelled the delivery",
            title: "Delivery canceled"
        },
        fr: {
            body: "Désolé mais le client a annulé la livraison",
            title: "Livraison annulée"
        }
    },
    deliveryEnd: {
        en: {
            body: "Your delivery is now completed thank you and see you soon",
            title: "Delivery completed"
        },
        fr: {
            body: "Votre livraison est maintenant terminée merci et à bientôt",
            title: "Livraison terminée"
        }
    },
    deliveryStarted: {
        en: {
            body: "Your delivery has started you can keep an eye its evolution",
            title: "Delivery started"
        },
        fr: {
            body: "Votre livraison a commencée, vous pouvez" +
            " suivre son évolution",
            title: "Début de la livraison"
        }
    },
    driverArrived: {
        en: {
            body: "Please once you give him the package, confirm it here",
            title: "The driver has arrived"
        },
        fr: {
            body:
            "Une fois que vous lui aurez remis le paquet," +
            " veuillez le confirmer ici.",
            title: "Le chauffeur est arrivé"
        }
    },
    failurePayment: {
        en: {
            title:"Failed payment!",
            body: "You have tried to top up your account without success"
        },
        fr: {
            title:"Echec du paiement!",
            body: "Vous avez essayé de recharger votre compte sans succès"
        }
    },
    newAssignment: {
        en: {
            body: "You have been tasked to complete a conflicting delivery",
            title: "Emergency Alert"
        },
        fr: {
            body:
            "Vous avez été chargé(e) de mener à bien une" +
            " livraison conflictuelle",
            title: "Alerte d'urgence"
        }
    },
    newConflict: {
        en: {
            body:
            "A conflict has been reported during your delivery," +
            " please contact the support for further information",
            title: "Conflict reported"
        },
        fr: {
            body:
            "Un conflit a été signalé lors de votre livraison, veuillez" +
            " contacter le service d'assistance pour plus d'informations",
            title: "Conflit signalé"
        }
    },
    newDelivery: {
        en: {
            body: "You have a new delivery request close to you, check it out",
            title: "New delivery"
        },
        fr: {
            body:
            "Vous avez une nouvelle demande de livraison près" +
            " de vous, consultez-la",
            title: "Nouvelle livraison"
        }
    },
    newInvitation: {
        en: {
            body: "You have been invited to track a delivery",
            title: "New Invitation"
        },
        fr: {
            body: "Vous avez été invité à suivre une livraison",
            title: "Nouvelle Invitation"
        }
    },
    newRoom: {
        en: {
            body: "Now you can talk to your delivery contact.",
            title: "New discussion"
        },
        fr: {
            body:
            "Vous pouvez désormais dialoguer avec votre interlocuteur" +
            "  pour la livraison",
            title: "Nouvelle discussion"
        }
    },
    removeBonus: {
        en: {
            title:"Withdrawal of bonus points!",
            body: "Your account has been debited with xx bonus points"
        },
        fr: {
            title:"Retrait de point bonus!",
            body: "Votre compte a été débité de xx points bonus"
        }
    },
    roomDeletedBody: {
        en: "This discussion is now archived due to the end of the delivery",
        fr:
        "Cette discussion est désormais archivée suite à la fin" +
        " de la livraison."
    },
    successPayment: {
        en: {
            title:"Successful payment!",
            body: "You have topped up your account by amount XAF"
        },
        fr: {
            title:"Paiement effectuer avec succès!",
            body: "Vous avez rechargé votre compte de amount XAF"
        }
    },
    withSameContent(title, body) {
        return {
            en: {body, title},
            fr: {body, title}
        };
    },
    withSameTitle(title, body) {
        return {
            en: {body: body?.en, title},
            fr: {body: body?.fr, title}
        };
    }
};

const responseMessage = {
    successWithdrawal: {
        en: "Successful point removal!",
        fr: "Retrait des points réussi!"
    }
};
const conflictStatuses = Object.freeze({
    cancelled: "cancelled",
    closed: "close",
    opened: "open"
});
const deliveryStatuses = Object.freeze({
    cancelled: "cancelled",
    inConflict: "conflicting",
    initial: "pending-driver-approval",
    pendingReception: "pending-driver-reception",
    started: "started",
    terminated: "terminated",
    toBeConfirmed: "pending-client-approval"
});
const apiDeliveryStatus = Object.freeze({
    cancelled: deliveryStatuses.cancelled,
    conflicting: deliveryStatuses.inConflict,
    ongoing: deliveryStatuses.started,
    terminated: deliveryStatuses.terminated
});
const userStatuses = {
    activated: "active",
    inactive: "desactivated",
    pendingValidation: "pending",
    rejected: "rejected"
};
const ages = ["18-24", "25-34", "35-44", "45-54", "55-64", "64+"];
const otpTypes = {
    authentication: "auth",
    reset: "reset"
};

const staticPaymentProps = {
    country: "CM",
    currency: "XAF",
    debit_amount: 300,
    debit_type: "withdrawal",
    recharge_point: 0,
    tx_ref: "transfer-" + Date.now()
};

const config = Object.freeze({
    ages,
    apiDeliveryStatus,
    apiRoles: Object.freeze(apiRoles),
    apiSettings: Object.freeze(apiSettings),
    availableRoles: Object.freeze(availableRoles),
    conflictStatuses,
    dbSettings: Object.freeze(Object.entries(apiSettings).reduce(
        settingReducer,
        Object.create(null)
    )),
    deliveryStatuses,
    errors: Object.freeze(errors),
    eventMessages: Object.freeze(eventMessages),
    getFirebaseConfig() {
        const {
            fb_serverKey: key,
            msg_url: url
        } = process.env;
        return Object.freeze({
            headers: {
                Authorization: "key=" + key,
                "content-type": "application/json"
            },
            url
        });
    },
    getOTPConfig() {
        const {otp_key, otp_send, otp_verify} = process.env;
        return Object.freeze({
            getSendingBody(receiver, signature = "") {
                return {
                    api_key: otp_key,
                    channel: "generic",
                    from: "VAMVAM",
                    message_text: "Your verification code is" +
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
    getPaymentConfig(transactionId) {
        let verify_url;
        const result = Object.create(null);
        verify_url = process.env.flw_verify_url;
        verify_url = verify_url.replace("transactionId", transactionId);
        result.expect_currency = process.env.currency;
        result.flw_key = process.env.FLW_SECRET_KEY;
        result.secret_hash = process.env.FLW_SECRET_HASH;
        result.url_charge = process.env.flw_payment_url;
        result.url_verify = verify_url;
        return Object.freeze(result);
    },
    getdbConfig() {
        const result = Object.create(null);
        result.password = process.env.DB_PASSWORD ?? null;
        result.port = process.env.db_port;
        result.username = process.env.DB_USER;
        if (process.env.NODE_ENV === "development") {
            result.database = process.env.dev_db;
            return Object.freeze(result);
        }
        if (process.env.NODE_ENV === "production") {
            result.database = process.env.production_db;
            return Object.freeze(result);
        }
        result.database = process.env.test_db;
        return Object.freeze(result);
    },
    otpTypes,
    responseMessage: Object.freeze(responseMessage),
    staticPaymentProps,
    tokenTtl: process.env.TOKEN_EXP,
    userStatuses
});
module.exports = config;
