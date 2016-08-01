
var twilio = require('twilio');
var express = require("express");
var request = require('request');
var u = require("url");
var fs = require('fs');
var client = new twilio.RestClient('ACf2830c92abe86227c9d89be45345bdc1', '8994c537a323c780a92af819a238c6db');

var app = express();

// Firebase setup
var Firebase = require("firebase-init");
var fbRoot;
Firebase({
  url: "https://outsidelandstext.firebaseio.com/",
  token: "olFTy653B3mXIDfJjwrEwROtXPWfOizScQWo9W2z" // the app secret - grants full access
}, function(err, ref) {
  if (err) {
    console.log("FIREBASE INIT ERROR: "+err);
  } else {
    fbRoot = ref;
    console.log("Firebase initialized");
    onFirebaseInit();
  }
});
function deductFromAdvertiser(aKey, amt) {
  fbRoot.child("Advertisers").child(aKey).child("balance")
    .transaction(function(curBalance) {
      return curBalance - amt;
    }, function(err, committed, snap) {
      if (err) {
        console.log("Failed to deductFromAdvertiser: "+err);
      } else if (!committed) {
        console.log("deductFromAdvertiser transaction aborted");
      } else {
        console.log("Deducted "+amt+" from advertiser "+aKey);
      }
    });
}
function splitPhoneNumber(num) {
  return [num.substr(1, 4), num.substr(5)];
}
function getTelephoneRef(num) {
  num = splitPhoneNumber(num);
  return fbRoot.child("Telephones").child(num[0]).child(num[1]);
}
function incPhoneCountAndGet(num, callback) {
  callback = callback || function(){};
  getTelephoneRef(num).child("count")
    .transaction(function(curCount) {
      return curCount? curCount+1 : 1;
    }, function(err, committed, snap) {
      if (err) {
        console.log("Failed to incPhoneCountAndGet: "+err);
        callback(0);
      } else if (!committed) {
        console.log("incPhoneCountAndGet transaction aborted");
        callback(0);
      } else {
        callback(snap.val());
      }
    });
}

function onFirebaseInit() {
  // test Firebase stuff here
}

function getNextAd(callback) {
  fbRoot.child("Ads").orderByChild("pAcc").limitToFirst(1).once("child_added", function(snap) {
    var adObj = snap.val();
    if (adObj.pAcc=="NOMONEY") {
      console.log("getNextAd: No ads that have funding!");
      return; // callback doesn't get called
    }

    var incAmt = 1/adObj.priority;
    var adKey = snap.key();
    var adPrice = adObj.price;

    // increment the ad's priority accumulator in Firebase
    snap.ref().child("pAcc")
      .transaction(function(curAcc) {
        return curAcc=="NOMONEY"? "NOMONEY" : curAcc+incAmt;
      }, function(err, committed, snap) {
        if (err) console.log("Failed to inc pAcc: "+err);
        else if (!committed) console.log("inc pAcc transaction aborted");
        else console.log("pAcc for ad "+adKey+" incremented by "+incAmt.toFixed(3));
      });

    // deduct from the associated advertiser's balance
    fbRoot.child("Advertisers").child(adObj.advertiser).child("balance")
      .transaction(function(curBalance) {
        return curBalance-adPrice;
      }, function(err, committed, snap) {
        if (err) console.log("Failed to deduct from balance: "+err);
        else if (!committed) console.log("deduct from balance transaction aborted");
        else {
          var bal = snap.val();
          console.log("advertiser "+adObj.advertiser+" balance now $"+bal.toFixed(2));
          if (bal <= 0) { // advertiser out of money! disable their ads
            fbRoot.child("Ads").orderByChild("advertiser").equalTo(adObj.advertiser).once("value", function(snap) {
              var arr = snap.val();
              console.log(arr);
              for (var i=0; i<arr.length; i++) {
                if (!arr[i]) continue;
                var k = arr[i].key;
                fbRoot.child("Ads").child(k).update({pAcc:"NOMONEY"}, function(err) {
                  console.log((err?"failure":"success")+" disabling ad "+k);
                });
              }
            });
          }
        }
      });

    // increment the associated advertiser's ads_sent
    fbRoot.child("Advertisers").child(adObj.advertiser).child("ads_sent")
      .transaction(function(curAdsSent) {
        return (curAdsSent||0)+1;
      }, function(err, committed, snap) {
        if (err) console.log("Failed to inc ads_sent: "+err);
        else if (!committed) console.log("inc ads_sent transaction aborted");
        else console.log("advertiser "+adObj.advertiser+" ads_sent now "+snap.val());
      });

    // "return" the chosen ad object
    if (callback) callback(adObj, adKey);
  });
}


