const config = require("./config.json");

module.exports = function(req, res, next) {
    let token = req.body.token || req.query.token;

    if (token) {
        if (token === config.token) {
            next();
        } else {
            console.log("SNC: Wrong token: " + token);
            return res.json({"error": true});
        }
    } else {
        console.log("No token found!");
        return res.status(403).send({
            "error": true
        });
    }
};