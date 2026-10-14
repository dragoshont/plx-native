(function (root) {
    "use strict";
    root.VemmPhotos = {
        create: function (options) {
            var items = options.items;
            if (!Array.isArray(items) || !items.length || items.length > 200 ||
                    items.some(function (item) { return item.type !== "photo"; })) {
                throw new Error("Choose 1 to 200 photos from the current page.");
            }
            var index = options.index === undefined ? 0 : options.index;
            if (typeof index !== "number" || Math.floor(index) !== index || index < 0 || index >= items.length) {
                throw new Error("Photo is not available on this page.");
            }
            var closed = false;
            var generation = 0;
            var timer = null;
            var decodeTimer = null;
            var url = "";
            var slideshow = false;
            var image = options.element("img", "photo-display");
            var heading = options.element("h2", "photo-title");
            var parent = options.parent;
            parent.appendChild(heading);
            parent.appendChild(image);
            function revoke() {
                if (url) { options.urls.revokeObjectURL(url); url = ""; }
            }
            function cancelTimer() {
                if (timer !== null) { clearTimeout(timer); timer = null; }
                if (decodeTimer !== null) { clearTimeout(decodeTimer); decodeTimer = null; }
            }
            function load() {
                if (closed) { return; }
                cancelTimer();
                var own = ++generation;
                var selected = items[index];
                image.onload = null; image.onerror = null;
                revoke();
                image.removeAttribute("src");
                heading.textContent = items[index].title || options.translate("Photo");
                image.alt = heading.textContent;
                options.status(options.translate("Loading photo..."));
                Promise.resolve().then(function () {
                    if (closed || own !== generation) { return null; }
                    return options.client.photo(selected);
                }).then(function (blob) {
                    if (closed || own !== generation) { return; }
                    url = options.urls.createObjectURL(blob);
                    image.onload = function () {
                        if (closed || own !== generation) { return; }
                        cancelTimer();
                        options.status((index + 1) + " / " + items.length + " - " + options.translate("Photos on this page"));
                        if (slideshow) { timer = setTimeout(function () { advance(1); }, options.delay || 5000); }
                    };
                    image.onerror = function () {
                        if (closed || own !== generation) { return; }
                        cancelTimer();
                        slideshow = false;
                        options.status(options.translate("Photo could not be decoded. Retry or choose another."), true);
                        revoke();
                    };
                    decodeTimer = setTimeout(function () {
                        if (closed || own !== generation) { return; }
                        image.onerror();
                    }, 15000);
                    image.src = url;
                }).catch(function (error) {
                    if (closed || own !== generation) { return; }
                    slideshow = false;
                    options.status(error.message, true);
                });
            }
            function advance(delta) {
                if (closed) { return; }
                index = (index + delta + items.length) % items.length;
                load();
            }
            var controls = options.element("section", "photo-controls");
            parent.appendChild(controls);
            options.button(controls, "Previous photo", function () { advance(-1); });
            options.button(controls, "Next photo", function () { advance(1); });
            var slideshowControl = options.button(controls, "Slideshow / Pause", function () {
                slideshow = !slideshow;
                if (slideshowControl) { slideshowControl.setAttribute("aria-pressed", slideshow ? "true" : "false"); }
                if (slideshow) { load(); }
                else { cancelTimer(); options.status(options.translate("Slideshow paused.")); }
            });
            options.button(controls, "Retry photo", load);
            options.button(controls, "Back", options.back);
            load();
            return {
                close: function () {
                    closed = true; generation += 1; cancelTimer();
                    image.onload = null; image.onerror = null;
                    image.removeAttribute("src"); revoke();
                }
            };
        }
    };
}(this));
