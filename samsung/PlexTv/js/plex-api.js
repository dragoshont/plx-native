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

    function createAccountClient(options) {
        options = options || {};
        var token = String(options.token || "");
        var fetchRequest = options.fetch || (typeof fetch === "function" ? fetch : null);
        var identifier = options.clientIdentifier || "com.plxnative.plex-tv";
        if (!token || !fetchRequest) {
            throw new Error("A linked Plex session is required.");
        }
        function request(path, method, body) {
            return Promise.resolve().then(function () {
                return fetchRequest("https://plex.tv" + path, {
                    method: method || "GET",
                    credentials: "omit",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "X-Plex-Token": token,
                        "X-Plex-Client-Identifier": identifier,
                        "X-Plex-Product": "Plex Tizen"
                    },
                    body: body
                });
            }).catch(function () {
                throw new Error("Plex is unreachable. Check your network and retry.");
            }).then(function (response) {
                if (!response.ok) {
                    var error = new Error(response.status === 401 ?
                        "Plex refused this session or profile PIN. Sign in again or check the PIN." :
                        "Plex request failed (HTTP " + response.status + "). Retry.");
                    error.status = response.status;
                    throw error;
                }
                return response.json();
            });
        }
        return {
            getProfiles: function () {
                return request("/api/v2/home/users").then(function (result) {
                    if (!result || !Array.isArray(result.users)) {
                        throw new Error("Plex returned an invalid profile list.");
                    }
                    return result.users;
                });
            },
            switchProfile: function (uuid, pin) {
                if (!/^[a-zA-Z0-9-]+$/.test(String(uuid || "")) ||
                        (pin && !/^[0-9]{4}$/.test(pin))) {
                    return Promise.reject(new Error("Select a valid profile and enter its four-digit PIN."));
                }
                return request("/api/v2/home/users/" + encodeURIComponent(uuid) + "/switch",
                    "POST", pin ? "pin=" + encodeURIComponent(pin) : "").then(function (result) {
                    if (!result || typeof result.authToken !== "string" || !result.authToken) {
                        throw new Error("Plex did not authorize the selected profile.");
                    }
                    return result.authToken;
                });
            },
            getServers: function () {
                return request("/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1").then(function (result) {
                    if (!Array.isArray(result)) {
                        throw new Error("Plex returned an invalid server list.");
                    }
                    return result.filter(function (resource) {
                        return typeof resource.provides === "string" &&
                            resource.provides.split(",").indexOf("server") !== -1;
                    }).map(function (resource) {
                        return {
                            id: resource.clientIdentifier,
                            name: resource.name || "Plex Media Server",
                            owned: resource.owned === true,
                            token: resource.accessToken || "",
                            connections: (Array.isArray(resource.connections) ? resource.connections : [])
                                .filter(function (connection) {
                                    try {
                                        validateBaseUrl(connection.uri);
                                        return /^https:\/\//.test(connection.uri);
                                    } catch (error) {
                                        return false;
                                    }
                                }).sort(function (a, b) {
                                    return Number(a.relay === true) - Number(b.relay === true) ||
                                        Number(b.local === true) - Number(a.local === true);
                                })
                        };
                    });
                });
            }
        };
    }

    function createAuthClient(options) {
        options = options || {};
        var fetchRequest = options.fetch || (typeof fetch === "function" ? fetch : null);
        var now = options.now || Date.now;
        var clientIdentifier = String(options.clientIdentifier || "com.plxnative.plex-tv");
        var rootUrl = "https://plex.tv";
        if (!fetchRequest) {
            throw new Error("This runtime does not provide fetch.");
        }
        if (!/^[A-Za-z0-9._-]{8,128}$/.test(clientIdentifier)) {
            throw new Error("The Plex client identifier is invalid.");
        }

        function request(url, method) {
            return Promise.resolve().then(function () {
                return fetchRequest(url, {
                    method: method,
                    credentials: "omit",
                    headers: {
                        Accept: "application/json",
                        "X-Plex-Client-Identifier": clientIdentifier,
                        "X-Plex-Product": "Plex TV Client",
                        "X-Plex-Version": "0.1.0",
                        "X-Plex-Platform": "Tizen"
                    }
                });
            }).catch(function () {
                throw new Error("Could not reach Plex. Check the network and try again.");
            }).then(function (response) {
                if (!response || typeof response.status !== "number") {
                    throw new Error("Plex returned an invalid authorization response.");
                }
                if (!response.ok) {
                    if (response.status === 404) {
                        return { status: "expired" };
                    }
                    throw new Error("Plex authorization request failed (HTTP " + response.status + ").");
                }
                return Promise.resolve().then(function () {
                    return response.json();
                }).catch(function () {
                    throw new Error("Plex returned an invalid authorization response.");
                }).then(function (payload) {
                    if (!payload || typeof payload !== "object") {
                        throw new Error("Plex returned an invalid authorization response.");
                    }
                    return payload;
                });
            });
        }

        return {
            startAuthorization: function () {
                return request(rootUrl + "/api/v2/pins?strong=false", "POST").then(function (pin) {
                    var id = pin.id;
                    var code = typeof pin.code === "string" ? pin.code : "";
                    var expiry = pin.expiresAt ? Date.parse(pin.expiresAt) : NaN;
                    if (!(typeof expiry === "number" && isFinite(expiry)) && typeof pin.expiresIn === "number" && pin.expiresIn > 0) {
                        expiry = now() + pin.expiresIn * 1000;
                    }
                    if (!/^[0-9]+$/.test(String(id)) || !/^[A-Z0-9]{4,12}$/.test(code) ||
                            !(typeof expiry === "number" && isFinite(expiry)) || expiry <= now()) {
                        throw new Error("Plex returned an invalid sign-in code.");
                    }
                    return {
                        id: String(id),
                        code: code,
                        qr: typeof pin.qr === "string" && /^https:\/\/plex\.tv\//.test(pin.qr) ? pin.qr : "",
                        linkUrl: "https://plex.tv/link",
                        expiresAt: expiry
                    };
                });
            },
            pollAuthorization: function (pin) {
                if (!pin || !/^[0-9]+$/.test(String(pin.id || "")) ||
                        !/^[A-Z0-9]{4,12}$/.test(String(pin.code || "")) ||
                        !(typeof pin.expiresAt === "number" && isFinite(pin.expiresAt))) {
                    return Promise.reject(new Error("The Plex sign-in request is invalid."));
                }
                if (now() >= pin.expiresAt) {
                    return Promise.resolve({ status: "expired" });
                }
                var url = rootUrl + "/api/v2/pins/" + encodeURIComponent(pin.id) +
                    "?code=" + encodeURIComponent(pin.code);
                return request(url, "GET").then(function (result) {
                    var state = String(result.status || result.state || "").toLowerCase();
                    if (state === "denied" || state === "rejected") {
                        return { status: "denied" };
                    }
                    if (state === "expired" || result.expired === true) {
                        return { status: "expired" };
                    }
                    if (typeof result.authToken === "string" && result.authToken.length > 0) {
                        return { status: "linked", token: result.authToken };
                    }
                    return { status: "pending" };
                });
            }
        };
    }

    function createClient(options) {
        options = options || {};
        var baseUrl = validateBaseUrl(options.baseUrl);
        var token = String(options.token || "");
        var fetchRequest = options.fetch || (typeof fetch === "function" ? fetch : null);
        if (!fetchRequest) {
            throw new Error("This runtime does not provide fetch.");
        }

        function get(path, method, query) {
            var headers = {
                Accept: "application/json"
            };
            if (token) {
                headers["X-Plex-Token"] = token;
            }
            headers["X-Plex-Client-Identifier"] = options.clientIdentifier || "com.plxnative.plex-tv";
            var target = baseUrl + path;
            if (query) {
                target += (path.indexOf("?") === -1 ? "?" : "&") + Object.keys(query).map(function (key) {
                    return encodeURIComponent(key) + "=" + encodeURIComponent(query[key]);
                }).join("&");
            }
            return Promise.resolve().then(function () {
                return fetchRequest(target, {
                method: method || "GET",
                credentials: "omit",
                headers: headers
                });
            }).catch(function () {
                throw new Error("The server is unreachable. Check your network and retry.");
            }).then(function (response) {
                if (!response || typeof response.status !== "number") {
                    throw new Error("PMS returned an invalid HTTP response.");
                }
                if (!response.ok) {
                    var error = new Error("PMS request failed with HTTP " + response.status + ".");
                    error.status = response.status;
                    throw error;
                }
                return response.json();
            }).then(function (payload) {
                if (!payload || !payload.MediaContainer ||
                        typeof payload.MediaContainer !== "object") {
                    throw new Error("PMS response did not contain a MediaContainer.");
                }
                return payload.MediaContainer;
            });
        }

        return {
            request: get,
            identity: function () { return get("/identity"); },
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
        createClient: createClient,
        createAuthClient: createAuthClient,
        createAccountClient: createAccountClient,
        validateBaseUrl: validateBaseUrl
    };
}));
