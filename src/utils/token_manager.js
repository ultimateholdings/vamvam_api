import jwt from "jsonwebtoken";

const {
    JWT_SECRET:secret="test1234butdefault",
    TOKEN_EXP:expiration=3600
} = process.env;

function jwtWrapper(){
    return {
        sign(payload) {
            return jwt.sign(payload,secret,{expiresIn: expiration});
        },
        async verify(token) {
            let verifiedToken;
            try {
                verifiedToken = await new Promise(function tokenExecutor(res, rej) {
                    jwt.verify(token, secret, function (err, decoded) {
                        if (decoded === undefined) {
                            rej(err);
                        } else {
                            res(decoded);
                        }
                    });
                });
                return {valid: true, token: verifiedToken};
            } catch (error) {
                return {valid: false};
            }
        }
    }    
}

function tokenManager(tokenService=jwtWrapper()) {
    return {
        generate(payload) {
            return tokenService.sign(payload);
        },
        async validate(token) {
            let result = await tokenService.verify(token);
            return result;
        }
    }
}
export default Object.freeze(tokenManager);