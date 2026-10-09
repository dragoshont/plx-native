(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    } else {
        root.PlexApi = api;
    }
}(this, function () {
    "use strict";

    function isNonNegativeInteger(value) {
        return typeof value === "number" && value >= 0 && Math.floor(value) === value;
    }

    function validateBaseUrl(value) {
        var baseUrl = String(value || "").replace(/\/+$/, "");
        if (!/^https?:\/\/(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::[0-9]{1,5})?$/i.test(baseUrl) ||
                baseUrl.indexOf("@") !== -1) {
            throw new Error("Enter a PMS origin such as http://192.168.1.10:32400.");
        }
        return baseUrl;
    }

    function listFrom(container, field) {
        if (Array.isArray(container[field])) {
            return container[field];
        }
        if (container.size === 0 || container.totalSize === 0) {
            return [];
        }
        throw new Error("PMS response is missing the " + field + " list.");
    }

    function createClient(options) {
        options = options || {};
        var baseUrl = validateBaseUrl(options.baseUrl);
        var token = String(options.token || "");
        var fetchRequest = options.fetch || (typeof fetch === "function" ? fetch : null);
        if (!fetchRequest) {
            throw new Error("This runtime does not provide fetch.");
        }

        function get(path) {
            var headers = {
                Accept: "application/json"
            };
            if (token) {
                headers["X-Plex-Token"] = token;
            }
            return fetchRequest(baseUrl + path, {
                method: "GET",
                headers: headers
            }).then(function (response) {
                if (!response || typeof response.status !== "number") {
                    throw new Error("PMS returned an invalid HTTP response.");
                }
                if (!response.ok) {
                    throw new Error("PMS request failed with HTTP " + response.status + " (" + path + ").");
                }
                return response.json();
            }).then(function (payload) {
                if (!payload || !payload.MediaContainer ||
                        typeof payload.MediaContainer !== "object") {
                    throw new Error("PMS response did not contain a MediaContainer (" + path + ").");
                }
                return payload.MediaContainer;
            });
        }

        return {
            getSections: function () {
                return get("/library/sections").then(function (container) {
                    return listFrom(container, "Directory");
                });
            },
            getHomeHubs: function () {
                return get("/hubs/promoted?count=12&excludeContinueWatching=0").then(function (container) {
                    return listFrom(container, "Hub");
                });
            },
            getSectionItems: function (sectionKey, start, size) {
                var key = String(sectionKey || "");
                start = start === undefined ? 0 : start;
                size = size === undefined ? 50 : size;
                if (!/^[0-9]+$/.test(key)) {
                    return Promise.reject(new Error("The library section key is invalid."));
                }
                if (!isNonNegativeInteger(start) || !isNonNegativeInteger(size) || size < 1 || size > 100) {
                    return Promise.reject(new Error("The requested page range is invalid."));
                }
                var path = "/library/sections/" + key + "/all" +
                    "?X-Plex-Container-Start=" + start +
                    "&X-Plex-Container-Size=" + size;
                return get(path).then(function (container) {
                    var items = listFrom(container, "Metadata");
                    var totalSize = isNonNegativeInteger(container.totalSize) ?
                        container.totalSize : items.length;
                    var offset = isNonNegativeInteger(container.offset) ? container.offset : start;
                    return {
                        items: items,
                        totalSize: totalSize,
                        offset: offset
                    };
                });
            }
        };
    }

    return {
        createClient: createClient
    };
}));
