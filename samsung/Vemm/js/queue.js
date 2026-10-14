(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmQueue = api; }
}(this, function () {
    "use strict";
    function create(items, selected, random) {
        if (!Array.isArray(items) || !items.length || items.length > 200 ||
                items.some(function (item) { return !item || item.type !== "track" || !/^[0-9]+$/.test(String(item.ratingKey)); })) {
            throw new Error("Choose a music queue of 1 to 200 available tracks.");
        }
        var original = items.slice();
        var order = original.slice();
        var index = selected === undefined ? 0 : selected;
        if (typeof index !== "number" || index < 0 || index >= order.length || Math.floor(index) !== index) {
            throw new Error("Choose an available track in the queue.");
        }
        var repeat = "off";
        var shuffled = false;
        random = random || Math.random;
        return {
            current: function () { return order[index]; },
            items: function () { return order.slice(); },
            position: function () { return index; },
            next: function (automatic) {
                if (automatic && repeat === "one") { return order[index]; }
                if (index + 1 >= order.length) {
                    if (repeat !== "all") { return null; }
                    index = 0;
                } else { index += 1; }
                return order[index];
            },
            previous: function () {
                if (index > 0) { index -= 1; }
                else if (repeat === "all") { index = order.length - 1; }
                return order[index];
            },
            repeat: function (mode) {
                if (["off", "one", "all"].indexOf(mode) === -1) { throw new Error("Invalid queue repeat mode."); }
                repeat = mode;
                return repeat;
            },
            shuffle: function (enabled) {
                if (typeof enabled !== "boolean") { throw new Error("Choose shuffle on or off."); }
                var current = order[index];
                shuffled = enabled;
                order = original.slice();
                if (enabled) {
                    order.splice(order.indexOf(current), 1);
                    for (var i = order.length - 1; i > 0; i -= 1) {
                        var value = random();
                        if (!(value >= 0 && value < 1)) { throw new Error("Invalid shuffle source."); }
                        var j = Math.floor(value * (i + 1));
                        var swap = order[i]; order[i] = order[j]; order[j] = swap;
                    }
                    order.unshift(current);
                }
                index = order.indexOf(current);
                return shuffled;
            }
        };
    }
    return { create: create };
}));
