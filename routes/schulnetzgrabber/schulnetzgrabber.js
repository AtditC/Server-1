String.prototype.replaceAll = function(search, replacement) {
    let target = this;
    return target.replace(new RegExp(search, "g"), replacement);
};

const verifyClient = require("./verifyClient");
const request = require("request");
const fs = require("fs");

const debug = false;
const debugFile = "Empty";

const config = require("./config.json");

const datePattern = /(\d{2})\.(\d{2})\.(\d{4})/;

let person = {};
let events = [];
let comrades = [];

let android = {
    "lektion": {
        "1": {},
        "2": {},
        "3": {}
    },
    "noten": [],
    "offene_absenzen": [],
    "absenzmeldungen_ohne_absenz": [],
    "lektionen": []
};

let update = {
    "desktop": {
        "person": true,
        "events": true
    },
    "android": {
        "person": true,
        "events": true
    }
};

let counter = 0;

module.exports = function(app) {
    console.log("SchulNetzGrabber v-2.4 started, debug: " + debug);

    /* Begin Desktop */
    app.post("/schulnetzgrabber/init", verifyClient, function(req, res) { // Currently unused
        console.log("Incoming request, initializing");
        update.desktop.person = false;
        update.desktop.events = false;
        res.json({
            "person": person,
            "events": events
        })
    });

    app.post("/schulnetzgrabber/heartbeat", verifyClient, function(req, res) { // Currently unused
        console.log("Incoming request, sending desktop update status...");
        res.json({
            "person": update.desktop.person,
            "events": update.desktop.events
        });
    });

    app.post("/schulnetzgrabber", verifyClient, function(req, res) {
        console.log("Incoming request, sending person object...");
        res.json(person);
    });


    /* Begin App */
    app.post("/schulnetzgrabber/app/init", verifyClient, function(req, res) { // Currently unused
        console.log("Incoming request, initializing app...");
        update.android.person = false;
        update.android.events = false;
        res.json({
            "person": person,
            "events": events
        });
    });

    app.post("/schulnetzgrabber/app/heartbeat", verifyClient, function(req, res) { // Currently unused
        console.log("Incoming request, sending app update status...");
        res.json({
            "person": update.android.person,
            "events": update.android.events
        });
    });

    app.post("/schulnetzgrabber/app", verifyClient, function(req, res) {
        console.log("Incoming request from app, sending new stuff...");
        res.json(android);
        android.noten = [];
        android.offene_absenzen = [];
        android.absenzmeldungen_ohne_absenz = [];
        android.lektionen = [];
    });


    /* Events */
    app.post("/schulnetzgrabber/events", verifyClient, function(req, res) { // Currently unused
        console.log("Incoming request, sending events object...");
        res.json(events);
    });

    app.post("/schulnetzgrabber/person/events/add", verifyClient, function(req, res) { // Currently unused
        console.log("Incoming request, adding event:");

        let event = req.body["event"];
        console.log(event);

        let id = "";

        while (!(id in events) || id === "") {
            for (let i = 0; i < 16; i++) {
                id += app.pool.charAt(Math.floor(Math.random() * app.pool.length));
            }
        }

        update.android.events = true;
        update.desktop.events = true;

        events[id] = event;
        console.log("Added event.");
        res.json({"error": false})
    });

    app.post("/schulnetzgrabber/person/remove", verifyClient, function(req, res) { // Currently unused
        console.log("Incoming request, removing event:");

        let event = req.body["event"];
        console.log(event);

        if (id in events) {
            update.android.events = true;
            update.desktop.events = true;
            delete events[id];
            console.log("Deleted event.");
            res.json({"error": false})
        } else {
            console.log("Didn't find event.");
            res.json({"error": true});
        }
    });

    initialize();
};

function grabber() {
    if (debug) {
        grabFile();
    } else {
        grabSN();
    }
}