// our own modules
var classes = require("./classes");
var Advertiser = classes.Advertiser;
var Ad = classes.Ad;

function receiveText(parts, callback) {
    var query = parts.query;
    var input = query.Body;
    var userNumber = query.From;
    console.log("User number " + userNumber + " texted");
    input = input.toLowerCase().trim();
    input = input.replace(/\s+/g, '');
    console.log("Input with string removed: "+input);
    if (input === "plug" || input === "help" || input === "menu" || input === "") {
        normalRespondToUser("Here is what you can ask Plug!\n\nType in an artist's name ie 'Haywyre' \n\nTo find out what artist is playing on a day just type a date like 'Saturday, or Sunday'\n\n Or need a 'Map' ?",
                            userNumber, callback);
    } else if (input === "saturday" || input === "sat") {
        getData(function(json) {
            searchForDateSat(json, userNumber);
            callback();
        });
    } else if (input === "sunday" || input === "sun") {
        getData(function(json) {
            searchForDateSun(json, userNumber);
            callback();
        });
    } else if (input === "nextartistplaying") {
        callApi("http://hardsummer-bioblaze.rhcloud.com/api/thishour",function(response){
           console.log("Print out response: " + response);
           normalRespondToUser(response,userNumber,callback);
        });

    } else if (input === "map") {
        sendMap("", userNumber, callback);
    } else if (input === "demo") {
        runAd(userNumber, function() {
          console.log("Successfully served ad via 'demo' to "+userNumber);
          callback();
        });
    } else {
        getData(function(json) {
            searchForKeyword(json, input, userNumber, callback);
        });
    }

    // handle text counting and ads
    incPhoneCountAndGet(userNumber, function(count) {
      console.log(userNumber+" new count: "+count);
      if (count%3 == 1) { // every three, starting on the first
        // deliver ad
        runAd(userNumber, function() {
          console.log("Successfully served ad to " +userNumber);
        });
      }
    });
}


function getData(callback) {
    fs.readFile('./Seed.json', 'utf8', function(err, data) {
        if (err) throw err; // we'll not consider error handling for now

        callback(JSON.parse(data));

    });
}

var foundArtist = false;



function searchForKeyword(json, input, userNumber, callback) {
    console.log("searchForKeyword: "+input.toLowerCase());

    for (var i = 0; i < json.artists.length; i++) {
        var artistName = json.artists[i].text;
        artistName = artistName.toLowerCase();
        artistName = artistName.replace(/\s+/g, '');


        if (isKeywordValid(artistName, input)) {
            foundArtist = true;
            console.log("Found musician – sending response");

            respondToUser(json.artists[i], userNumber, callback);
            return;
        }
    }

    console.log("searchForKeyword failed – sending error response");
    normalRespondToUser('Invalid response; maybe check your spelling or type "plug" for suggestions!', userNumber, callback);
}


function isKeywordValid(word, input) {
    return input === word;
}

function searchForDate(json, userNumber) {
    var dateReply = "Friday: ";
    for (var i = 0; i < json.musicians.length; i++) {

        var musician = json.musicians[i].time;
        if (musician.includes("Friday")) {
            dateReply += " " + json.musicians[i].name + " |";
        }

    }
    normalRespondToUser(dateReply, userNumber);
}

function searchForDateSat(json, userNumber) {
  var dateReply = "Saturday: ";
  for (var i = 0; i < json.artists.length; i++) {
      var artist = json.artists[i].start_on;
      if (artist.includes("Sat")) {
          dateReply += " " + json.artists[i].text + " |";
      }

  }
  normalRespondToUser(dateReply, userNumber);
}

