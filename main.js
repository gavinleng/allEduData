/*
 * Created by G on 12/02/2016.
 */


var argv = require("minimist")(process.argv.slice(2));
var path = require("path");
var OSPoint = require('ospoint');
var fileOpen = require('./fileopen.js'); //self made module for file opening/writing
var dataConfig;

//get config
if (!argv.config) {
    console.log("no config file given");
    process.exit(-1);
} else {
    var configFile = path.resolve(argv.config);
    
    // Get the configuration.
    try {
        dataConfig = require(configFile);
    } catch (err) {
        console.log("failed to parse config file %s: %s", configFile, err.message);
        process.exit(-1);
    }
}

var filePath = dataConfig.outPath;

var pathToInput = './tempFile.json'; //this is an input and output file, please backup before running

var geoJsonFile = {
    "type": "FeatureCollection",
    "features": []
};
var singleData = {};

var jsonArray = []; // will contain resulting json structures

var tdxAPI = '/v1/datasets/' + dataConfig.dataID + '/data?opts={"limit":' + dataConfig.dataCount + '}';

var indexToBeginAt = 0; //starts from the beginning, unsurprisingly

function doNext(listIndex, jsonArray, callback) { /* for recursively going through documents in collection*/
    if (listIndex >= jsonArray.length - 1) {
        callback(); // if end is reached, go to final write-up
        return 1;
    }

    console.log("now doing: %s", listIndex + 1);

    if (typeof jsonArray[listIndex + 1].geoStatus === "undefined") { //checks whether given document was already geocoded, omits if so
        console.log("Doing new coordinates entry...");

        if (listIndex % 10 == 0) { /*this 'updates' the json file every tenth entry*/
            fileOpen.jsonFileWrite(jsonArray, pathToInput);
        }

        processList(listIndex + 1, jsonArray, callback);
    } else {
        console.log("Coordinates already exist for that entry, proceed to do next");
        doNext(listIndex + 1, jsonArray, callback);
    }
}

function processList(listIndex, jsonArray, callback) { /*processes a single document (singleEntry), finds its LatLong, and assigns it to the array of results (jsonArray)*/
    var singleEntry = jsonArray[listIndex];

    singleData = {
        "type": "Feature",
        "properties": {},
        "geometry": {
            "type": "Point",
            "coordinates": []
        }
    };

    geocodeget(listIndex, singleEntry, callback);
}

function geocodeget(listIndex, singleEntry, callback) {
    var Northings = +singleEntry.Northing;
    var Eastings = +singleEntry.Easting;

    if (Northings != 0 && Eastings != 0) {
        var thisPoint = new OSPoint(Northings, Eastings);
        var wgs84 = thisPoint.toWGS84();

        singleEntry.geoStatus = "OK";
        singleData.properties = singleEntry;
        singleData.geometry.coordinates = [wgs84.longitude, wgs84.latitude];
    } else {
        console.log("ZERO");
        console.log("error: data status is not ok (processList)"); // usually: ZERO_RESULTS is given, indicating wrong address format
        singleEntry.geoStatus = "ZERO";
        singleData.properties = singleEntry;
    }

    geoJsonFile.features.push(singleData);

    jsonArray[listIndex] = singleEntry; //updating results array

    doNext(listIndex, jsonArray, callback);
}

function appendGeolocation(jsonParsed) { /* final step, after going through all the documents*/
    jsonArray = jsonParsed;

    processList(indexToBeginAt, jsonArray, function() {
        fileOpen.jsonFileWrite(jsonArray, pathToInput);
        fileOpen.jsonFileWrite(geoJsonFile, filePath);
        console.log("finished, " + jsonArray.length + " entries.");
    });
}

fileOpen.tdxDataOpen(tdxAPI, appendGeolocation); //execute
