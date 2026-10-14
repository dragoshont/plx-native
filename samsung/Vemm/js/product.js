(function (root, factory) {
    var product = factory();
    if (typeof module === "object" && module.exports) { module.exports = product; }
    else { root.VemmProduct = product; }
}(this, function () {
    "use strict";
    return {
        name: "Vemm",
        pronunciation: "/vem/",
        tagline: "Your media. At its best.",
        platform: "Samsung Tizen",
        status: "working brand"
    };
}));