function updateBirthdayEvents() {
    for (let comrade in comrades) {
        let vorname = comrade["Vorname"];
        let birthday = comrade["Geburtstag"];
    }
}

function getBirthdistance(birthday, yearsToAdd) {
    let date = new Date(birthday.replace(datePattern, "$3-$2-$1") + "T00:00:00.000+02:00"); // TIMEZONE OFFSET
    let differenceMilliseconds = date.getTime() - Date.now();
    if (differenceMilliseconds > 0) {
        return getBirthdistance(birthday, 1);
    }
}

function initialize() {
    getPerson();
    //getEvents();


    comrades = JSON.parse(fs.readFileSync(schuelerFile).toString());
    updateBirthdayEvents();

    setInterval(grabber, 1000 * 60);
    setTimeout(grabber, 1000);
    setInterval(updateActiveLessons, 1000);
}

function getPerson() {
    person = JSON.parse(fs.readFileSync(personFile).toString());
}

function getEvents() {
    events = JSON.parse(fs.readFileSync(eventsFile).toString());
}

function savePerson() {
    fs.writeFileSync(personFile, JSON.stringify(person));
}

function saveEvents() {
    fs.writeFileSync(eventsFile, JSON.stringify(events));
}

function grabFile() {
    grab(fs.readFileSync(debugFile).toString());
}

function grabSN() {
    request.post({url: config.auth.link, form: {"pin": config.auth.pin}}, function(err, resp, body) {
        if (!err) {
            grab(body);
        }
    });
}

function grab(source) {
    let datum = grabDatum(source);
    let newPerson = {};

    newPerson["timestamp"] = Date.now();
    newPerson["date"] = datum[0];
    newPerson["time"] = datum[1];
    newPerson["source"] = source;
    newPerson["sourceSplit"] = datum[2];
    newPerson["noten"] = grabNoten(source);
    newPerson["offene_absenzen"] = grabOffeneAbsenzen(source);
    newPerson["absenzmeldungen_ohne_absenz"] = grabAbsenzmeldungenOhneAbsenz(source);
    newPerson["lektionen"] = grabLektionen(source, datum[0]);
    newPerson["defaultLektionen"] = config.defaultLektionen;

    comparator(newPerson);
}

function getAbbreviatedLektionenText(subject) {
    subject = subject.includes("-") ? subject.split("-")[0] : subject.split(".")[0];

    return config.subject_abbreviations[subject];
}

function updateActiveLessons() {
    if (counter === 0) return;

    //console.log(android);

    let lektionenIndex = getCurrentLektionenIndex();
    let lektionen = person["lektionen"];

    let none = {"output": ""};

    android["lektion"] = {
        "1": lektionen.length >= lektionenIndex + 1 && lektionenIndex !== -1 ? lektionen[lektionenIndex] : none,
        "2": lektionen.length >= lektionenIndex + 2 && lektionenIndex !== -1 ? lektionen[lektionenIndex + 1] : none,
        "3": lektionen.length >= lektionenIndex + 3 && lektionenIndex !== -1 ? lektionen[lektionenIndex + 2] : none
    }
}

function getCurrentLektionenIndex() {
    let lektionen = person["lektionen"];

    if (lektionen.length === 0) return -1;

    let now = Date.now();

    for (let i = 0; i < lektionen.length; i++) {
        let lektion = lektionen[i];

        if (i === 0 && lektion.startTimestamp > now) return 0;

        if (lektion.startTimestamp < now && lektion.endTimestamp > now) { // current lesson
            return i;
        }

        if (i + 1 !== lektionen.length && lektionen[i + 1].startTimestamp > now) { // next lesson
            return i + 1;
        }
    }

    return -1;
}

function containsObject(objectList, otherObject) {
    for (let i = 0; i < objectList.length; i++) {
        let object = objectList[i];

        if (object["output"] === otherObject["output"]) return true;
    }

    return false;
}

