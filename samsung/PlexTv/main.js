(function () {
    "use strict";

    var screen = document.getElementById("screen");
    var status = document.getElementById("status");
    var currentClient = null;
    var currentServerId = "";
    var holdCard = null;
    var holdTimer = null;
    var currentSection = null;
    var currentItems = [];
    var currentOffset = 0;
    var viewGeneration = 0;
    var itemsLoading = false;
    var authClient = null;
    var authPin = null;
    var authTimer = null;
    var authExpiryTimer = null;
    var authGeneration = 0;
    var accountToken = "";
    var rememberControl = null;
    var accountClient = null;
    var servers = [];
    var libraryFilters = {};
    var navigation = [];
    var restoreView = null;
    var imageGeneration = 0;
    var imageQueue = [];
    var imageActive = 0;
    var imageUrls = [];
    var player = null;
    var playerItem = null;
    var playerClient = null;
    var playerSettings = null;
    var subtitleTimer = null;
    var hudTimer = null;
    var hudBuffering = false;
    var hudFocus = null;
    var nextTimer = null;
    var playerClosing = false;
    var lastAction = 0;
    var externalCues = null;
    var musicQueue = null;
    var musicLoading = false;
    var queueShuffle = false;
    var queueRepeat = "off";
    var viewCleanup = null;
    var viewClients = [];
    var suspendedView = null;
    var foregroundRecovery = null;
    var preferences = { quality: "1080", autoNext: false, language: "en", continueAction: "details" };
    var preferenceError = "";
    var pendingRestore = null;
    if (window.PlexPreferences) {
        try {
            preferences = window.PlexPreferences.load(window.localStorage);
            window.PlexI18n.setLanguage(preferences.language);
        } catch (error) { preferenceError = error.message; }
    }
    if (typeof window.Promise !== "function" || typeof window.fetch !== "function" ||
            typeof window.URL !== "function" || typeof window.Blob !== "function") {
        status.textContent = "This browser lacks required network or media APIs. Use a supported Samsung runtime.";
        status.className = "status status-error";
        return;
    }
    var buildLabel = document.querySelector(".app-header p");
    if (buildLabel) { buildLabel.textContent = translate("Samsung TV client development build"); }

    function translate(text, values) { return window.PlexI18n ? window.PlexI18n.text(text, values) : text; }

    function savePreferences() {
        try {
            window.PlexPreferences.save(window.localStorage, preferences);
            window.PlexI18n.setLanguage(preferences.language);
            return true;
        } catch (error) {
            setStatus("Could not save preferences. Check app storage permissions.", true);
            return false;
        }
    }

    function visit(action) {
        if (restoreView) {
            var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
            navigation.push({ restore: restoreView, focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop });
            if (navigation.length > 20) { navigation.shift(); }
        }
        action();
    }

    function backView() {
        if (player) { stopPlayer(); return; }
        var previous = navigation.pop();
        if (!previous) {
            if (currentClient) { loadHome(false); }
            return;
        }
        pendingRestore = previous;
        previous.restore();
    }

    function resetImages() {
        imageGeneration += 1;
        imageQueue = [];
        imageUrls.forEach(function (url) { window.URL.revokeObjectURL(url); });
        imageUrls = [];
    }

    function pumpImages() {
        while (imageActive < 3 && imageQueue.length) {
            (function (job) {
                imageActive += 1;
                Promise.resolve().then(function () { return job.client.image(job.path, job.size); }).then(function (blob) {
                    if (job.generation !== imageGeneration) { return; }
                    if (blob.size > (job.maxBytes || 2 * 1024 * 1024)) { throw new Error("Artwork exceeds the image memory limit."); }
                    var url = window.URL.createObjectURL(blob);
                    imageUrls.push(url);
                    if (imageUrls.length > 60) { window.URL.revokeObjectURL(imageUrls.shift()); }
                    job.node.src = url;
                    if (job.loaded) { job.loaded(); }
                }).catch(function () {
                    if (job.generation === imageGeneration) { job.node.alt = "Artwork unavailable"; }
                }).then(function () { imageActive -= 1; pumpImages(); });
            }(imageQueue.shift()));
        }
    }

    function card(parent, item, client, siblings, options) {
        options = options || {};
        var node = button(parent, "", function () {
            if (options.deck && preferences.continueAction === "play" &&
                    ["movie", "episode", "clip"].indexOf(item.type) !== -1) {
                playFromCard(item, client, true);
                return;
            }
            visit(function () {
                if (item.type === "photo") {
                    var photos = (siblings || [item]).filter(function (entry) { return entry.type === "photo"; });
                    openPhotos(photos, Math.max(0, photos.indexOf(item)), client);
                } else { openDetail(item.ratingKey, client); }
            });
        });
        node.className = "media-card";
        node.plexCard = { item: item, client: client, options: options };
        var image = element("img", "poster");
        image.alt = item.title || "Media";
        node.appendChild(image);
        node.appendChild(element("span", "card-title", item.title || item.tag || "Untitled"));
        node.appendChild(element("span", "card-meta", [item.year, item.type,
            item.viewCount ? "Watched" : item.viewOffset ? "In progress" : ""].filter(Boolean).join(" / ")));
        if (item.thumb && client.image && window.URL && window.URL.createObjectURL && imageQueue.length < 200) {
            imageQueue.push({ client: client, path: item.thumb, node: image, generation: imageGeneration });
            pumpImages();
        }
        return node;
    }

    function queueImage(node, client, path, size, maxBytes, loaded, first) {
        if (!path || !client.image || !window.URL || !window.URL.createObjectURL || imageQueue.length >= 200) { return; }
        var job = { client: client, path: path, node: node, generation: imageGeneration, size: size, maxBytes: maxBytes, loaded: loaded };
        if (first) { imageQueue.unshift(job); } else { imageQueue.push(job); }
        pumpImages();
    }

    function setDetailMode(enabled) {
        var shell = document.querySelector && document.querySelector(".app-shell");
        if (shell) { shell.className = enabled ? "app-shell detail-mode" : "app-shell"; }
    }
    var usingRelay = false;

    function recoverSession(error) {
        if (error.status !== 401 && error.status !== 403) { return false; }
        if (error.scope === "account" && error.status === 401) {
            var deleted = signOut();
            setStatus("Your Plex session expired. Sign in again." + (deleted ? "" :
                " The saved session could not be deleted. Clear this app's data on the TV."), true);
            return true;
        }
        if (error.scope === "server" && error.status === 401 && accountClient) {
            currentClient = null;
            openServers("This server's access grant expired. Select a server again; your Plex account is still linked.");
            return true;
        }
        return false;
    }

    function cancelViewRequests() {
        viewClients.forEach(function (client) { client.cancelRequests(); });
        viewClients = [];
        if (currentClient && currentClient.cancelRequests) { currentClient.cancelRequests(); }
        if (accountClient && accountClient.cancelRequests) { accountClient.cancelRequests(); }
    }

    function clear(node) {
        if (node === screen && !player) {
            cancelViewRequests();
        }
        if (node === screen && viewCleanup) {
            var cleanup = viewCleanup;
            viewCleanup = null;
            cleanup();
        }
        if (node === screen) { setDetailMode(false); }
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function element(tagName, className, text) {
        var node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    function setStatus(message, isError) {
        status.textContent = translate(message || "");
        status.className = isError ? "status status-error" : "status";
        if (isError && player) { showHud(); cancelHudTimer(); }
    }

    function focusFirst() {
        var controls = screen.querySelectorAll("button, input, select");
        if (pendingRestore) {
            var previous = pendingRestore;
            pendingRestore = null;
            if (controls[previous.focus] && !controls[previous.focus].disabled) {
                controls[previous.focus].focus();
                screen.scrollTop = previous.scroll || 0;
                return;
            }
        }
        for (var i = 0; i < controls.length; i += 1) {
            if (!controls[i].disabled && !insideHidden(controls[i])) {
                controls[i].focus();
                return;
            }
        }
    }

    function addSectionHeading(parent, title) {
        parent.appendChild(element("h2", "section-heading", title));
    }

    function stopAuthorization() {
        if (authClient && authClient.cancelRequests) { authClient.cancelRequests(); }
        authGeneration += 1;
        if (authTimer !== null) {
            clearTimeout(authTimer);
            authTimer = null;
        }
        if (authExpiryTimer !== null) {
            clearTimeout(authExpiryTimer);
            authExpiryTimer = null;
        }
        authPin = null;
    }

    function pollAuthorization(generation, info) {
        if (generation !== authGeneration || !authPin) {
            return;
        }
        authClient.pollAuthorization(authPin).then(function (result) {
            if (generation !== authGeneration) {
                return;
            }
            if (result.status === "pending") {
                authTimer = setTimeout(function () {
                    pollAuthorization(generation, info);
                }, 3000);
            } else if (result.status === "linked") {
                accountToken = result.token;
                stopAuthorization();
                var warning = "";
                if (rememberControl && rememberControl.checked && window.PlexSession) {
                    try { window.PlexSession.remember(window.localStorage, accountToken, true); }
                    catch (error) { warning = "Plex linked, but the session could not be saved. It remains memory-only."; }
                }
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles(warning);
            } else if (result.status === "expired") {
                beginAuthorization(info.parentNode);
            } else {
                stopAuthorization();
                info.textContent = translate(result.status === "denied" ?
                    "Sign-in was denied. Get a new code to try again." :
                    "This code expired. Get a new code to try again.");
                setStatus(info.textContent, result.status === "denied");
            }
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = translate("Network issue while checking sign-in. Retrying…");
            authTimer = setTimeout(function () {
                pollAuthorization(generation, info);
            }, 5000);
        });
    }

    function button(parent, label, action, literal, iconName) {
        var icon = iconName || (/^(Play|Resume|Pause|Start watching)/.test(label) ? "play" :
            /^(Back|Cancel|Close|Stop and return)/.test(label) ? "back" :
            /^(Search|Plex catalogue)/.test(label) ? "search" :
            /^(Settings|Diagnostics|Reset|Transcode|Sort)/.test(label) ? "settings" :
            /^(Change server|Refresh servers|Retry discovery)/.test(label) ? "server" :
            /^(Favorite|Watchlist|Mark|Remove from)/.test(label) ? "check" :
            /^(Change profile|Sign out|Use linked account)/.test(label) ? "profile" :
            /^Live TV/.test(label) ? "television" : "more");
        var node = element("button", "secondary-button menu-control menu-icon-" + icon,
            literal ? label : translate(label));
        node.type = "button";
        node.addEventListener("click", action);
        parent.appendChild(node);
        return node;
    }

    function openProfiles(warning) {
        stopAuthorization();
        var generation = ++viewGeneration;
        clear(screen);
        screen.appendChild(element("h2", "", translate("Who is watching?")));
        if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
        setStatus("Loading Plex Home profiles...");
        accountClient.getProfiles().then(function (profiles) {
            if (generation !== viewGeneration) { return; }
            profiles.forEach(function (profile) {
                button(screen, profile.title || profile.username || "Profile", function () {
                    var selection = ++viewGeneration;
                    clear(screen);
                    screen.appendChild(element("h2", "", profile.title || "Profile"));
                    var pin = element("input", "remote-input");
                    pin.type = "password";
                    pin.maxLength = 4;
                    pin.setAttribute("aria-label", "Profile PIN");
                    if (profile.protected) { screen.appendChild(pin); }
                    button(screen, "Use this profile", function () {
                        if (profile.protected && !/^[0-9]{4}$/.test(pin.value)) {
                            setStatus("Enter the four-digit profile PIN.", true);
                            return;
                        }
                        var request = ++selection;
                        var generation = viewGeneration;
                        setStatus("Switching profile...");
                        accountClient.switchProfile(profile.uuid, profile.protected ? pin.value : "")
                            .then(function (token) {
                                pin.value = "";
                                if (generation !== viewGeneration || request !== selection) { return; }
                                accountClient = window.PlexApi.createAccountClient({ token: token });
                                openServers();
                            }).catch(function (error) {
                                pin.value = "";
                                if (generation !== viewGeneration || request !== selection) { return; }
                                if (error.status === 401 || error.status === 403) {
                                    accountClient.getProfiles().then(function () {
                                        if (generation === viewGeneration) {
                                            setStatus("Profile PIN refused. Check the PIN and retry.", true);
                                        }
                                    }).catch(function (sessionError) {
                                        if (generation === viewGeneration && !recoverSession(sessionError)) {
                                            setStatus(sessionError.message, true);
                                        }
                                    });
                                } else { setStatus(error.message, true); }
                            });
                    });
                    button(screen, "Back to profiles", openProfiles);
                    focusFirst();
                }, true);
            });
            button(screen, "Use linked account", openServers);
            button(screen, "Sign out", signOut);
            setStatus("Select the Plex identity to use. Protected profiles require their PIN.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            button(screen, "Retry profiles", openProfiles);
            button(screen, "Use linked account", openServers);
            button(screen, "Sign out", signOut);
            setStatus(error.message, true);
            focusFirst();
        });
    }

    function signOut() {
        var storageError = false;
        if (window.PlexSession) {
            try { window.PlexSession.forget(window.localStorage); }
            catch (error) { storageError = true; }
        }
        stopAuthorization();
        accountToken = "";
        accountClient = null;
        servers = [];
        currentClient = null;
        currentServerId = "";
        currentItems = [];
        currentSection = null;
        usingRelay = false;
        navigation = [];
        restoreView = null;
        addConnectForm("");
        if (storageError) { setStatus("The saved session could not be deleted. Clear this app's data on the TV before leaving it unattended.", true); }
        return !storageError;
    }

    function openServers(warning) {
        navigation = [];
        restoreView = null;
        var generation = ++viewGeneration;
        clear(screen);
        screen.appendChild(element("h2", "", translate("Choose a server")));
        if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
        setStatus("Discovering your Plex Media Servers...");
        accountClient.getServers().then(function (result) {
            if (generation !== viewGeneration) { return; }
            servers = result;
            if (!servers.length) {
                screen.appendChild(element("p", "empty-state", translate("No Plex servers are shared with this identity.")));
            }
            servers.forEach(function (server) {
                var unavailable = !server.token || !server.connections.length;
                var relayOnly = server.connections.length && server.connections.every(function (connection) {
                    return connection.relay === true;
                });
                var serverButton = button(screen, server.name + (server.owned ? " (owned)" : " (shared)") +
                    (unavailable ? " — unavailable" : relayOnly ? " — relay" : ""), function () {
                    var selection = ++viewGeneration;
                    currentClient = null;
                    setStatus("Connecting securely; trying relay if needed...");
                    window.PlexApi.selectServer(server, { onClient: function (client) {
                        if (selection !== viewGeneration) { return false; }
                        viewClients.push(client);
                        return true;
                    } }).then(function (selected) {
                        if (selection !== viewGeneration) { return; }
                        currentClient = selected.client;
                        currentServerId = server.id;
                        usingRelay = selected.relay;
                        if (needsFavoritesOnboarding()) { openFavorites(true); } else { loadHome(false); }
                    }).catch(function (error) {
                        if (selection !== viewGeneration) { return; }
                        if (!recoverSession(error)) { setStatus(error.message, true); }
                    });
                }, true);
                serverButton.disabled = unavailable;
            });
            button(screen, "Change profile", function () {
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles();
            });
            button(screen, "Refresh servers", openServers);
            button(screen, "Sign out", signOut);
            setStatus("Owned and shared servers use their own access grants. Only secure advertised origins are tried.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            button(screen, "Retry discovery", openServers);
            button(screen, "Sign out", signOut);
            setStatus(error.message, true);
            focusFirst();
        });
    }

    function beginAuthorization(info, keepStatus) {
        stopAuthorization();
        accountToken = "";
        var generation = authGeneration;
        clear(info);
        info.appendChild(element("p", "auth-wait", translate("Getting a sign-in code…")));
        if (!keepStatus) { setStatus(""); }
        try {
            authClient = window.PlexApi.createAuthClient();
        } catch (error) {
            info.textContent = error.message;
            setStatus(error.message, true);
            return;
        }
        authClient.startAuthorization().then(function (pin) {
            if (generation !== authGeneration) {
                return;
            }
            authPin = pin;
            if (typeof pin.expiresAt === "number" && isFinite(pin.expiresAt)) {
                authExpiryTimer = setTimeout(function () {
                    if (generation === authGeneration) { beginAuthorization(info); }
                }, Math.max(0, pin.expiresAt - Date.now()));
            }
            clear(info);
            info.appendChild(element("p", "auth-step", translate("On your phone or computer, go to")));
            info.appendChild(element("p", "auth-url", "plex.tv/link"));
            var plate = element("div", "auth-plate");
            if (pin.qr) {
                var qr = element("img", "auth-qr");
                qr.alt = translate("Scan to sign in");
                qr.width = 360;
                qr.height = 360;
                qr.onerror = function () {
                    if (plate.parentNode) { plate.parentNode.removeChild(plate); }
                };
                qr.src = pin.qr;
                plate.appendChild(qr);
                info.appendChild(plate);
            }
            info.appendChild(element("p", "auth-step", translate("and enter this code")));
            info.appendChild(element("strong", "auth-code", pin.code));
            var waiting = element("p", "auth-wait", translate("Waiting for you to sign in…"));
            info.appendChild(waiting);
            pollAuthorization(generation, waiting);
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = translate("Could not reach Plex. Retrying in a few seconds…");
            setStatus(info.textContent, true);
            authTimer = setTimeout(function () {
                if (generation === authGeneration) { beginAuthorization(info); }
            }, 5000);
        });
    }

    function addConnectForm(message) {
        stopAuthorization();
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        currentClient = null;
        currentSection = null;
        var section = element("section", "connect-panel");
        section.appendChild(element("h2", "auth-title", translate("Sign in to Plex")));

        var authInfo = element("div", "auth-info");
        section.appendChild(authInfo);

        var actions = element("div", "auth-actions");
        var remember = null;
        var signIn = element("button", "secondary-button", translate("Get a new code"));
        signIn.type = "button";
        signIn.addEventListener("click", function () { beginAuthorization(authInfo); });
        actions.appendChild(signIn);
        var advancedToggle = element("button", "secondary-button", translate("Connect to a server directly"));
        advancedToggle.type = "button";
        actions.appendChild(advancedToggle);
        section.appendChild(actions);

        if (window.PlexSession) {
            var rememberLabel = element("label", "remember-option", translate("Stay signed in on this TV"));
            remember = element("input", "remember-checkbox");
            remember.type = "checkbox";
            remember.checked = false;
            rememberLabel.appendChild(remember);
            section.appendChild(rememberLabel);
            section.appendChild(element("p", "remember-note",
                translate("Your sign-in is stored unencrypted on this TV. Leave this off on a shared TV.")));
        }

        var advanced = element("div", "advanced-panel");
        advanced.hidden = true;
        var form = element("form", "connect-form");
        var serverLabel = element("label", "", translate("Server URL"));
        var serverInput = element("input", "remote-input");
        serverInput.type = "url";
        serverInput.name = "server";
        serverInput.value = "http://127.0.0.1:32499";
        serverInput.autocomplete = "url";
        serverLabel.appendChild(serverInput);

        var tokenLabel = element("label", "", translate("Server access token"));
        var tokenInput = element("input", "remote-input");
        tokenInput.type = "password";
        tokenInput.name = "token";
        tokenInput.autocomplete = "off";
        tokenLabel.appendChild(tokenInput);

        var submit = element("button", "primary-button", translate("Connect"));
        submit.type = "submit";
        form.appendChild(serverLabel);
        form.appendChild(tokenLabel);
        form.appendChild(submit);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            connect(serverInput.value, tokenInput.value);
        });
        advanced.appendChild(form);
        if (window.PlexSession) { button(advanced, "Delete saved sign-in", signOut); }
        section.appendChild(advanced);
        advancedToggle.addEventListener("click", function () {
            advanced.hidden = !advanced.hidden;
            if (!advanced.hidden) { serverInput.focus(); }
        });
        if (message) {
            section.appendChild(element("p", "inline-error", message));
        }
        screen.appendChild(section);
        rememberControl = remember;
        beginAuthorization(authInfo, true);
        focusFirst();
    }

    function connect(serverUrl, token) {
        stopAuthorization();
        setStatus("Connecting…");
        try {
            currentServerId = "";
            currentClient = window.PlexApi.createClient({
                baseUrl: serverUrl,
                token: token
            });
        } catch (error) {
            addConnectForm(error.message);
            setStatus(error.message, true);
            return;
        }

        loadHome(true);
    }

    function playFromCard(item, client, resume) {
        setStatus("Loading details...");
        var generation = viewGeneration;
        client.getMetadata(item.ratingKey).then(function (metadata) {
            if (generation !== viewGeneration || player) { return; }
            startPlayer(metadata, client, resume ? metadata.viewOffset || 0 : 0);
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(error.message, true); }
        });
    }

    // The LG card hold menu: long-press OK (or the Tools/Info key) on a card. Every write still
    // goes through the explicit confirmation screen.
    function openItemMenu(node) {
        var info = node && node.plexCard;
        if (!info || !window.PlexItemMenu) { return false; }
        var rows = window.PlexItemMenu.rows(info.item, {
            deck: !!info.options.deck, continueAction: preferences.continueAction
        });
        if (!rows.length) { return false; }
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", info.item.title || translate("Selected item")));
        var item = info.item;
        var client = info.client;
        function close() {
            if (menu.parentNode) { menu.parentNode.removeChild(menu); }
        }
        rows.forEach(function (row) {
            button(menu, row.label, function () {
                close();
                if (row.id === "play" || row.id === "start") {
                    playFromCard(item, client, row.id === "play");
                } else if (row.id === "details") {
                    visit(function () { openDetail(item.ratingKey, client); });
                } else if (row.id === "show") {
                    visit(function () { openDetail(item.grandparentRatingKey, client); });
                } else if (row.id === "season") {
                    visit(function () { openDetail(item.parentRatingKey, client); });
                } else {
                    confirmWatchAction(item, client, row.id);
                }
            });
        });
        button(menu, "Cancel", function () { close(); node.focus(); });
        screen.appendChild(menu);
        menu.querySelector("button").focus();
        return true;
    }

    function favoriteKeys() {
        if (!currentServerId || !window.PlexFavorites) { return null; }
        try { return window.PlexFavorites.load(window.localStorage, currentServerId); }
        catch (error) { return null; }
    }

    function needsFavoritesOnboarding() {
        if (!currentServerId || !window.PlexFavorites) { return false; }
        try { return window.PlexFavorites.load(window.localStorage, currentServerId) === null; }
        catch (error) { return false; }
    }

    // LG's onboarding "Favorite libraries" step: choose which libraries Home shows for this
    // server. Shown once per server after selection; Settings reopens it as an editor. Nothing
    // is written to Plex; the choice is stored on this TV only.
    function openFavorites(firstRun) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        restoreView = function () { openFavorites(firstRun); };
        screen.appendChild(element("h2", "", translate("Favorite libraries")));
        setStatus("Loading libraries...");
        currentClient.getSections().then(function (sections) {
            if (generation !== viewGeneration) { return; }
            sections = sections.filter(function (section) {
                return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
            });
            if (!sections.length) { loadHome(false); return; }
            var saved = favoriteKeys();
            var all = sections.map(function (section) { return String(section.key); });
            var chosen = (saved || all).filter(function (key) { return all.indexOf(key) !== -1; });
            if (!chosen.length) { chosen = all.slice(); }
            var initial = chosen.slice().sort().join(",");
            screen.appendChild(element("p", "help-text", translate(firstRun ?
                "Choose the libraries Home shows. You can change this later in Settings." :
                "Choose the libraries Home shows on this server.")));
            var done;
            function refreshDone() {
                if (!done) { return; }
                done.disabled = !firstRun && chosen.slice().sort().join(",") === initial;
            }
            sections.forEach(function (section) {
                var key = String(section.key);
                var toggle = button(screen, "", function () {
                    var index = chosen.indexOf(key);
                    if (index !== -1) {
                        if (chosen.length === 1) { setStatus("Keep at least one library.", true); return; }
                        chosen.splice(index, 1);
                    } else { chosen.push(key); }
                    paint();
                    refreshDone();
                });
                function paint() {
                    toggle.textContent = (chosen.indexOf(key) !== -1 ? "[x] " : "[ ] ") + (section.title || key);
                    toggle.setAttribute("aria-pressed", chosen.indexOf(key) !== -1 ? "true" : "false");
                }
                paint();
            });
            done = button(screen, firstRun ? "Start watching" : "Done", function () {
                try {
                    window.PlexFavorites.save(window.localStorage, currentServerId, chosen);
                } catch (error) { setStatus(error.message === "Keep at least one library." ? error.message :
                    "Could not save favorite libraries. Check app storage permissions.", true); return; }
                navigation.length = 0;
                restoreView = null;
                loadHome(false);
            });
            refreshDone();
            button(screen, firstRun ? "Skip for now" : "Back", function () {
                if (firstRun) { navigation.length = 0; restoreView = null; loadHome(false); }
                else { backView(); }
            });
            setStatus(firstRun ? "Nothing is saved until you choose Start watching." : "Toggle libraries, then choose Done.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            if (firstRun) { loadHome(false); return; }
            setStatus(error.message, true);
            button(screen, "Back", backView);
            focusFirst();
        });
    }

    function loadHome(showConnectOnError) {
        var generation = ++viewGeneration;
        cancelViewRequests();
        itemsLoading = false;
        Promise.all([
            currentClient.getSections(),
            currentClient.getHomeHubs()
        ]).then(function (result) {
            if (generation !== viewGeneration) { return; }
            renderHome(result[0], result[1]);
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (accountClient && recoverSession(error)) { return; }
            if (showConnectOnError) {
                currentClient = null;
                addConnectForm(error.message);
            }
            setStatus(error.message, true);
        });
    }

    function renderHome(sections, hubs) {
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        resetImages();
        restoreView = function () { loadHome(false); };
        currentSection = null;
        var nav = element("nav", "home-navigation");
        nav.setAttribute("aria-label", translate("Home"));
        button(nav, "Search", function () { visit(openSearch); });
        button(nav, "Settings", function () { visit(openSettings); });
        button(nav, "Live TV and DVR", function () { visit(openTelevision); });
        if (accountClient) { button(nav, "Watchlist", function () { visit(function () { catalogueUi().watchlist(); }); }); }
        if (accountClient) { button(nav, "Plex catalogue", function () { visit(function () { catalogueUi().search(); }); }); }
        button(nav, "Change server", function () {
            currentClient = null;
            currentServerId = "";
            if (accountClient) { openServers(); } else { addConnectForm(""); }
        });
        screen.appendChild(nav);
        screen.appendChild(element("h2", "", translate("Home")));

        var sectionPanel = element("section", "content-panel");
        addSectionHeading(sectionPanel, translate("Libraries"));
        if (!sections.length) {
            sectionPanel.appendChild(element("p", "empty-state", translate("No libraries were returned by this server.")));
        }
        var favorites = favoriteKeys();
        var browsable = sections.filter(function (section) {
            return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
        });
        (window.PlexFavorites ? window.PlexFavorites.filter(browsable, favorites) : browsable).forEach(function (section) {
            var button = element("button", "library-button menu-control menu-icon-library", section.title || "Untitled library");
            button.type = "button";
            button.addEventListener("click", function () {
                visit(function () { openSection(section); });
            });
            sectionPanel.appendChild(button);
        });
        screen.appendChild(sectionPanel);

        var hubPanel = element("section", "content-panel");
        addSectionHeading(hubPanel, "Plex shelves");
        if (!hubs.length) {
            hubPanel.appendChild(element("p", "empty-state", translate("No Home shelves were returned.")));
        }
        hubs.filter(function (hub) {
            return !favorites || hub.librarySectionID === undefined ||
                favorites.indexOf(String(hub.librarySectionID)) !== -1;
        }).forEach(function (hub) {
            var deck = !!(window.PlexItemMenu && window.PlexItemMenu.isDeckHub(hub));
            var hubSection = element("section", "shelf");
            hubSection.appendChild(element("h3", "hub-title", hub.title || "Plex shelf"));
            var metadata = Array.isArray(hub.Metadata) ? hub.Metadata : [];
            metadata.slice(0, 12).forEach(function (item) {
                if (item.ratingKey) { card(hubSection, item, currentClient, null, { deck: deck }); }
            });
            hubPanel.appendChild(hubSection);
        });
        screen.appendChild(hubPanel);
        setStatus((usingRelay ? "Connected through Plex relay (bandwidth limited). " : "Connected. ") +
            "Select a title for details. Hold OK on a card for more actions.");
        focusFirst();
    }

    function openSection(section, saved) {
        viewGeneration += 1;
        itemsLoading = false;
        currentSection = section;
        currentItems = saved ? saved.items : [];
        currentOffset = saved ? saved.offset : 0;
        libraryFilters = saved ? saved.filters : {};
        clear(screen);
        resetImages();
        restoreView = function () {
            openSection(section, { items: currentItems.slice(), offset: currentOffset,
                filters: JSON.parse(JSON.stringify(libraryFilters)) });
        };
        screen.appendChild(element("h2", "", section.title || "Library"));
        button(screen, "Sort and filters", function () { visit(function () { openBrowseOptions(section); }); });
        button(screen, "A-Z", function () { visit(function () { openLetters(section); }); });
        button(screen, "Collections", function () {
            visit(function () {
                openListing("Collections", function () { return currentClient.getCollections(section.key); }, currentClient);
            });
        });
        var list = element("div", "item-list");
        list.id = "item-list";
        screen.appendChild(list);
        currentItems.forEach(function (item) { card(list, item, currentClient, currentItems); });
        var previousPage = button(screen, "Previous page", function () {
            var start = Math.max(0, currentOffset - currentItems.length - 50);
            openSection(section, { items: [], offset: start, filters: libraryFilters });
            loadNextPage();
        });
        previousPage.id = "previous-page";
        previousPage.disabled = currentOffset <= currentItems.length;
        var loadMore = button(screen, "Load more", loadNextPage);
        loadMore.id = "load-more";
        var back = button(screen, "Back to Home", backView);
        back.id = "home-back";
        focusFirst();
        if (!saved) { loadNextPage(); }
    }

    function loadNextPage() {
        if (!currentClient || !currentSection || itemsLoading) {
            return;
        }
        var generation = viewGeneration;
        var section = currentSection;
        itemsLoading = true;
        setStatus("Loading library items…");
        currentClient.getSectionItems(section.key, currentOffset, 50, libraryFilters).then(function (page) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            currentItems = currentItems.concat(page.items);
            if (currentItems.length > 200) { currentItems = currentItems.slice(-200); }
            currentOffset = page.offset + page.items.length;
            document.getElementById("previous-page").disabled = currentOffset <= currentItems.length;
            var list = document.getElementById("item-list");
            clear(list);
            resetImages();
            currentItems.forEach(function (item) { card(list, item, currentClient, currentItems); });
            var loadMore = document.getElementById("load-more");
            loadMore.disabled = currentOffset >= page.totalSize || page.items.length === 0;
            if (loadMore.disabled && document.activeElement === loadMore) {
                document.getElementById("home-back").focus();
            }
            setStatus(currentOffset + " of " + page.totalSize + " items loaded. Showing the latest " + currentItems.length + ".");
        }).catch(function (error) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            if (accountClient && recoverSession(error)) { return; }
            setStatus(error.message, true);
        });
    }

    function openListing(title, loader, client, offset, retained) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        screen.appendChild(element("h2", "", title));
        setStatus("Loading...");
        offset = offset || 0;
        retained = retained || [];
        loader(offset).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var items = retained.concat(container.Metadata || []).slice(-200);
            restoreView = function () {
                openListing(title, function () { return Promise.resolve({ Metadata: items }); }, client);
            };
            var list = element("div", "item-list");
            screen.appendChild(list);
            if (!items.length) { list.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            items.forEach(function (item) { if (item.ratingKey) { card(list, item, client, items); } });
            var next = offset + (container.Metadata || []).length;
            if (container.totalSize > next && next > offset) {
                button(screen, "Load more", function () { openListing(title, loader, client, next, items); });
            }
            button(screen, "Back", backView);
            setStatus(items.length + " items shown.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry", function () { openListing(title, loader, client, offset, retained); });
            button(screen, "Back", backView);
            setStatus(error.message, true);
            focusFirst();
        });
    }

    function openBrowseOptions(section) {
        var generation = ++viewGeneration;
        restoreView = function () { openBrowseOptions(section); };
        var selected = JSON.parse(JSON.stringify(libraryFilters));
        clear(screen);
        screen.appendChild(element("h2", "", translate("Sort and filters")));
        button(screen, "All titles", function () { libraryFilters = {}; openSection(section); });
        button(screen, "Unwatched", function () {
            var filters = {};
            filters[section.type === "show" ? "unwatchedLeaves" : "unwatched"] = 1;
            openSection(section, { items: [], offset: 0, filters: filters });
            loadNextPage();
        });
        button(screen, "Recently added", function () {
            openSection(section, { items: [], offset: 0, filters: { sort: "addedAt:desc" } });
            loadNextPage();
        });
        button(screen, "Back", backView);
        setStatus("Loading this server's supported filters and sorts...");
        currentClient.getBrowseMenus(section.key, section.type === "show" ? 2 : section.type === "artist" ? 8 :
            section.type === "photo" ? 13 : 1).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var types = container.Meta && container.Meta.Type || [];
            var type = types.filter(function (entry) { return entry.active; })[0] || types[0] || {};
            (type.Sort || []).forEach(function (sort) {
                ["asc", "desc"].forEach(function (direction) {
                    button(screen, (sort.title || sort.key) + " / " + direction, function () {
                        selected.sort = direction === "desc" && sort.descKey ? sort.descKey : sort.key + ":" + direction;
                        openSection(section, { items: [], offset: 0, filters: selected });
                        loadNextPage();
                    });
                });
            });
            (type.Filter || []).forEach(function (filter) {
                if (!filter.key || !filter.filter) { return; }
                button(screen, filter.title || filter.filter, function () {
                    visit(function () {
                        var filterGeneration = ++viewGeneration;
                        clear(screen);
                        screen.appendChild(element("h2", "", filter.title || "Filter"));
                        currentClient.getFilterValues(section.key, filter.key).then(function (values) {
                            if (filterGeneration !== viewGeneration) { return; }
                            (values.Directory || []).slice(0, 200).forEach(function (value) {
                                button(screen, value.title || String(value.key), function () {
                                    selected[filter.filter] = value.key;
                                    openSection(section, { items: [], offset: 0, filters: selected });
                                    loadNextPage();
                                });
                            });
                            button(screen, "Back", backView);
                            focusFirst();
                        }).catch(function (error) {
                            if (filterGeneration !== viewGeneration) { return; }
                            setStatus(error.message, true);
                            button(screen, "Back", backView);
                            focusFirst();
                        });
                    });
                });
            });
            setStatus("Filter and sort choices come from the selected server.");
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(error.message, true); }
        });
        focusFirst();
    }

    function openLetters(section) {
        var generation = ++viewGeneration;
        restoreView = function () { openLetters(section); };
        clear(screen);
        screen.appendChild(element("h2", "", translate("Jump to a letter")));
        button(screen, "Back", backView);
        setStatus("Loading the server's alphabet index...");
        currentClient.getLetters(section.key).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var offset = 0;
            (container.Directory || []).forEach(function (letter) {
                var start = offset;
                button(screen, letter.title || letter.key, function () {
                    openSection(section, { items: [], offset: start, filters: { sort: "titleSort:asc" } });
                    loadNextPage();
                });
                offset += Number(letter.size) || 0;
            });
            setStatus("Select a letter to jump within title order.");
            focusFirst();
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(error.message, true); }
        });
    }

    function openSearch(savedQuery) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        screen.appendChild(element("h2", "", translate("Search your servers")));
        var input = element("input", "remote-input");
        input.type = "search";
        input.maxLength = 200;
        input.value = typeof savedQuery === "string" ? savedQuery : "";
        input.setAttribute("aria-label", "Search movies and television");
        screen.appendChild(input);
        var results = element("div", "search-results");
        function search() {
            var query = input.value.trim();
            var searchGeneration = ++viewGeneration;
            cancelViewRequests();
            clear(results);
            resetImages();
            restoreView = function () { openSearch(query); };
            setStatus("Searching reachable Plex servers...");
            var targets = servers.length ? servers.slice() : [null];
            var index = 0;
            var active = 0;
            var finished = 0;
            var failures = 0;
            var shown = 0;
            function pump() {
                while (active < 2 && index < targets.length) {
                    (function (server) {
                        active += 1;
                        (server ? window.PlexApi.selectServer(server, { onClient: function (client) {
                            if (searchGeneration !== viewGeneration) { return false; }
                            viewClients.push(client);
                            return true;
                        } }).then(function (selected) { return selected.client; }) :
                            Promise.resolve(currentClient)).then(function (client) {
                            if (searchGeneration !== viewGeneration) { return; }
                            return client.search(query).then(function (container) {
                                if (searchGeneration !== viewGeneration) { return; }
                                (container.Hub || []).forEach(function (hub) {
                                    if (hub.type === "actor" || hub.type === "director") {
                                        var people = element("section", "shelf");
                                        people.appendChild(element("h3", "", hub.title || "Cast and crew"));
                                        (hub.Directory || []).slice(0, Math.max(0, Math.min(50, 200 - shown))).forEach(function (person) {
                                            button(people, person.tag || "Person", function () {
                                                visit(function () { openPerson(person, client); });
                                            }, true);
                                            shown += 1;
                                        });
                                        results.appendChild(people);
                                        return;
                                    }
                                    var items = (hub.Metadata || []).filter(function (item) {
                                        return ["movie", "show", "season", "episode", "collection", "artist", "album", "track", "photo", "photoalbum"].indexOf(item.type) !== -1;
                                    });
                                    if (!items.length) { return; }
                                    var shelf = element("section", "shelf");
                                    shelf.appendChild(element("h3", "", (server ? server.name + " / " : "") + hub.title));
                                    items.slice(0, Math.max(0, Math.min(50, 200 - shown))).forEach(function (item) {
                                        card(shelf, item, client); shown += 1;
                                    });
                                    results.appendChild(shelf);
                                });
                            });
                        }).catch(function (error) {
                            failures += 1;
                            if (searchGeneration === viewGeneration) {
                                results.appendChild(element("p", "inline-error", error.message));
                            }
                        }).then(function () {
                            active -= 1;
                            finished += 1;
                            if (searchGeneration !== viewGeneration) { return; }
                            if (finished === targets.length) {
                                setStatus(failures ? "Some servers could not be searched. Retry or change server." :
                                    shown >= 200 ? "Showing 200 results. Refine your search for more." :
                                        results.firstChild ? "Search complete." : "No matching media found.", failures > 0);
                            } else { pump(); }
                        });
                    }(targets[index++]));
                }
            }
            pump();
        }
        button(screen, "Search", search);
        button(screen, "Back", backView);
        screen.appendChild(results);
        input.addEventListener("keydown", function (event) {
            if (event.keyCode === 13) { event.preventDefault(); search(); }
        });
        restoreView = function () { openSearch(input.value); };
        setStatus("Search results keep each server's identifiers and permissions.");
        focusFirst();
        if (typeof savedQuery === "string" && savedQuery) { search(); }
    }

    function openDetail(id, client) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        button(screen, "Back", backView);
        setStatus("Loading details...");
        client.getMetadata(id).then(function (item) {
            if (generation !== viewGeneration) { return; }
            renderDetail(item, client);
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry details", function () { openDetail(id, client); });
            setStatus(error.message, true);
            focusFirst();
        });
    }

    function durationLabel(ms) {
        var minutes = Math.max(1, Math.round(ms / 60000));
        return minutes < 60 ? translate("{minutes} min", { minutes: minutes }) :
            translate("{hours} hr {minutes} min", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    }

    function detailBadges(item) {
        var media = item.Media && item.Media[0];
        var badges = [];
        if (media) {
            var resolution = String(media.videoResolution || "").toLowerCase();
            if (resolution === "4k") { badges.push("4K"); }
            else if (/^\d+$/.test(resolution)) { badges.push(resolution + "p"); }
            else if (resolution === "sd") { badges.push("SD"); }
            if (media.videoDynamicRange && media.videoDynamicRange !== "SDR") { badges.push(media.videoDynamicRange); }
            var channels = Number(media.audioChannels);
            if (channels >= 6) { badges.push(channels === 8 ? "7.1" : "5.1"); }
            var streams = media.Part && media.Part[0] && media.Part[0].Stream || [];
            if (streams.some(function (stream) { return stream.streamType === 3; })) { badges.push("CC"); }
        }
        return badges;
    }

    function detailAction(parent, label, icon, action, literal) {
        var node = button(parent, label, action, literal);
        node.className = "detail-pill" + (icon ? " detail-pill-" + icon : "");
        return node;
    }

    function renderDetail(item, client) {
        viewGeneration += 1;
        clear(screen);
        viewClients.push(client);
        resetImages();
        restoreView = function () { openDetail(item.ratingKey, client); };
        setDetailMode(true);
        var playable = ["movie", "episode", "clip", "track"].indexOf(item.type) !== -1;
        var backdropPath = item.art || item.grandparentArt || item.parentArt ||
            (item.type === "episode" || item.type === "clip" ? item.thumb : "");
        if (backdropPath) {
            var backdrop = element("img", "detail-backdrop");
            backdrop.alt = "";
            screen.appendChild(backdrop);
            queueImage(backdrop, client, backdropPath, { width: 1280, height: 720 }, 4 * 1024 * 1024, function () {
                backdrop.className = "detail-backdrop detail-backdrop-ready";
            }, true);
        }
        screen.appendChild(element("div", "detail-scrim"));

        var hero = element("section", "detail-hero");
        var main = element("div", "detail-main");
        hero.appendChild(main);
        if (item.type === "episode" && item.grandparentTitle) {
            main.appendChild(element("p", "detail-eyebrow", item.grandparentTitle +
                (item.parentIndex !== undefined && item.index !== undefined ? "  ·  S" + item.parentIndex + " E" + item.index : "")));
        } else if ((item.type === "season" || item.type === "album") && item.parentTitle) {
            main.appendChild(element("p", "detail-eyebrow", item.parentTitle));
        }
        main.appendChild(element("h2", "detail-title", item.title || "Details"));

        var identity = element("p", "detail-identity");
        var genres = (item.Genre || []).slice(0, 3).map(function (genre) { return genre.tag; }).filter(Boolean);
        if (genres.length) { identity.appendChild(element("span", "detail-genres", genres.join("  ·  "))); }
        detailBadges(item).forEach(function (badge) { identity.appendChild(element("span", "detail-badge", badge)); });
        if (identity.children && identity.children.length || identity.childNodes && identity.childNodes.length) { main.appendChild(identity); }

        main.appendChild(element("p", "synopsis detail-synopsis", item.summary || translate("No synopsis is available.")));

        var year = item.year || (item.originallyAvailableAt ? String(item.originallyAvailableAt).slice(0, 4) : "");
        var remaining = item.viewOffset && item.duration ? Math.max(1, Math.round((item.duration - item.viewOffset) / 60000)) : 0;
        main.appendChild(element("p", "detail-meta", [year, item.contentRating,
            item.duration ? durationLabel(item.duration) : "",
            remaining ? translate("{minutes} min left", { minutes: remaining }) : item.viewCount ? translate("Watched") : ""
        ].filter(Boolean).join("  ·  ")));
        if (item.viewOffset && item.duration) {
            var track = element("div", "detail-progress");
            var fill = element("div", "detail-progress-fill");
            if (fill.style) { fill.style.width = Math.min(100, Math.round(item.viewOffset * 100 / item.duration)) + "%"; }
            track.appendChild(fill);
            main.appendChild(track);
        }

        var actions = element("div", "detail-actions");
        main.appendChild(actions);
        var more = element("div", "detail-more");
        if (playable) {
            var primary = detailAction(actions, item.viewOffset ? "Resume" : "Play", "play", function () {
                startPlayer(item, client, item.viewOffset || 0);
            });
            primary.className = "detail-pill detail-primary detail-pill-play";
            if (item.viewOffset) {
                detailAction(actions, "Play from beginning", "restart", function () { startPlayer(item, client, 0); });
            }
            if ((item.Media || []).length > 1) {
                item.Media.forEach(function (media, index) {
                    detailAction(more, translate("Version {number}", { number: index + 1 }) + "  ·  " +
                        [media.videoResolution ? String(media.videoResolution).toUpperCase() : "", media.videoCodec || ""].filter(Boolean).join(" "),
                    "", function () { startPlayer(item, client, 0, index); }, true);
                });
            }
        }
        if (item.type === "album") {
            detailAction(actions, "Play album", "play", function () { startAlbum(item, client, false); }).className =
                "detail-pill detail-primary detail-pill-play";
            detailAction(actions, "Shuffle album", "shuffle", function () { startAlbum(item, client, true); });
        }
        if (item.type === "photo") {
            detailAction(actions, "View photo", "play", function () { visit(function () { openPhotos([item], 0, client); }); }).className =
                "detail-pill detail-primary detail-pill-play";
        }
        if (["show", "season", "collection", "artist", "album", "photoalbum"].indexOf(item.type) !== -1) {
            var childLabel = item.type === "show" ? "Seasons" : item.type === "season" ? "Episodes" :
                item.type === "artist" ? "Albums" : item.type === "album" ? "Tracks" :
                    item.type === "photoalbum" ? "Photos" : "Collection items";
            var children = detailAction(actions, childLabel, "list", function () {
                visit(function () {
                    openListing(item.title, function (offset) {
                        return item.type === "collection" ? client.getCollectionItems(item.ratingKey, offset) :
                            client.getChildren(item.ratingKey, offset);
                    }, client);
                });
            });
            if (item.type !== "album") { children.className = "detail-pill detail-primary detail-pill-list"; }
        }
        if (["movie", "episode", "show", "season"].indexOf(item.type) !== -1) {
            detailAction(actions, "Mark watched", "watched", function () { confirmWatchAction(item, client, "watched"); });
            detailAction(actions, "Mark unwatched", "unwatched", function () { confirmWatchAction(item, client, "unwatched"); });
        }
        var plexGuid = /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(item.guid || "") ? item.guid :
            (item.Guid || []).filter(function (guid) { return /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(guid.id || ""); })[0];
        if (plexGuid && accountClient) {
            var guid = typeof plexGuid === "string" ? plexGuid : plexGuid.id;
            detailAction(actions, "Add to Watchlist", "add", function () {
                var linked = accountClient;
                confirmServiceWrite("Add to Watchlist", function () { return linked.setWatchlist(guid, true); },
                    function () { openDetail(item.ratingKey, client); });
            });
        }
        if (["movie", "episode"].indexOf(item.type) !== -1) {
            detailAction(more, "Remove from Continue Watching", "", function () { confirmWatchAction(item, client, "remove"); });
        }
        if (plexGuid && currentServerId && client === currentClient && servers.length > 1 && (item.type === "movie" || item.type === "show")) {
            var copyGuid = typeof plexGuid === "string" ? plexGuid : plexGuid.id;
            detailAction(more, "Other servers", "", function () {
                visit(function () {
                    findCatalogueItem({ type: item.type, guid: copyGuid, title: item.title }, {
                        exclude: currentServerId, title: "Other servers", labelled: true
                    });
                });
            });
        }
        detailAction(more, "Related titles", "", function () {
            visit(function () {
                openListing("Related titles", function () {
                    return client.getRelated(item.ratingKey).then(function (container) {
                        var items = [];
                        (container.Hub || []).forEach(function (hub) { items = items.concat(hub.Metadata || []); });
                        return { Metadata: items.slice(0, 200) };
                    });
                }, client);
            });
        });
        detailAction(more, "Back", "", backView);
        main.appendChild(more);

        var directors = (item.Director || []).slice(0, 2).map(function (person) { return person.tag; }).filter(Boolean);
        var stars = (item.Role || []).slice(0, 3).map(function (person) { return person.tag; }).filter(Boolean);
        if (directors.length || stars.length) {
            var people = element("div", "detail-people");
            [["Directed by", directors], ["Starring", stars]].forEach(function (row) {
                if (!row[1].length) { return; }
                var line = element("p", "detail-people-line");
                line.appendChild(element("span", "detail-people-label", translate(row[0]) + " "));
                line.appendChild(element("span", "", row[1].join(", ")));
                people.appendChild(line);
            });
            hero.appendChild(people);
        }
        screen.appendChild(hero);

        var credits = (item.Role || []).concat(item.Director || [], item.Writer || []).slice(0, 60);
        if (credits.length) {
            var cast = element("section", "detail-section");
            cast.appendChild(element("h3", "detail-section-title", translate("Cast & Crew")));
            var row = element("div", "detail-cast-row");
            credits.forEach(function (person) {
                var node = button(row, person.tag || "Cast", function () {
                    visit(function () { openPerson(person, client); });
                }, true);
                node.className = "detail-person";
                var face = element("img", "detail-person-photo");
                face.alt = "";
                node.appendChild(face);
                var role = person.role || (item.Director || []).indexOf(person) !== -1 && translate("Director") ||
                    (item.Writer || []).indexOf(person) !== -1 && translate("Writer") || "";
                if (role) { node.appendChild(element("span", "detail-person-role", role)); }
                queueImage(face, client, person.thumb, { width: 200, height: 200 });
            });
            cast.appendChild(row);
            screen.appendChild(cast);
        }
        var extras = item.Extras && item.Extras.Metadata || [];
        if (extras.length) {
            var shelf = element("section", "shelf detail-section");
            shelf.appendChild(element("h3", "detail-section-title", translate("Extras and trailers")));
            extras.slice(0, 20).forEach(function (extra) { card(shelf, extra, client); });
            screen.appendChild(shelf);
        }
        setStatus("Choose Play or Resume to start playback. Browsing does not update watch history.");
        focusFirst();
    }

    function confirmWatchAction(item, client, action) {
        visit(function () {
            var generation = ++viewGeneration;
            clear(screen);
            var label = action === "remove" ? "Remove from Continue Watching" :
                action === "watched" ? "Mark watched" : "Mark unwatched";
            screen.appendChild(element("h2", "", label));
            screen.appendChild(element("p", "synopsis", item.title || "Selected item"));
            screen.appendChild(element("p", "help-text", action === "remove" ?
                "Hide this item from Continue Watching without clearing its resume position." :
                action === "unwatched" ? "This clears watched status and the saved resume position on Plex." :
                    "This changes watched status on Plex."));
            if (item.type === "show" || item.type === "season") {
                screen.appendChild(element("p", "help-text", translate("This changes every episode in this show or season.")));
            }
            var pending = false;
            var confirm = button(screen, "Confirm " + label.toLowerCase(), function () {
                if (pending || generation !== viewGeneration) { return; }
                pending = true;
                confirm.disabled = true;
                cancel.textContent = translate("Back to details");
                setStatus("Saving the explicit change to Plex...");
                Promise.resolve().then(function () {
                    return action === "remove" ? client.removeContinueWatching(item.ratingKey) :
                        client.setWatched(item.ratingKey, action === "watched");
                }).then(function () {
                    if (generation !== viewGeneration) { return; }
                    setStatus("Plex accepted the change. Refreshing details...");
                    return client.getMetadata(item.ratingKey).then(function (updated) {
                        if (generation !== viewGeneration) { return; }
                        navigation.pop();
                        renderDetail(updated, client);
                        setStatus("Plex accepted the change; details were refreshed.");
                    }).catch(function () {
                        if (generation === viewGeneration) {
                            setStatus("Plex accepted the change, but details could not be refreshed. Go back and retry loading details.", true);
                        }
                    });
                }, function (error) {
                    if (generation !== viewGeneration) { return; }
                    pending = false;
                    confirm.disabled = false;
                    cancel.textContent = translate("Cancel");
                    setStatus("Plex did not confirm the change. Check the server state before retrying. " + error.message, true);
                });
            });
            var cancel = button(screen, "Cancel", backView);
            restoreView = function () { renderDetail(item, client); };
            setStatus("Nothing changes until you confirm. This affects the selected Plex profile.");
            focusFirst();
        });
    }

    function timeLabel(ms) {
        var seconds = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
    }

    function openPerson(person, client) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        restoreView = function () { openPerson(person, client); };
        screen.appendChild(element("h2", "", person.tag || "Person"));
        if (person.role) { screen.appendChild(element("p", "detail-meta", person.role)); }
        button(screen, "Titles in this server", function () {
            visit(function () {
                openListing(person.tag || "Person", function (offset) {
                    return client.getPerson(null, person.id, offset);
                }, client);
            });
        });
        button(screen, "Back", backView);
        setStatus("Person biography and catalogue credits require a linked Plex account.");
        if (accountClient && person.tagKey) {
            accountClient.personProfile(person.tagKey).then(function (container) {
                if (generation !== viewGeneration) { return; }
                var profile = (container.Metadata || [])[0] || {};
                screen.appendChild(element("p", "synopsis", profile.summary || "No biography supplied by Plex."));
                if (profile.bornAt) {
                    screen.appendChild(element("p", "detail-meta", profile.bornAt + (profile.birthPlace ? " / " + profile.birthPlace : "")));
                }
            }).catch(function (error) {
                if (generation === viewGeneration) { screen.appendChild(element("p", "inline-error", error.message)); }
            });
            var localIndex = client.personLibraryIndex(person.id).catch(function () { return null; });
            Promise.all([accountClient.personCredits(person.tagKey), localIndex]).then(function (results) {
                var groups = results[0];
                var local = results[1];
                if (generation !== viewGeneration) { return; }
                var shown = 0;
                var held = 0;
                groups.slice(0, 20).forEach(function (group) {
                    if (shown >= 200) { return; }
                    screen.appendChild(element("h3", "", group.title || "Credits"));
                    (group.Credit || []).slice(0, 200 - shown).forEach(function (credit) {
                        var title = credit.Metadata;
                        if (!title) { return; }
                        var label = (title.title || "Untitled") + (title.year ? " / " + title.year : "") +
                            (credit.role ? " / " + credit.role : "");
                        var ratingKey = local && window.PlexApi.matchCredit(local.index, title.ratingKey);
                        if (ratingKey) {
                            held += 1;
                            button(screen, label + " / " + translate("In this library"), function () {
                                visit(function () { openDetail(ratingKey, client); });
                            }, true);
                        } else {
                            button(screen, label + " / " + translate("Search libraries"), function () {
                                visit(function () { openSearch(title.title); });
                            }, true);
                        }
                        shown += 1;
                    });
                });
                setStatus((shown >= 200 ? translate("Showing the first 200 credits.") + " " : "") +
                    (local ? translate("{count} credits are in this library.", { count: held }) +
                        (local.complete ? "" : " " + translate("Only the first 500 local titles were checked.")) :
                        translate("This server's titles could not be checked. Search libraries to find an available version.")));
            }).catch(function (error) {
                if (generation === viewGeneration) { screen.appendChild(element("p", "inline-error", error.message)); }
            });
        }
        focusFirst();
    }

    function showPlayerError(error) { setStatus(error.message || "Playback failed. Stop and retry.", true); }

    function serviceView(title, restore) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        restoreView = restore;
        screen.appendChild(element("h2", "", translate(title)));
        button(screen, "Back", backView);
        setStatus("Loading...");
        focusFirst();
        return generation;
    }

    function openTelevision() {
        window.PlexTelevisionUi.create({
            client: function () { return currentClient; }, preferences: function () { return preferences; },
            screen: screen, view: serviceView, generation: function () { return viewGeneration; },
            element: element, button: button, translate: translate, visit: visit, back: backView,
            status: setStatus, focus: focusFirst, confirm: confirmServiceWrite
        }).open();
    }

    function catalogueUi() {
        return window.PlexCatalogueUi.create({
            account: function () { return accountClient; }, screen: screen, view: serviceView,
            generation: function () { return viewGeneration; }, element: element, button: button,
            translate: translate, visit: visit, status: setStatus, focus: focusFirst, confirm: confirmServiceWrite,
            find: findCatalogueItem
        });
    }

    // Exact plex:// GUID matches across reachable servers. "Other servers" (the LG alternate
    // sources panel) excludes the server you are on and labels each copy with its server and
    // resolution; OK opens that server's own detail page rather than swapping the playing copy,
    // because a resume position belongs to one copy.
    function findCatalogueItem(item, options) {
        options = options || {};
        var generation = serviceView(options.title || "Find in my libraries", function () { findCatalogueItem(item, options); });
        var targets = servers.length ? servers.filter(function (server) { return server.id !== options.exclude; }) : [null];
        if (!targets.length) { setStatus("No other servers are available to this profile."); return; }
        var index = 0, active = 0, finished = 0, shown = 0, failed = 0;
        function pump() {
            while (active < 2 && index < targets.length) {
                (function (server) {
                    active += 1;
                    (server ? window.PlexApi.selectServer(server, { onClient: function (client) {
                        if (generation !== viewGeneration) { return false; }
                        viewClients.push(client); return true;
                    } }).then(function (selected) { return selected.client; }) : Promise.resolve(currentClient))
                        .then(function (client) {
                            if (generation !== viewGeneration) { return; }
                            return client.getSections().then(function (sections) {
                                var matches = sections.filter(function (section) { return section.type === item.type; });
                                var chain = Promise.resolve();
                                matches.forEach(function (section) {
                                    chain = chain.then(function () {
                                        if (generation !== viewGeneration) { return; }
                                        return client.findGuid(section.key, item.guid).then(function (items) {
                                            if (generation !== viewGeneration) { return; }
                                            items.slice(0, 200 - shown).forEach(function (match) {
                                                if (options.labelled) {
                                                    var media = (match.Media || [])[0] || {};
                                                    screen.appendChild(element("p", "card-meta", [server ? server.name : "",
                                                        section.title, media.videoResolution ? media.videoResolution + (/^[0-9]+$/.test(media.videoResolution) ? "p" : "") : ""]
                                                        .filter(Boolean).join(" / ")));
                                                }
                                                card(screen, match, client); shown += 1;
                                            });
                                        });
                                    });
                                });
                                return chain;
                            });
                        }).catch(function (error) {
                            if (generation !== viewGeneration) { return; }
                            failed += 1;
                            screen.appendChild(element("p", "inline-error", error.message));
                        }).then(function () {
                            active -= 1; finished += 1;
                            if (generation !== viewGeneration) { return; }
                            if (finished === targets.length) {
                                setStatus(failed ? "Some libraries could not be checked. Availability is incomplete." :
                                    shown ? (options.labelled ? "Other copies of this title. Each copy keeps its own resume position." :
                                        "Exact Plex GUID matches in your libraries.") : "This title is not available in the checked libraries.");
                                focusFirst();
                            } else { pump(); }
                        });
                }(targets[index++]));
            }
        }
        pump();
    }

    function confirmServiceWrite(title, write, refresh) {
        visit(function () {
            var generation = serviceView(title, refresh);
            screen.appendChild(element("p", "help-text", translate("This changes your Plex account or server. Nothing changes until you confirm.")));
            var pending = false;
            var confirm = button(screen, "Confirm", function () {
                if (pending || generation !== viewGeneration) { return; }
                pending = true; confirm.disabled = true;
                setStatus("Saving...");
                Promise.resolve().then(write).then(function () {
                    if (generation !== viewGeneration) { return; }
                    setStatus("Plex accepted the change.");
                    button(screen, "Refresh", refresh);
                }).catch(function (error) {
                    if (generation !== viewGeneration) { return; }
                    setStatus(translate("The change was not confirmed. Check Plex before retrying.") + " " + error.message, true);
                });
            });
            button(screen, "Cancel", backView);
            setStatus("Review the change before confirming.");
            focusFirst();
        });
    }

    function openPhotos(items, index, client) {
        viewGeneration += 1;
        clear(screen);
        viewClients.push(client);
        resetImages();
        restoreView = function () { openPhotos(items, index, client); };
        try {
            if (!window.URL || !window.URL.createObjectURL) { throw new Error("Photo display is unavailable in this runtime."); }
            var viewer = window.PlexPhotos.create({
                items: items, index: index, client: client, parent: screen, element: element,
                button: button, status: setStatus, translate: translate, urls: window.URL, back: backView
            });
            viewCleanup = viewer.close;
        } catch (error) { setStatus(error.message, true); button(screen, "Back", backView); }
        focusFirst();
    }

    function startAlbum(item, client, shuffle) {
        if (musicLoading || player || playerClosing) { return; }
        musicLoading = true;
        var generation = viewGeneration;
        setStatus(translate("Loading music queue..."));
        client.getTracks(item.ratingKey).then(function (tracks) {
            if (generation !== viewGeneration || player) { return; }
            musicQueue = window.PlexQueue.create(tracks);
            queueShuffle = shuffle;
            queueRepeat = "off";
            musicQueue.shuffle(shuffle);
            return client.getMetadata(musicQueue.current().ratingKey).then(function (track) {
                if (generation === viewGeneration && !player) { startPlayer(track, client, 0); }
            });
        }).catch(function (error) {
            if (generation === viewGeneration) { musicQueue = null; showPlayerError(error); }
        }).then(function () { musicLoading = false; });
    }

    function skipMusic(delta, automatic) {
        if (!player || !musicQueue || playerClosing || musicLoading) { return; }
        musicLoading = true;
        var client = playerClient;
        var previous = playerItem;
        stopPlayer(function () {
            var next = delta < 0 ? musicQueue.previous() : musicQueue.next(automatic);
            if (!next) {
                musicQueue = null; musicLoading = false;
                renderDetail(previous, client);
                return;
            }
            renderDetail(next, client);
            var generation = viewGeneration;
            client.getMetadata(next.ratingKey).then(function (track) {
                if (generation === viewGeneration && !player) { startPlayer(track, client, 0); }
            }).catch(function (error) {
                if (generation === viewGeneration) { musicQueue = null; showPlayerError(error); }
            }).then(function () { musicLoading = false; });
        }).then(function () { if (player) { musicLoading = false; } });
    }

    function cancelHudTimer() {
        if (hudTimer !== null) { clearTimeout(hudTimer); hudTimer = null; }
    }

    function showHud() {
        cancelHudTimer();
        var hud = screen.querySelector(".player-hud");
        var shell = document.querySelector(".app-shell");
        if (hud) { hud.hidden = false; }
        if (shell) { shell.classList.remove("hud-hidden"); }
        if (!player || playerClosing || hudBuffering || player.snapshot().state !== "playing" ||
                document.getElementById("player-menu") || status.className.indexOf("status-error") !== -1) { return; }
        var owner = player;
        hudTimer = setTimeout(function () {
            hudTimer = null;
            if (player !== owner || playerClosing || hudBuffering || owner.snapshot().state !== "playing" ||
                    document.getElementById("player-menu")) { return; }
            if (hud) {
                if (hud.contains(document.activeElement)) {
                    hudFocus = document.activeElement;
                    hudFocus.blur();
                }
                hud.hidden = true;
            }
            if (shell) { shell.classList.add("hud-hidden"); }
        }, 5000);
    }

    function closePlayerMenu() {
        var menu = document.getElementById("player-menu");
        if (menu) { menu.parentNode.removeChild(menu); }
        showHud();
        focusFirst();
    }

    function openPlaybackOptions() {
        if (!player) { return; }
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Playback options")));
        button(menu, "Chapters and markers", openChapters);
        button(menu, "Audio and subtitles", openTracks);
        button(menu, "Quality and version", openQuality);
        var information = element("p", "help-text");
        information.hidden = true;
        button(menu, "Playback information", function () {
            information.hidden = false;
            information.textContent = translate(player.mode() === "direct" ?
                "Direct play with an explicitly evidenced capability profile." :
                "Plex server transcode: HLS / H.264 + AAC.") +
                (player.mode() === "direct" ? "" : " " + preferences.quality + "p.");
        });
        menu.appendChild(information);
        if (playerItem.type === "track") {
            button(menu, "Previous track", function () { skipMusic(-1, false); });
            button(menu, "Next track", function () { skipMusic(1, false); });
            button(menu, "Shuffle / On or off", function () {
                queueShuffle = musicQueue.shuffle(!queueShuffle);
                setStatus(translate(queueShuffle ? "Shuffle on." : "Shuffle off."));
            });
            button(menu, "Repeat / Off, one, all", function () {
                queueRepeat = queueRepeat === "off" ? "one" : queueRepeat === "one" ? "all" : "off";
                musicQueue.repeat(queueRepeat);
                setStatus(translate("Repeat") + ": " + translate(queueRepeat));
            });
        }
        button(menu, "Stop and return to details", stopPlayer);
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        menu.querySelectorAll("button")[0].focus();
    }

    function startPlayer(item, client, offset, mediaIndex, trackOptions) {
        if (player || playerClosing) { return; }
        if (item.type === "track" && (!musicQueue || musicQueue.current().ratingKey !== item.ratingKey)) {
            musicQueue = window.PlexQueue.create([item]);
            queueShuffle = false; queueRepeat = "off";
        } else if (item.type !== "track") { musicQueue = null; }
        viewGeneration += 1;
        resetImages();
        clear(screen);
        hudBuffering = false;
        hudFocus = null;
        playerItem = item;
        playerClient = client;
        playerSettings = {
            offset: offset || 0, mediaIndex: mediaIndex || 0, quality: preferences.quality,
            audioId: trackOptions && trackOptions.audioId || 0,
            subtitleId: trackOptions && trackOptions.subtitleId || 0
        };
        externalCues = trackOptions && trackOptions.cues || null;
        document.body.className = "playing";
        var hud = element("section", "player-hud");
        hud.appendChild(element("h2", "", item.title || "Playing"));
        var time = element("p", "playback-time", translate("Preparing playback..."));
        time.id = "playback-time";
        hud.appendChild(time);
        var progress = element("div", "playback-progress");
        progress.setAttribute("role", "progressbar");
        progress.setAttribute("aria-label", item.title || translate("Playing"));
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", "100");
        var progressFill = element("div", "playback-progress-fill");
        progress.appendChild(progressFill);
        hud.appendChild(progress);
        var subtitle = element("p", "subtitle-text");
        subtitle.id = "subtitle-text";
        screen.appendChild(subtitle);
        var controls = element("div", "playback-controls");
        button(controls, "Back 10 seconds", function () { seekPlayer(-10000); }, false, "back");
        button(controls, "Pause / Play", togglePlayer, false, "play");
        button(controls, "Forward 30 seconds", function () { seekPlayer(30000); }, false, "play");
        button(controls, "More", openPlaybackOptions, false, "settings");
        hud.appendChild(controls);
        screen.appendChild(hud);
        var ownPlayer;
        try {
            var adapter = window.PlexAvplay.create({
                avplay: window.webapis && window.webapis.avplay,
                onEvent: function (event) {
                    if (!player || player !== ownPlayer) { return; }
                    if (event.type === "time") {
                        var label = document.getElementById("playback-time");
                        if (label) { label.textContent = timeLabel(event.position) + " / " + timeLabel(event.duration || item.duration); }
                        var percent = Math.min(100, Math.max(0, event.position * 100 / (event.duration || item.duration || 1)));
                        progress.setAttribute("aria-valuenow", String(Math.round(percent)));
                        if (progressFill.style) { progressFill.style.width = percent + "%"; }
                        if (externalCues) {
                            document.getElementById("subtitle-text").textContent = window.PlexSubtitles.at(externalCues, event.position);
                        }
                    } else if (event.type === "subtitle") {
                        if (externalCues) { return; }
                        var text = document.getElementById("subtitle-text");
                        if (text) {
                            text.textContent = event.detail.text;
                            if (subtitleTimer !== null) { clearTimeout(subtitleTimer); }
                            subtitleTimer = setTimeout(function () { text.textContent = ""; }, event.detail.duration || 3000);
                        }
                    } else if (event.type === "buffering") {
                        hudBuffering = !!event.detail;
                        setStatus(event.detail ? "Buffering..." : "Playback ready.");
                        showHud();
                    } else if (event.type === "state") {
                        showHud();
                    } else if (event.type === "error") {
                        showPlayerError({ message: event.detail });
                    } else if (event.type === "ended") {
                        finishEpisode();
                    }
                }
            });
            if ((item.type === "movie" || item.type === "episode") && currentServerId &&
                    client === currentClient && client.createVideoPlayQueue) {
                var queueSettings = playerSettings;
                client.createVideoPlayQueue(currentServerId, item.ratingKey).then(function (queue) {
                    if (playerSettings === queueSettings) { queueSettings.playQueue = queue; }
                }).catch(function () { /* the queue is optional; playback and progress continue without it */ });
            }
            ownPlayer = window.PlexPlayback.create({
                adapter: adapter, client: client, item: item, settings: playerSettings,
                onEvent: function (event) {
                    if (event.type === "progress-error" || event.type === "cleanup-error") {
                        if (player === ownPlayer) { setStatus(event.message, true); }
                    }
                }
            });
            player = ownPlayer;
            setStatus("Asking Plex for a compatible stream...");
            player.start().then(function () {
                if (player === ownPlayer) {
                    setStatus("");
                    showHud();
                }
            }).catch(function (error) {
                if (player === ownPlayer) { showPlayerError(error); }
            });
        } catch (error) {
            document.body.className = "";
            player = null;
            showHud();
            externalCues = null;
            renderDetail(item, client);
            showPlayerError(error);
        }
        focusFirst();
    }

    function togglePlayer() {
        if (!player) { return; }
        try {
            var action = player.snapshot().state === "playing" ? player.pause() : player.play();
            action.then(showHud).catch(showPlayerError);
        } catch (error) { showPlayerError(error); }
    }

    function seekPlayer(delta) {
        if (!player) { return; }
        player.seek(player.snapshot().position + delta).then(function (position) {
            setStatus("Seek landed at " + timeLabel(position) + ".");
            showHud();
        }).catch(showPlayerError);
    }

    function stopPlayer(after) {
        if (!player || playerClosing) { return Promise.resolve(); }
        playerClosing = true;
        cancelHudTimer();
        if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
        if (subtitleTimer !== null) { clearTimeout(subtitleTimer); subtitleTimer = null; }
        var closing = player;
        var item = playerItem;
        var client = playerClient;
        var safeToLeave = true;
        return closing.stop().then(function (metadata) { item = metadata || item; }, function (error) {
            showPlayerError(error);
            safeToLeave = closing.snapshot().state === "idle";
        }).then(function () {
            if (!safeToLeave) { playerClosing = false; showHud(); return; }
            player = null;
            showHud();
            playerClosing = false;
            document.body.className = "";
            if (typeof after === "function") { after(); }
            else { renderDetail(item, client); }
            if (typeof after !== "function") { musicQueue = null; }
        });
    }

    function openChapters() {
        if (!player) { return; }
        cancelHudTimer();
        var menu = document.getElementById("player-menu");
        if (menu) { menu.parentNode.removeChild(menu); }
        menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Chapters and markers")));
        (playerItem.Chapter || []).forEach(function (chapter, index) {
            button(menu, chapter.tag || "Chapter " + (index + 1), function () {
                player.seek(chapter.startTimeOffset || 0).catch(showPlayerError);
            });
        });
        (playerItem.Marker || []).forEach(function (marker) {
            if (marker.type === "intro" || marker.type === "credits") {
                button(menu, marker.type === "intro" ? "Skip Intro" : "Skip Credits", function () {
                    player.seek(marker.endTimeOffset).catch(showPlayerError);
                });
            }
        });
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        var control = menu.querySelectorAll("button")[0];
        if (control) { control.focus(); }
    }

    function openTracks() {
        if (!player) { return; }
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Audio and subtitles")));
        function reload(audioId, subtitleId) {
            var item = playerItem;
            var client = playerClient;
            var position = player.snapshot().position;
            var version = playerSettings.mediaIndex;
            stopPlayer(function () {
                startPlayer(item, client, position, version, { audioId: audioId, subtitleId: subtitleId });
            });
        }
        (player.part().Stream || []).forEach(function (stream) {
            if (stream.streamType === 2) {
                button(menu, "Audio / " + (stream.displayTitle || stream.language || stream.codec || stream.id), function () {
                    reload(stream.id, playerSettings.subtitleId);
                });
            } else if (stream.streamType === 3) {
                button(menu, "Subtitle / " + (stream.displayTitle || stream.language || stream.codec || stream.id) +
                    " (server-rendered)", function () { reload(playerSettings.audioId, stream.id); });
                if (stream.key && ["srt", "subrip", "webvtt"].indexOf(stream.codec) !== -1) {
                    button(menu, "Text overlay / " + (stream.displayTitle || stream.language || stream.id), function () {
                        var selectedPlayer = player;
                        setStatus("Loading text subtitles...");
                        playerClient.subtitleText(stream.id, stream.codec).then(function (text) {
                            if (player !== selectedPlayer) { return; }
                            var cues = window.PlexSubtitles.parse(text);
                            var item = playerItem;
                            var client = playerClient;
                            var position = player.snapshot().position;
                            var version = playerSettings.mediaIndex;
                            var audioId = playerSettings.audioId;
                            stopPlayer(function () {
                                startPlayer(item, client, position, version, { audioId: audioId, cues: cues });
                            });
                        }).catch(showPlayerError);
                    });
                }
            }
        });
        button(menu, "Subtitles off", function () { reload(playerSettings.audioId, 0); });
        try {
            player.tracks().forEach(function (track) {
                if (track.type !== "AUDIO" && track.type !== "TEXT") { return; }
                button(menu, "Samsung " + track.type + " track " + track.index, function () {
                    try {
                        player.selectTrack(track.type, track.index);
                        if (track.type === "TEXT") { player.subtitles(true); }
                        setStatus("Samsung track selected. Verify the output on this model.");
                    } catch (error) { showPlayerError(error); }
                });
            });
        } catch (error) { menu.appendChild(element("p", "inline-error", error.message)); }
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        var control = menu.querySelectorAll("button")[0];
        if (control) { control.focus(); }
    }

    function openQuality() {
        if (!player) { return; }
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Quality and media version")));
        function change(quality, version) {
            var item = playerItem;
            var client = playerClient;
            var position = player.snapshot().position;
            var tracks = { audioId: playerSettings.audioId, subtitleId: playerSettings.subtitleId, cues: externalCues };
            preferences.quality = quality;
            stopPlayer(function () { startPlayer(item, client, position, version, tracks); });
        }
        ["720", "1080"].forEach(function (quality) {
            button(menu, quality + "p server transcode", function () { change(quality, playerSettings.mediaIndex); });
        });
        (playerItem.Media || []).forEach(function (media, version) {
            button(menu, "Version " + (version + 1) + " / " + (media.videoResolution || "") +
                " " + (media.videoCodec || ""), function () { change(preferences.quality, version); });
        });
        menu.appendChild(element("p", "help-text", translate("Original quality needs an evidenced model capability profile. Unknown formats are not advertised as supported.")));
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        menu.querySelectorAll("button")[0].focus();
    }

    function finishEpisode() {
        if (playerItem.type === "track" && musicQueue) { skipMusic(1, true); return; }
        var item = playerItem;
        var client = playerClient;
        var queue = playerSettings && playerSettings.playQueue;
        stopPlayer(function () {
            renderDetail(item, client);
            var generation = viewGeneration;
            var successor = queueSuccessor(queue);
            (successor ? Promise.resolve(successor) : client.nextEpisode(item)).then(function (next) {
                if (!next || player || playerItem !== item || generation !== viewGeneration) { return; }
                button(screen, "Up Next: " + next.title, function () {
                    if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
                    openDetail(next.ratingKey, client);
                });
                if (preferences.autoNext && !document.hidden) {
                    setStatus("Next episode starts in 10 seconds. Back cancels.");
                    nextTimer = setTimeout(function () {
                        nextTimer = null;
                        client.getMetadata(next.ratingKey).then(function (metadata) {
                            if (generation === viewGeneration && !player) { startPlayer(metadata, client, 0); }
                        }).catch(showPlayerError);
                    }, 10000);
                }
            }).catch(showPlayerError);
        });
    }

    // The server's continuous play queue knows the next item (including across seasons);
    // Plex's next-episode lookup is the fallback when no queue was created.
    function queueSuccessor(queue) {
        if (!queue || !queue.items) { return null; }
        for (var index = 0; index < queue.items.length - 1; index += 1) {
            if (String(queue.items[index].playQueueItemID) === String(queue.itemId)) {
                var next = queue.items[index + 1];
                return next && next.ratingKey && next.type === "episode" ? next : null;
            }
        }
        return null;
    }

    function openSettings() {
        var focusedSetting = restoreView === openSettings ?
            Array.prototype.slice.call(screen.querySelectorAll("button")).indexOf(document.activeElement) : -1;
        viewGeneration += 1;
        clear(screen);
        screen.appendChild(element("h2", "", translate("Settings")));
        screen.appendChild(element("p", "help-text", translate("Account credentials are session-only unless you explicitly enabled unencrypted remember-me. No analytics or crash uploads are enabled.")));
        var menu = element("section", "settings-menu");
        menu.setAttribute("aria-label", translate("Settings"));
        screen.appendChild(menu);
        ["720", "1080"].forEach(function (quality) {
            var choice = button(menu, "Transcode quality: " + quality + "p" + (preferences.quality === quality ? " (selected)" : ""), function () {
                preferences.quality = quality;
                if (savePreferences()) { openSettings(); }
            });
            choice.setAttribute("aria-pressed", preferences.quality === quality ? "true" : "false");
        });
        var autoNext = button(menu, translate("Auto-play next episode: {state}", { state: translate(preferences.autoNext ? "On" : "Off") }), function () {
            preferences.autoNext = !preferences.autoNext;
            if (savePreferences()) { openSettings(); }
        }, false, "play");
        autoNext.setAttribute("aria-pressed", preferences.autoNext ? "true" : "false");
        button(menu, translate("Continue Watching: {state}", {
            state: translate(preferences.continueAction === "play" ? "Play" : "Open details")
        }), function () {
            preferences.continueAction = preferences.continueAction === "play" ? "details" : "play";
            if (savePreferences()) { openSettings(); }
        }, false, "play");
        if (currentClient && currentServerId) {
            button(menu, "Favorite libraries", function () { visit(function () { openFavorites(false); }); });
        }
        ["en", "es", "be"].forEach(function (language) {
            var names = { en: "English", es: "Español", be: "Беларуская" };
            var choice = button(menu, translate("Language") + ": " + names[language], function () {
                preferences.language = language;
                if (savePreferences()) { openSettings(); }
            }, false, "language");
            choice.setAttribute("aria-pressed", preferences.language === language ? "true" : "false");
        });
        button(menu, "Reset preferences", function () {
            try {
                window.PlexPreferences.reset(window.localStorage);
                if (window.PlexFavorites) { window.PlexFavorites.reset(window.localStorage); }
                preferences = window.PlexPreferences.load(window.localStorage);
                window.PlexI18n.setLanguage(preferences.language);
                openSettings();
            } catch (error) { setStatus("Could not reset preferences. Check app storage permissions.", true); }
        });
        button(menu, "Diagnostics", function () {
            visit(function () {
                viewGeneration += 1;
                clear(screen);
                screen.appendChild(element("h2", "", translate("Diagnostics")));
                screen.appendChild(element("p", "help-text",
                    "AVPlay: " + (window.webapis && window.webapis.avplay ? "available (formats unverified)" : "unavailable") +
                    ". Model support is not certified. Account tokens, server origins, titles and queries are not logged or uploaded."));
                button(screen, "Back", backView);
                focusFirst();
            });
        });
        button(menu, "Sign out", signOut);
        button(menu, "Back", backView);
        restoreView = openSettings;
        setStatus("Unknown codec capabilities use server transcoding, not guessed direct play.");
        focusFirst();
        var controls = screen.querySelectorAll("button");
        if (focusedSetting >= 0 && controls[focusedSetting]) { controls[focusedSetting].focus(); }
    }

    function insideHidden(node) {
        for (var current = node; current; current = current.parentNode) {
            if (current.hidden === true) { return true; }
        }
        return false;
    }

    function moveFocus(direction, key) {
        var menu = document.getElementById("player-menu");
        var controls = Array.prototype.slice.call((menu || screen).querySelectorAll("button, input, select")).filter(function (node) {
            return !node.disabled && !insideHidden(node);
        });
        var active = document.activeElement;
        var index = controls.indexOf(active);
        if (!controls.length) {
            return;
        }
        if (index < 0) {
            controls[0].focus();
            return;
        }
        var next = Math.max(0, Math.min(controls.length - 1, index + direction));
        if (active.getBoundingClientRect && key) {
            var source = active.getBoundingClientRect();
            var x = source.left + source.width / 2;
            var y = source.top + source.height / 2;
            var best = Infinity;
            controls.forEach(function (node, candidate) {
                if (node === active) { return; }
                var rect = node.getBoundingClientRect();
                var dx = rect.left + rect.width / 2 - x;
                var dy = rect.top + rect.height / 2 - y;
                var primary = key === 37 ? -dx : key === 39 ? dx : key === 38 ? -dy : dy;
                var secondary = key === 37 || key === 39 ? Math.abs(dy) : Math.abs(dx);
                var score = primary + secondary * 3;
                if (primary > 1 && score < best) { best = score; next = candidate; }
            });
        }
        controls[next].focus();
    }

    function onKeyDown(event) {
        var key = event.keyCode;
        var active = document.activeElement;
        if (player && [13, 37, 38, 39, 40, 415, 19, 10252, 413, 417, 412].indexOf(key) !== -1) {
            var hud = screen.querySelector(".player-hud");
            var wasHidden = hud && hud.hidden;
            showHud();
            if (wasHidden && [13, 37, 38, 39, 40].indexOf(key) !== -1) {
                event.preventDefault();
                if (hudFocus && hud.contains(hudFocus)) { hudFocus.focus(); }
                else { focusFirst(); }
                return;
            }
        }
        var editing = active && ((active.tagName === "INPUT" && active.type !== "checkbox") || active.tagName === "TEXTAREA");
        if (key === 13 && event.repeat) { event.preventDefault(); return; }
        if ((key === 10135 || key === 457) && !player && active && active.plexCard) {
            event.preventDefault();
            openItemMenu(active);
            return;
        }
        if (key === 13 && active && active.type === "checkbox") {
            event.preventDefault();
            active.checked = !active.checked;
            return;
        }
        if (key === 10009 || key === 27 || key === 8) {
            if (editing && key === 8) { return; }
            event.preventDefault();
            if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; setStatus("Auto-play cancelled."); return; }
            var menu = document.getElementById("player-menu");
            if (menu) { closePlayerMenu(); return; }
            backView();
            return;
        }
        if (player && [415, 19, 10252, 413, 417, 412].indexOf(key) !== -1) {
            event.preventDefault();
            if (Date.now() - lastAction < 150) { return; }
            lastAction = Date.now();
            if (key === 413) { stopPlayer(); }
            else if (key === 417 || key === 412) { seekPlayer(key === 417 ? 30000 : -10000); }
            else if (key === 415 && player.snapshot().state !== "paused") { return; }
            else if (key === 19 && player.snapshot().state !== "playing") { return; }
            else { togglePlayer(); }
            return;
        }
        if (editing && (key === 37 || key === 39)) {
            return;
        }
        if (key === 38) {
            event.preventDefault();
            moveFocus(-1, key);
        } else if (key === 40) {
            event.preventDefault();
            moveFocus(1, key);
        } else if (key === 37) {
            event.preventDefault();
            moveFocus(-1, key);
        } else if (key === 39) {
            event.preventDefault();
            moveFocus(1, key);
        } else if (key === 13 && active && active.plexCard && !player) {
            // A card waits for key-up: a short press opens it, a hold opens the action menu.
            event.preventDefault();
            cancelHold();
            holdCard = active;
            holdTimer = setTimeout(function () {
                holdTimer = null;
                if (holdCard === document.activeElement) { openItemMenu(holdCard); }
                holdCard = null;
            }, 600);
        } else if (key === 13 && active && active.tagName === "BUTTON") {
            event.preventDefault();
            active.click();
        }
    }

    function cancelHold() {
        if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
        holdCard = null;
    }

    function onKeyUp(event) {
        if (event.keyCode !== 13 || !holdCard) { return; }
        var target = holdCard;
        var short = holdTimer !== null;
        cancelHold();
        event.preventDefault();
        if (short && target === document.activeElement) { target.click(); }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    screen.addEventListener("mousemove", function () { if (player) { showHud(); } });
    screen.addEventListener("click", function () { if (player) { showHud(); } });
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            cancelHold();
            if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
            if (player) {
                var item = playerItem;
                var client = playerClient;
                foregroundRecovery = function () {
                    openDetail(item.ratingKey, client);
                };
                stopPlayer(function () {
                    if (!document.hidden && foregroundRecovery) {
                        var recover = foregroundRecovery; foregroundRecovery = null; recover();
                    }
                });
            } else {
                var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
                suspendedView = { restore: restoreView, focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop };
                viewGeneration += 1;
                cancelViewRequests();
                stopAuthorization();
                resetImages();
                if (viewCleanup) { var cleanup = viewCleanup; viewCleanup = null; cleanup(); }
            }
        } else if (foregroundRecovery && !playerClosing) {
            var recoverPlayer = foregroundRecovery; foregroundRecovery = null; recoverPlayer();
        } else if (suspendedView) {
            var previous = suspendedView; suspendedView = null;
            pendingRestore = previous;
            if (previous.restore) { previous.restore(); }
            else { addConnectForm("The app returned to the foreground. Restart pairing if needed."); }
        }
    });
    window.addEventListener("pagehide", function () {
        stopAuthorization();
        resetImages();
        if (viewCleanup) { viewCleanup(); viewCleanup = null; }
        if (player) { stopPlayer(function () {}); }
    });
    if (window.tizen && window.tizen.tvinputdevice) {
        try {
            ["MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop", "MediaFastForward", "MediaRewind"].forEach(function (name) {
                window.tizen.tvinputdevice.registerKey(name);
            });
            ["Tools", "Info"].forEach(function (name) {
                try { window.tizen.tvinputdevice.registerKey(name); } catch (ignore) { /* optional card-menu shortcut */ }
            });
        } catch (error) { setStatus("Some media keys could not be registered. Use on-screen playback controls.", true); }
    }
    addConnectForm("");
    if (preferenceError) { setStatus(preferenceError, true); }
    if (window.PlexSession) {
        try {
            var savedAccount = window.PlexSession.load(window.localStorage);
            if (savedAccount) {
                accountToken = savedAccount;
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles();
            }
        } catch (error) { setStatus(error.message, true); }
    }
}());