function searchForDateSun(json, userNumber) {
    var dateReply = "Sunday: ";
    for (var i = 0; i < json.artists.length; i++) {
        var artist = json.artists[i].start_on;
        if (artist.includes("Sun")) {
            dateReply += " " + json.artists[i].text + " |";
        }

    }
    normalRespondToUser(dateReply, userNumber);
}


function findNearbyTimeRange(json, userNumber) {
    var comingUpMusicians = "Coming up musicians that are currently playing or will play with in an hour! : ";
    for (var i = 0; i < json.musicians.length; i++) {
        var date = new Date("Friday, August 5, 2:56 PM");
        var musician = json.musicians[i].time;

        var musicianDate = new Date(musician);
        console.log(musicianDate - date);
        var difference = musicianDate - date;
        difference = difference / 1000;
        difference = difference / 60;
        difference = difference / 60;
        if (difference >= 0 && difference < 1) {
            //comingUpMusicians.push(json.musicians[i].name);
            comingUpMusicians += " " + json.musicians[i].name + " |";
        }
    }

    normalRespondToUser(comingUpMusicians, userNumber);
}




function respondToUser(reply, userNumber, callback) {
    console.log("Send message " + reply);
    var startOn = reply.start_on;
    startOn = startOn.replace("DST","");
    var endOn = reply.end_on;
    endOn = endOn.replace("DST","");
    var stage = reply.stage;
    var link  = reply.link;
    reply = "Name: " + reply.text + "\nTime Playing: " + startOn + " - " + endOn + "\nStage: " + stage + "\nLink: " + link;
    client.sendMessage({

        to: userNumber,
        from: "+18312287584",
        body: reply

    }, function(err, response) {
        if (err)
            console.log(err);
        if (callback) callback();
    });
}

function callApi(url,callback){
 request(url,function(error, responsey, body) {
    console.log(body);
    var response = "Curently Playing or will be playing with in an hour:";
    var data = JSON.parse(body);
    data = data.Data;
    console.log(data);
    for(var i = 0; i < data.length; i++){
      var artist = data[i].name + "-> Start time : ";
      var startTimeArtist = new Date(data[i].start_on);
      artist += startTimeArtist;
      response += " | "+artist;
    }
    callback(response);
  });
}


function normalRespondToUser(reply, userNumber, callback) {
    console.log("Send message " + reply);
    client.sendMessage({

        to: userNumber,
        from: "+18312287584",
        body: reply

    }, function(err, response) {
        console.log("Message sent");
        if (err)
            console.log(err);
        if (callback) callback();
    });
}
function sendMap(reply, userNumber, callback) {
    console.log("Send message " + reply);
    client.sendMessage({

        to: userNumber,
        from: "+18312287584",
        body: "",
        mediaUrl:"http://cdn.globaldanceelectronic.com/wp-content/uploads/2016/07/Screen-Shot-2016-07-22-at-11.49.10-AM.png"
    }, function(err, response) {
        console.log("Message sent");
        if (err)
            console.log(err);
        if (callback) callback();
    });
}



function runAd(userNumber, callback) {
  getNextAd(function(adObj, adKey) {
    if(adObj.media != null){
      var options = {
        to: userNumber,
        from: "+18312287584",
        body: adObj.body,
        mediaUrl: adObj.media // could be null/undefined, that's okay
      };
    }else{
      var options = {
        to: userNumber,
        from: "+18312287584",
        body: adObj.body
      };
    }

    client.sendMessage(options, function(err, response) {
      if (err) {
        // Just log it for now
        console.log(err);
      }
    }, function(err, response) { // Quinn: I'm not sure about this second callback... haven't checked the docs for Twilio
      if (err)
      console.log(err);
      if (callback) callback();
    });
  });
}

app.get('/', function(request, response) {

  console.log("app.get('/');");

  receiveText(u.parse(request.url, true), function() {
    console.log("Response is done");
  });

  response.send("Event received");

});
app.listen(process.env.PORT);
