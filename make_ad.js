var rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout
});
var Firebase = require("firebase-init");

// Firebase setup
console.log("Connecting to Firebase...");
var fbRoot;
Firebase({
  url: "https://outsidelandstext.firebaseio.com/",
  token: "olFTy653B3mXIDfJjwrEwROtXPWfOizScQWo9W2z" // the app secret - grants full access
}, function(err, ref) {
  if (err) {
    console.log("FIREBASE INIT ERROR: "+err);
  } else {
    fbRoot = ref;
    console.log("Firebase initialized\n");
    onFirebaseInit();
  }
});

function onFirebaseInit() {
  rl.question("Advertiser UID: ", function(advertiser) {
    advertiser = advertiser.trim();
    getNumber("Ad priority (higher=more frequent): ", "Priority", function(priority) {
      getNumber("Price per serve (in dollars): ", "Price", function(price) {
        rl.question("Message (can use \\n & \\t): ", function(body) {
          body = body.replace(/\\n/g, "\n").replace(/\\t/g, "\t").trim();
          rl.question("Media (http or https URL): ", function(media) {
            media = media.trim();
            if (media=="") media = null;
            console.log("Getting relative pAcc...");
            fbRoot.child("Ads").orderByChild("pAcc").limitToFirst(1).once("child_added", function(snap) {
              var pAcc = snap.val().pAcc*1;
              if (isNaN(pAcc)) pAcc = 0;
              console.log("Adding to Firebase...");
              var adRef = fbRoot.child("Ads").push();
              adRef.set({
                advertiser: advertiser,
                body: body,
                key: adRef.key(),
                media: media,
                pAcc: pAcc,
                price: price,
                priority: priority
              }, function(err) {
                if (err) {
                  console.log("Error: "+err);
                } else {
                  console.log("Success.\n");
                  process.exit(0);
                }
              });
            });
          });
        });
      });
    });
  });
}

function getNumber(prompt, name, callback) {
  rl.question(prompt, function(num) {
    num = num.trim()*1;
    if (isNaN(num)) {
      console.log(name+" must be a number.");
      getNumber(prompt, name, callback);
    } else {
      callback(num);
    }
  });
}
