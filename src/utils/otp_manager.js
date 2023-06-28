
function otpManager(otpSender, dbService) {
    function generateCode() {
        return Math.floor(Math.random() * 2500);
    }
    return {
        sendCode: async function (phoneNumber) {
            let otpCode = generateCode();
            await dbService.saveCode(phoneNumber, otpCode);
            return otpSender(phoneNumber, otpCode);
        },
        verifyCode: async function (phoneNumber, code) {
            let originalCode = await dbService.getCode(phoneNumber);
            return originalCode === code;
        }
    };
}



export default Object.freeze(otpManager);