function comparator(newPerson) {
    counter++;

    /*
    if (counter === 1) { // First run doesn't have oldPerson
        person = newPerson;
        savePerson();
        return;
    }
    */

    let oldPerson = person;

    if (newPerson.sourceSplit !== oldPerson.sourceSplit) {
        console.log("Source changes detected");

        let changes = 0;
        let output = "";

        for (let i = 0; i < newPerson["noten"].length; i++) {
            let note = newPerson["noten"][i];

            if (!containsObject(oldPerson["noten"], note)) {
                changes++;
                output += "Found new Note: " + note.output + "\n";
                android.noten.push(note);
            }
        }

        for (let i = 0; i < newPerson["offene_absenzen"].length; i++) {
            let offeneAbsenz = newPerson["offene_absenzen"][i];

            if (!containsObject(oldPerson["offene_absenzen"], offeneAbsenz)) {
                changes++;
                output += "Found new offene Absenz: " + offeneAbsenz.output + "\n";
                android.offene_absenzen.push(offeneAbsenz);
            }
        }


        for (let i = 0; i < newPerson["absenzmeldungen_ohne_absenz"].length; i++) {
            let absenzmeldungOhneAbsenz = newPerson["absenzmeldungen_ohne_absenz"][i];

            if (!containsObject(oldPerson["absenzmeldungen_ohne_absenz"], absenzmeldungOhneAbsenz)) {
                changes++;
                output += "Found new Absenzmeldung ohne Absenz: " + absenzmeldungOhneAbsenz.output + "\n";
                android.absenzmeldungen_ohne_absenz.push(absenzmeldungOhneAbsenz);
            }
        }

        for (let i = 0; i < newPerson["lektionen"].length; i++) {
            let lektion = newPerson["lektionen"][i];

            if (oldPerson.date === newPerson.date && !containsObject(oldPerson["lektionen"], lektion)) {
                changes++;
                output += "Found new Lektion: " + lektion.output + "\n";
                android.lektionen.push(lektion);
            }
        }

        if (changes > 0) {
            console.log("Changes detected (" + changes + ")");
            console.log(output);
        } else {
            console.log("No changes detected. Date switch: " + (oldPerson.date !== newPerson.date));
        }
    }

    person = newPerson;
    savePerson();
}

function getDate(date) {
    return new Date(date.replace(datePattern, "$3-$2-$1") + "T00:00:00.000+02:00"); // TIMEZONE OFFSET
}

function getDateWithTime(date, time) {
    return new Date(date.replace(datePattern, "$3-$2-$1") + "T" + time + ":00.000+02:00"); // TIMEZONE OFFSET
}

function getLessonEnd(dateStart) {
    return new Date(dateStart.getTime() + 1000 * 60 * 45); // 45 minutes per lesson
}

function getHoursAndTime(date) {
    return date.toTimeString().split(" ")[0].substring(0, 5); // HH:MM
}

function grabNoten(src) {
    let notenTable = src.substring(src.indexOf("Nicht bestätigte Noten") + 22);
    notenTable = notenTable.substring(0, notenTable.indexOf("</ul>"));

    let noten = notenTable.substring(notenTable.indexOf("<ul class=\"pageitem\">") + 21);

    if (noten.includes("Sie haben keine unbestätigten Noten.")) return [];

    let notenSrcListe = noten.split("<li");
    let notenListe = [];

    for (let i = 1; i < notenSrcListe.length; i++) {
        let notenSrc = notenSrcListe[i];

        let datum = notenSrc.substring(notenSrc.indexOf("<span class=\"header\">") + 21, notenSrc.indexOf("</span>"));
        notenSrc = notenSrc.substring(notenSrc.indexOf("</span>") + 7);
        let fach = notenSrc.substring(notenSrc.indexOf("<p>") + 3, notenSrc.indexOf("<br />"));
        notenSrc = notenSrc.substring(notenSrc.indexOf("<br />") + 6);
        let thema = notenSrc.substring(0, notenSrc.indexOf("<br />"));
        notenSrc = notenSrc.substring(notenSrc.indexOf("<br />") + 6);
        let note = notenSrc.substring(0, notenSrc.indexOf("<br />"));
        let output = datum + " - " + fach + " - " + thema + " - " + note;

        let notenObject = {
            "subject": fach,
            "topic": thema,
            "grade": note,
            "date": datum,
            "dateTimestamp": getDate(datum).getTime(),
            "output": output
        };

        notenListe.push(notenObject);
    }

    return notenListe;
}

