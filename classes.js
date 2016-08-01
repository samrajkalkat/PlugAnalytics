
// class definitions

function Advertiser() {
    // initialize default values (or use constructor parameters)
    this.totalMoney = 0;
    this.numAdsSent = 0;
    this.numLinkClicks = 0;
}

function Ad(title, desc, link, img) {
    this.title = title;
    this.description = desc;
    this.link = link;
    this.image = img;
}

// export the stuff in the module "./classes"
module.exports = {
  Advertiser: Advertiser,
  Ad: Ad
};
