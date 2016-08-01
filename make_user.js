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
  rl.question("UID: ", function(uid) {
    uid = uid.trim();
    rl.question("Initial balance: ", function(bal) {
      bal = bal.trim()*1; // convert to number
      rl.question("Comment: ", function(comment) {
        console.log("Adding to Firebase...");
        fbRoot.child("Advertisers").child(uid).set({
          ads_sent: 0,
          balance: bal,
          comment: comment,
          total_ads: 0
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
}