function grabOffeneAbsenzen(src) {
    let offeneAbsenzenTable = src.substring(src.indexOf("Offene Absenzen") + 15);
    offeneAbsenzenTable = offeneAbsenzenTable.substring(0, offeneAbsenzenTable.indexOf("</ul>"));

    let offeneAbsenzen = offeneAbsenzenTable.substring(offeneAbsenzenTable.indexOf("<ul class=\"pageitem\">") + 21);

    if (offeneAbsenzen.includes("Sie haben keine offenen Absenzen.")) return [];

    let offeneAbsenzenSrcListe = offeneAbsenzen.split("<li");
    let offeneAbsenzenListe = [];

    for (let i = 1; i < offeneAbsenzenSrcListe.length; i++) {
        let offeneAbsenzenSrc = offeneAbsenzenSrcListe[i];

        let bisDatum = offeneAbsenzenSrc.substring(offeneAbsenzenSrc.indexOf("<span class=\"header\">Entschuldigen bis: ") + 40, offeneAbsenzenSrc.indexOf("</span>"));
        offeneAbsenzenSrc = offeneAbsenzenSrc.substring(offeneAbsenzenSrc.indexOf("</span>") + 7);
        let startDatum = offeneAbsenzenSrc.substring(offeneAbsenzenSrc.indexOf("<p>von: ") + 8, offeneAbsenzenSrc.indexOf(" - bis: "));
        offeneAbsenzenSrc = offeneAbsenzenSrc.substring(offeneAbsenzenSrc.indexOf(" - bis: ") + 8);
        let endDatum = offeneAbsenzenSrc.substring(0, offeneAbsenzenSrc.indexOf("</p>"));
        let output = startDatum + " - " + endDatum + " - " + bisDatum;

        let offeneAbsenzenObject = {
            "startDate": startDatum,
            "endDate": endDatum,
            "untilDate": bisDatum,
            "startTimestamp": getDate(startDatum).getTime(),
            "endTimestamp": getDate(endDatum).getTime(),
            "untilTimestamp": getDate(bisDatum).getTime(),
            "output": output
        };

        offeneAbsenzenListe.push(offeneAbsenzenObject);
    }

    return offeneAbsenzenListe;
}

function grabAbsenzmeldungenOhneAbsenz(src) {
    let absenzmeldungenOhneAbsenzTable = src.substring(src.indexOf("Absenzmeldungen ohne Absenz") + 27);
    absenzmeldungenOhneAbsenzTable = absenzmeldungenOhneAbsenzTable.substring(0, absenzmeldungenOhneAbsenzTable.indexOf("</ul>"));

    let absenzmeldungenOhneAbsenz = absenzmeldungenOhneAbsenzTable.substring(absenzmeldungenOhneAbsenzTable.indexOf("<ul class =\"pageitem\">") + 21);

    if (absenzmeldungenOhneAbsenz.includes("Sie haben keine Absenzmeldungen ohne Absenz.")) return [];

    let absenzmeldungenOhneAbsenzSrcListe = absenzmeldungenOhneAbsenz.split("<li");
    let absenzmeldungenOhneAbsenzListe = [];

    for (let i = 1; i < absenzmeldungenOhneAbsenzSrcListe.length; i++) {
        let absenzmeldungenOhneAbsenzSrc = absenzmeldungenOhneAbsenzSrcListe[i];

        let datum = absenzmeldungenOhneAbsenzSrc.substring(absenzmeldungenOhneAbsenzSrc.indexOf("<span class='header'>") + 21, absenzmeldungenOhneAbsenzSrc.indexOf(","));
        let zeit = absenzmeldungenOhneAbsenzSrc.substring(absenzmeldungenOhneAbsenzSrc.indexOf(", ") + 2, absenzmeldungenOhneAbsenzSrc.indexOf("</span>")).split(" - ");
        let output = datum + " - " + zeit[0] + " - " + zeit[1];

        let absenzmeldungOhneAbsenzenObject = {
            "date": datum,
            "startTime": zeit[0],
            "endTime": zeit[1],
            "startTimestamp": getDateWithTime(datum, zeit[0]).getTime(),
            "endTimestamp": getDateWithTime(datum, zeit[1]).getTime(),
            "output": output
        };

        absenzmeldungenOhneAbsenzListe.push(absenzmeldungOhneAbsenzenObject)
    }

    return absenzmeldungenOhneAbsenzListe;
}

