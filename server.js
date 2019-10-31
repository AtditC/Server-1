const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const fs = require("fs");
const app = express();
const port = 25;

const ssl = false;

app.use(bodyParser.urlencoded({ limit: "100mb", extended: true }));
app.use(bodyParser.json({ limit: "100mb", extended: true}));
app.use(require("morgan")("dev"));

app.all("/*", function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

require("./routes/schulnetzgrabber/schulnetzgrabber")(app);

if (ssl) {
    const privateKey = fs.readFileSync("privkey.pem", "utf8");
    const certificate = fs.readFileSync("fullchain.pem", "utf8");
    const credentials = {
        "key": privateKey,
        "cert": certificate
    };

    let server = https.createServer(credentials, app);
    server.listen(port);
} else {
    app.listen(port);
}

console.log();
console.log("API server listening on port " + port + "...");
console.log("SSL: " + ssl);
console.log();