function grabLektionen(src, date) {
    if (!src.includes("Tagesstundenplan")) return [];

    let lektionenTable = src.substring(src.indexOf("Tagesstundenplan") + 16);
    lektionenTable = lektionenTable.substring(0, lektionenTable.indexOf("</ul>"));

    let lektionen = lektionenTable.substring(lektionenTable.indexOf("<ul class=\"pageitem\">") + 21);
    lektionen = lektionen.replaceAll("&nbsp;", "-");

    let lektionenSrcListe = lektionen.split("<li");
    let lektionenListe = [];

    for (let i = 1; i < lektionenSrcListe.length; i++) {
        let lektionenSrc = lektionenSrcListe[i];

        let isYellow = lektionenSrc.includes("fdff5b");
        let isRed = lektionenSrc.includes("fb8c60");
        let isLined = lektionenSrc.includes("line-through");

        let zeit = lektionenSrc.substring(lektionenSrc.indexOf(">-") + 2, lektionenSrc.indexOf("---"));
        lektionenSrc = lektionenSrc.substring(lektionenSrc.indexOf("---") + 3);
        let zimmer = lektionenSrc.substring(0, lektionenSrc.indexOf("---"));
        lektionenSrc = lektionenSrc.substring(lektionenSrc.indexOf("---") + 3);
        let fach = lektionenSrc.substring(0, lektionenSrc.indexOf("---"));
        let output = getAbbreviatedLektionenText(fach) + " - " + zeit + " - " + zimmer + (isYellow || isRed || isLined ? " - " : "") + (isYellow ? "y" : "") + (isRed ? "r" : "") + (isLined ? "l" : "");

        let lektionenObject = {
            "subject": fach,
            "room": zimmer,
            "yellow": isYellow,
            "red": isRed,
            "lined": isLined,
            "startTime": zeit,
            "endTime": getHoursAndTime(getLessonEnd(getDateWithTime(date, zeit))),
            "startTimestamp": getDateWithTime(date, zeit).getTime(),
            "endTimestamp": getLessonEnd(getDateWithTime(date, zeit)).getTime(),
            "output": output
        };

        lektionenListe.push(lektionenObject);
    }

    return lektionenListe;
}

function grabDatum(src) {
    let datumTable = src.substring(src.indexOf("Erzeugt am ") + 11);
    datumTable = datumTable.substring(0, datumTable.indexOf("</td>"));

    let sourceSplit = src.replaceAll(datumTable, "");

    let endDatum = datumTable.lastIndexOf(".") + 5;
    let cvdate = datumTable.substring(0, endDatum);
    let cvtime = datumTable.substring(endDatum + 1, endDatum + 6);

    return [cvdate, cvtime, sourceSplit]; //0: dd.mm.yyyy; 1: hh:mm; 2: sourceSplit
}
