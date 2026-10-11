(function () {
    "use strict";

    var screen = document.getElementById("screen");
    var status = document.getElementById("status");
    var currentClient = null;
    var currentServerId = "";
    var holdCard = null;
    var holdTimer = null;
    var currentSection = null;
    var homeSections = [];
    var currentItems = [];
    var currentOffset = 0;
    var viewGeneration = 0;
    var itemsLoading = false;
    var sectionLandingFocus = null;
    var authClient = null;
    var authPin = null;
    var authTimer = null;
    var authExpiryTimer = null;
    var authGeneration = 0;
    var accountToken = "";
    var accountClient = null;
    var activeProfile = null;
    var linkedProfile = null;
    var servers = [];
    var libraryFilters = {};
    var navigation = [];
    var restoreView = null;
    var retryView = null;
    var imageGeneration = 0;
    var imageQueue = [];
    var imageActive = 0;
    var imageUrls = [];
    var imageDecodes = [];
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
    var scrubTarget = null;
    var scrubRepeats = 0;
    var scrubTimer = null;
    var scrubOwner = null;
    var externalCues = null;
    var musicQueue = null;
    var musicLoading = false;
    var queueShuffle = false;
    var queueRepeat = "off";
    var viewCleanup = null;
    var viewClients = [];
    var suspendedView = null;
    var foregroundRecovery = null;
    var subtitleSearchGeneration = 0;
    var preferences = { quality: "1080", autoNext: false, language: "en", continueAction: "details",
        skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low", subtitleColor: "white",
        subtitleDelayMs: 0, directPlay: "auto" };
    var preferenceError = "";
    function directPlayProfile() {
        if (preferences.directPlay === "off" || !window.PlexCapabilities) { return null; }
        return window.PlexCapabilities.detect({ userAgent: navigator.userAgent,
            productinfo: window.webapis && window.webapis.productinfo });
    }
    function directPlaySummary() {
        if (preferences.directPlay === "off") { return translate("Direct play: {state}", { state: translate("Off") }); }
        var profile = directPlayProfile();
        if (!profile) { return translate("Direct play: {state}", { state: translate("Off") }); }
        if (profile.status === "unknown") { return translate("Unverified model. Plex will convert unverified formats."); }
        if (profile.status === "observed") { return translate("Observed video only: {model}. Audio, HDR and other formats remain unverified; Plex converts them.", { model: profile.model }); }
        return translate("Direct play: {state}", { state: translate("Auto") }) + " (" +
            profile.video.join("/").toUpperCase() + ", " + profile.audio.join("/").toUpperCase() + ", " +
            profile.maxWidth + "x" + profile.maxHeight + "). " + profile.evidence;
    }
    var pendingRestore = null;
    if (window.PlexPreferences) {
        try {
            preferences = window.PlexPreferences.load(window.localStorage);
            window.PlexI18n.setLanguage(preferences.language);
        } catch (error) { preferenceError = errorText(error); }
    }
    if (typeof window.Promise !== "function" || typeof window.fetch !== "function" ||
            typeof window.URL !== "function" || typeof window.Blob !== "function") {
        status.textContent = "This browser lacks required network or media APIs. Use a supported Samsung runtime.";
        status.className = "status status-error";
        return;
    }
    var buildLabel = document.querySelector(".app-header p");
    if (buildLabel) { buildLabel.textContent = translate("Samsung TV client development build"); }

    function translate(text, values) {
        if (window.PlexI18n) { return window.PlexI18n.text(text, values); }
        return String(text).replace(/\{([A-Za-z0-9]+)\}/g, function (match, key) {
            return values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
        });
    }

    function errorText(error) {
        return window.PlexI18n && window.PlexI18n.error ? window.PlexI18n.error(error) :
            translate(error && error.message || "Playback failed. Stop and retry.");
    }

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
        pendingRestore = null;
        if (restoreView) {
            var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
            navigation.push({ restore: restoreView, focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop });
            if (navigation.length > 20) { navigation.shift(); }
        }
        action();
    }

    function backView() {
        if (player) { stopPlayer(); return; }
        if (cancelServerConnection) { cancelServerConnection(); return; }
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
        imageDecodes.slice().forEach(function (cancel) { cancel(); });
        imageUrls.forEach(function (url) { window.URL.revokeObjectURL(url); });
        imageUrls = [];
    }

    function pumpImages() {
        while (imageActive < 3 && imageQueue.length) {
            (function (job) {
                imageActive += 1;
                var failure = "fetch";
                job.node.setAttribute("data-artwork-state", "fetching");
                Promise.resolve().then(function () { return job.client.image(job.path, job.size); }).then(function (blob) {
                    if (job.generation !== imageGeneration) { return; }
                    failure = "size";
                    if (blob.size > (job.maxBytes || 2 * 1024 * 1024)) { throw new Error("Artwork exceeds the image memory limit."); }
                    if (screen.contains && !screen.contains(job.node)) { return; }
                    failure = "decode";
                    job.node.setAttribute("data-artwork-state", "decoding");
                    return new Promise(function (resolve, reject) {
                        var url = window.URL.createObjectURL(blob);
                        imageUrls.push(url);
                        var complete = false;
                        var timer = setTimeout(function () { finish(new Error("Artwork decode timed out.")); }, 5000);
                        function cancel() { finish(); }
                        function finish(error, loaded) {
                            if (complete) { return; }
                            complete = true;
                            clearTimeout(timer);
                            job.node.onload = null;
                            job.node.onerror = null;
                            window.URL.revokeObjectURL(url);
                            imageUrls.splice(imageUrls.indexOf(url), 1);
                            imageDecodes.splice(imageDecodes.indexOf(cancel), 1);
                            if (error) { reject(error); }
                            else {
                                if (loaded && job.generation === imageGeneration) {
                                    job.node.setAttribute("data-artwork-state", "loaded");
                                    if (job.loaded) { job.loaded(); }
                                }
                                resolve();
                            }
                        }
                        imageDecodes.push(cancel);
                        job.node.onload = function () { finish(null, true); };
                        job.node.onerror = function () { finish(new Error("Artwork could not be decoded.")); };
                        job.node.src = url;
                    });
                }).catch(function () {
                    if (job.generation === imageGeneration) {
                        job.node.setAttribute("data-artwork-state", "unavailable");
                        job.node.setAttribute("data-artwork-error", failure);
                        job.node.alt = translate("Artwork unavailable");
                        job.node.src = placeholderArt();
                    }
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
                } else if (item.type === "season") {
                    openListing(item.parentTitle || item.title, function (offset) {
                        return client.getChildren(item.ratingKey, offset);
                    }, client);
                } else { openDetail(item.ratingKey, client); }
            });
        });
        node.className = "media-card";
        var seriesPoster = options.shelf && item.type === "episode" && (item.grandparentThumb || item.parentThumb);
        node.setAttribute("data-shape", !seriesPoster && ["episode", "clip", "photo"].indexOf(item.type) !== -1 ? "landscape" :
            ["artist", "album", "track"].indexOf(item.type) !== -1 ? "square" : "portrait");
        node.plexCard = { item: item, client: client, options: options };
        var image = element("img", "poster");
        image.alt = item.title || "Media";
        image.src = placeholderArt();
        node.appendChild(image);
        node.appendChild(element("span", "card-title", seriesPoster ? item.grandparentTitle || item.title :
            item.type === "season" && item.parentTitle ? item.parentTitle + " · " + item.title :
            item.title || item.tag || "Untitled"));
        var episodeNumber = item.type === "episode" && item.parentIndex !== undefined && item.index !== undefined ?
            "S" + item.parentIndex + " E" + item.index : "";
        var remaining = options.shelf && item.viewOffset && item.duration ?
            translate("{minutes} min left", { minutes: Math.max(1, Math.round((item.duration - item.viewOffset) / 60000)) }) : "";
        node.appendChild(element("span", "card-meta", item.type === "episode" ?
            [episodeNumber, item.title, remaining].filter(Boolean).join(" · ") : remaining || String(item.year || "")));
        if (item.viewCount) {
            var watchedMark = element("span", "card-watched", "✓");
            watchedMark.setAttribute("aria-label", translate("Watched"));
            node.appendChild(watchedMark);
        }
        if (item.viewOffset && item.duration) {
            var progress = element("span", "card-progress");
            var fill = element("span", "card-progress-fill");
            if (fill.style) { fill.style.width = Math.min(100, Math.max(0, item.viewOffset * 100 / item.duration)) + "%"; }
            progress.appendChild(fill);
            node.appendChild(progress);
        }
        var shape = node.getAttribute ? node.getAttribute("data-shape") : "portrait";
        queueImage(image, client, seriesPoster || item.thumb || item.art, shape === "landscape" ? { width: 480, height: 270 } :
            shape === "square" ? { width: 360, height: 360 } : { width: 240, height: 360 });
        return node;
    }

    function queueImage(node, client, path, size, maxBytes, loaded, first) {
        node.setAttribute("data-artwork-error", "");
        var unavailable = !path ? "metadata" :
            !client.image || !window.URL || !window.URL.createObjectURL ? "unsupported" :
            imageQueue.length >= 200 ? "capacity" : null;
        if (unavailable) {
            node.setAttribute("data-artwork-state", "unavailable");
            node.setAttribute("data-artwork-error", unavailable);
            return;
        }
        node.setAttribute("data-artwork-state", "queued");
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
            setStatus(translate("{message} {warning}", { message: translate("Your Plex session expired. Sign in again."),
                warning: deleted ? "" : translate("The saved session could not be deleted. Clear this app's data on the TV.") }), true);
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
        if (node === screen) {
            resetImages();
            setDetailMode(false);
            screen.className = "screen";
            screen.scrollTop = 0;
        }
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

    function page(title, kind) {
        screen.className = "screen screen-" + kind;
        screen.appendChild(element("h2", "page-title", title));
    }

    function group(parent, title, className) {
        var section = element("section", className || "menu-group");
        if (title) { section.appendChild(element("h3", "group-title", title)); }
        parent.appendChild(section);
        return section;
    }

    function placeholderArt() {
        return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='360'%3E%3Crect width='240' height='360' fill='%23222224'/%3E%3Cpath d='M94 156v48l48-24z' fill='%23787880'/%3E%3C/svg%3E";
    }

    function titleTile(parent, item, action, client, caption) {
        var node = button(parent, "", action);
        node.className = "title-tile";
        var art = element("img", "title-tile-art");
        art.alt = "";
        art.src = placeholderArt();
        node.appendChild(art);
        var copy = element("span", "title-tile-copy");
        copy.appendChild(element("span", "title-tile-title", item.title || item.tag || translate("Untitled")));
        if (caption) { copy.appendChild(element("span", "title-tile-caption", caption)); }
        node.appendChild(copy);
        if (client) { queueImage(art, client, item.thumb, { width: 240, height: 360 }); }
        return node;
    }

    function revealControl(node) {
        if (!node.getBoundingClientRect) { return; }
        var browse = screen.querySelector(".browse-header");
        if (browse && browse.contains(node)) { return; }
        if (screen.className.indexOf("screen-home") !== -1) {
            if (node.parentNode && /home-feature-actions/.test(node.parentNode.className || "")) {
                screen.className = "screen screen-home";
                screen.scrollTop = 0;
                return;
            }
            if (node.plexCard && node.parentNode && /shelf-row/.test(node.parentNode.className || "")) {
                var shelf = node.parentNode.parentNode;
                screen.scrollTop += shelf.getBoundingClientRect().top -
                    browse.getBoundingClientRect().bottom - 12;
                screen.className = "screen screen-home shelves-focused";
            }
        }
        var parent = node.parentNode;
        while (parent) {
            if (parent === screen || /(?:shelf-row|home-navigation|player-menu)/.test(parent.className || "")) {
                var item = node.getBoundingClientRect();
                var bounds = parent.getBoundingClientRect();
                var top = bounds.top + 8;
                var header = screen.querySelector(".browse-header");
                if (parent === screen && header && !header.contains(node)) {
                    top = Math.max(top, header.getBoundingClientRect().bottom + 12);
                }
                if (item.left < bounds.left + 8) { parent.scrollLeft -= bounds.left + 8 - item.left; }
                else if (item.right > bounds.right - 8) { parent.scrollLeft += item.right - bounds.right + 8; }
                if (item.top < top) { parent.scrollTop -= top - item.top; }
                else if (item.bottom > bounds.bottom - 8) { parent.scrollTop += item.bottom - bounds.bottom + 8; }
            }
            if (parent === screen) { break; }
            parent = parent.parentNode;
        }
    }

    function setStatus(message, isError) {
        var retry = Array.prototype.filter.call(screen.querySelectorAll("button"), function (control) {
            return /(?:^| )route-retry(?: |$)/.test(control.className);
        })[0];
        if (retry && retry.parentNode && !isError) { retry.parentNode.removeChild(retry); }
        if (isError && !player && retryView && !retry) {
            var retryAction = retryView;
            button(screen, "Retry", retryAction).className += " route-retry";
        }
        status.textContent = translate(message || "");
        status.className = isError ? "status status-error" : "status";
        if (isError && player) { showHud(); cancelHudTimer(); }
    }

    // A loading placeholder holds focus without consuming a pending Back restore, which belongs
    // to the controls the view renders once its data arrives.
    function focusLoading() {
        if (!pendingRestore) { focusFirst(); return; }
        var controls = screen.querySelectorAll("button, input, select");
        for (var i = 0; i < controls.length; i += 1) {
            if (!controls[i].disabled && !insideHidden(controls[i])) { controls[i].focus(); return; }
        }
    }

    function focusFirst() {
        var controls = screen.querySelectorAll("button, input, select");
        if (pendingRestore) {
            var previous = pendingRestore;
            pendingRestore = null;
            if (controls[previous.focus] && !controls[previous.focus].disabled && !insideHidden(controls[previous.focus])) {
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
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                var storageWarning = "";
                if (window.PlexSession) {
                    try {
                        if (window.PlexSession.enabled(window.localStorage)) {
                            window.PlexSession.save(window.localStorage, accountToken);
                        }
                    }
                    catch (error) { storageWarning = translate("Could not save sign-in. Check app storage permissions."); }
                }
                openProfiles(storageWarning);
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
            /^Live TV/.test(label) ? "television" :
            /^Refresh$/.test(label) ? "refresh" :
            /^More$/.test(label) ? "more" : "none");
        var node = element("button", "secondary-button menu-control menu-icon-" + icon,
            literal ? label : translate(label));
        node.type = "button";
        node.addEventListener("click", action);
        node.addEventListener("focus", function () { revealControl(node); });
        parent.appendChild(node);
        return node;
    }

    function openProfiles(warning) {
        restoreView = function () { openProfiles(); };
        retryView = restoreView;
        stopAuthorization();
        var generation = ++viewGeneration;
        clear(screen);
        page(translate("Who is watching?"), "profiles");
        if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
        setStatus("Loading Plex Home profiles...");
        accountClient.getProfiles().then(function (profiles) {
            if (generation !== viewGeneration) { return; }
            var identities = group(screen, "", "identity-list");
            profiles.forEach(function (profile) {
                if (profile.admin) { linkedProfile = profile; }
                var identity = button(identities, profile.title || profile.username || "Profile", function () {
                    retryView = null;
                    var selection = ++viewGeneration;
                    clear(screen);
                    page(profile.title || "Profile", "profile-pin");
                    var pin = element("input", "remote-input");
                    pin.type = "password";
                    pin.maxLength = 4;
                    pin.setAttribute("inputmode", "numeric");
                    pin.setAttribute("aria-label", translate("Profile PIN"));
                    if (profile.protected) { screen.appendChild(pin); }
                    var retryProfile = null;
                    function selectProfile() {
                        if (profile.protected && !/^[0-9]{4}$/.test(pin.value)) {
                            setStatus("Enter the four-digit profile PIN.", true);
                            return;
                        }
                        var request = ++selection;
                        var generation = viewGeneration;
                        setStatus("Switching profile...");
                        if (retryProfile) { retryProfile.disabled = true; }
                        accountClient.switchProfile(profile.uuid, profile.protected ? pin.value : "")
                            .then(function (token) {
                                pin.value = "";
                                if (generation !== viewGeneration || request !== selection) { return; }
                                activeProfile = profile;
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
                                            setStatus(errorText(sessionError), true);
                                        }
                                    });
                                } else {
                                    setStatus(errorText(error), true);
                                    if (!profile.protected) {
                                        if (!retryProfile) { retryProfile = button(screen, "Retry", selectProfile); }
                                        retryProfile.disabled = false;
                                        retryProfile.focus();
                                    }
                                }
                            });
                    }
                    if (profile.protected) { button(screen, "Use this profile", selectProfile); }
                    button(screen, "Back to profiles", openProfiles);
                    focusFirst();
                    if (!profile.protected) { selectProfile(); }
                }, true);
                identity.className = "identity-choice";
                identity.setAttribute("data-initial", (profile.title || profile.username || "P").slice(0, 1).toUpperCase());
                if (profile.protected) { identity.setAttribute("data-protected", "true"); }
                profileAvatar(identity, profile, accountClient);
            });
            var actions = group(screen, "", "page-actions");
            button(actions, "Use linked account", function () { activeProfile = linkedProfile; openServers(); });
            button(actions, "Sign out", signOut);
            if (typeof warning === "string" && warning) { setStatus(warning, true); }
            else { setStatus("Select the Plex identity to use. Protected profiles require their PIN."); }
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            button(screen, "Retry profiles", openProfiles);
            button(screen, "Use linked account", openServers);
            button(screen, "Sign out", signOut);
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function signOut() {
        var storageError = false;
        if (window.PlexSession) {
            try { window.PlexSession.forget(window.localStorage); }
            catch (error) { storageError = true; }
        }
        if (window.PlexRecents && !window.PlexRecents.reset(window.localStorage)) { storageError = true; }
        stopAuthorization();
        accountToken = "";
        accountClient = null;
        activeProfile = null;
        linkedProfile = null;
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

    var cancelServerConnection = null;
    function openServers(warning) {
        restoreView = function () { openServers(); };
        retryView = restoreView;
        cancelServerConnection = null;
        var generation = ++viewGeneration;
        clear(screen);
        page(translate("Choose a server"), "servers");
        if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
        setStatus("Discovering your Plex Media Servers...");
        accountClient.getServers().then(function (result) {
            if (generation !== viewGeneration) { return; }
            servers = result;
            if (!servers.length) {
                screen.appendChild(element("p", "empty-state", translate("No Plex servers are shared with this identity.")));
            }
            var serverList = group(screen, "", "server-list");
            servers.forEach(function (server) {
                var unavailable = !server.token || !server.connections.length;
                var relayOnly = server.connections.length && server.connections.every(function (connection) {
                    return connection.relay === true;
                });
                var serverButton = button(serverList, translate("{server} ({ownership}){availability}", { server: server.name,
                    ownership: translate(server.owned ? "owned" : "shared"),
                    availability: unavailable ? translate(" — unavailable") : relayOnly ? translate(" — relay") : "" }), function () {
                    var selection = ++viewGeneration;
                    currentClient = null;
                    Array.prototype.forEach.call(serverList.querySelectorAll(".server-choice"), function (choice) {
                        choice.disabled = true;
                    });
                    var cancelButton = button(screen, "Cancel connection", function () {
                        if (selection !== viewGeneration) { return; }
                        openServers();
                    });
                    cancelServerConnection = function () { cancelButton.click(); };
                    viewCleanup = function () { cancelServerConnection = null; };
                    cancelButton.focus();
                    setStatus("Connecting securely; trying relay if needed...");
                    window.PlexApi.selectServer(server, { onAttempt: function (attempt) {
                        if (selection !== viewGeneration) { return; }
                        setStatus(translate("Trying secure connection {index} of {total} ({kind})…", {
                            index: attempt.index, total: attempt.total,
                            kind: translate(attempt.relay ? "Relay" : "Direct")
                        }));
                    }, onClient: function (client) {
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
                        cancelServerConnection = null;
                        if (cancelButton.parentNode) { cancelButton.parentNode.removeChild(cancelButton); }
                        Array.prototype.forEach.call(serverList.querySelectorAll(".server-choice"), function (choice, index) {
                            choice.disabled = !servers[index].token || !servers[index].connections.length;
                        });
                        if (!recoverSession(error)) { setStatus(errorText(error), true); }
                        focusFirst();
                    });
                }, true);
                serverButton.disabled = unavailable;
                serverButton.className += " server-choice";
            });
            var actions = group(screen, "", "page-actions");
            button(actions, "Change profile", function () {
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles();
            });
            button(actions, "Refresh servers", openServers);
            button(actions, "Settings", function () {
                restoreView = openServers;
                visit(openSettings);
            });
            button(actions, "Sign out", signOut);
            setStatus("Owned and shared servers use their own access grants. Only secure advertised origins are tried.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            button(screen, "Retry discovery", openServers);
            button(screen, "Settings", function () {
                restoreView = openServers;
                visit(openSettings);
            });
            button(screen, "Sign out", signOut);
            setStatus(errorText(error), true);
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
            info.textContent = errorText(error);
            setStatus(errorText(error), true);
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
        retryView = null;
        stopAuthorization();
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        currentClient = null;
        currentSection = null;
        screen.className = "screen screen-signin";
        var section = element("section", "connect-panel");
        section.appendChild(element("h2", "auth-title", translate("Sign in to Plex")));

        var authInfo = element("div", "auth-info");
        section.appendChild(authInfo);

        var actions = element("div", "auth-actions");
        var signIn = element("button", "secondary-button", translate("Get a new code"));
        signIn.type = "button";
        signIn.addEventListener("click", function () { beginAuthorization(authInfo); });
        actions.appendChild(signIn);
        var advancedToggle = element("button", "secondary-button", translate("Connect to a server directly"));
        advancedToggle.type = "button";
        actions.appendChild(advancedToggle);
        section.appendChild(actions);

        var advanced = element("div", "advanced-panel");
        advanced.hidden = true;
        var form = element("form", "connect-form");
        var serverLabel = element("label", "", translate("Server URL"));
        var serverInput = element("input", "remote-input");
        serverInput.type = "url";
        serverInput.name = "server";
        serverInput.placeholder = "https://192.168.1.10:32400";
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
            addConnectForm(errorText(error));
            setStatus(errorText(error), true);
            return;
        }

        loadHome(true);
    }

    function playFromCard(item, client, resume) {
        setStatus("Loading details...");
        var generation = viewGeneration;
        window.PlexItemMenu.playTarget(item, client).then(function (target) {
            if (generation !== viewGeneration || player) { return null; }
            return client.getMetadata(target.ratingKey);
        }).then(function (metadata) {
            if (!metadata) { return; }
            if (generation !== viewGeneration || player) { return; }
            startPlayer(metadata, client, resume ? metadata.viewOffset || 0 : 0);
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
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
        retryView = restoreView;
        page(translate("Favorite libraries"), "favorites");
        setStatus("Loading libraries...");
        currentClient.getSections().then(function (sections) {
            if (generation !== viewGeneration) { return; }
            sections = sections.filter(function (section) {
                return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
            });
            if (!sections.length) {
                screen.appendChild(element("p", "empty-state", translate("No available libraries.")));
                button(screen, "Back", backView); setStatus("No available libraries."); focusFirst(); return;
            }
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
            var choices = group(screen, "", "selection-list");
            sections.forEach(function (section) {
                var key = String(section.key);
                var toggle = button(choices, "", function () {
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
                } catch (error) { setStatus(error.message === "Keep at least one library." ? errorText(error) :
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
            setStatus(errorText(error), true);
            button(screen, "Back", backView);
            focusFirst();
        });
    }

    function loadHome(showConnectOnError) {
        restoreView = function () { loadHome(showConnectOnError); };
        retryView = restoreView;
        var generation = ++viewGeneration;
        cancelViewRequests();
        itemsLoading = false;
        setStatus("Loading...");
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
                addConnectForm(errorText(error));
            }
            setStatus(errorText(error), true);
            if (!document.getElementById("home-retry")) {
                button(screen, "Retry", function () { loadHome(showConnectOnError); }).id = "home-retry";
            }
            focusFirst();
        });
    }

    function renderHome(sections, hubs) {
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        resetImages();
        restoreView = function () { loadHome(false); };
        currentSection = null;
        homeSections = sections;
        screen.className = "screen screen-home";
        browseHeader(null);
        var homeTitle = element("h2", "page-title home-title", translate("Home"));
        screen.appendChild(homeTitle);
        var favorites = favoriteKeys();
        var browsable = sections.filter(function (section) {
            return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
        });
        var visibleHubs = hubs.filter(function (hub) {
            return !favorites || hub.librarySectionID === undefined ||
                favorites.indexOf(String(hub.librarySectionID)) !== -1;
        });
        var features = [];
        var seen = {};
        visibleHubs.forEach(function (hub) {
            (hub.Metadata || []).forEach(function (item) {
                if (features.length < 8 && item.ratingKey && !seen[item.ratingKey] &&
                        ["movie", "show", "episode"].indexOf(item.type) !== -1) {
                    seen[item.ratingKey] = true;
                    features.push(item);
                }
            });
        });
        if (features.length) {
            var featuredIndex = 0;
            var featured = features[0];
            var hero = element("section", "home-hero");
            var art = element("img", "home-hero-art");
            art.alt = "";
            hero.appendChild(art);
            hero.appendChild(element("div", "home-hero-scrim"));
            var copy = element("div", "home-hero-copy");
            var title = element("h3", "home-hero-title");
            var meta = element("p", "home-hero-meta");
            var description = element("p", "home-hero-description");
            copy.appendChild(title);
            copy.appendChild(meta);
            copy.appendChild(description);
            var actions = element("div", "home-feature-actions");
            var primary = button(actions, "", function () {
                if (["movie", "episode", "clip"].indexOf(featured.type) !== -1) {
                    playFromCard(featured, currentClient, true);
                } else { visit(function () { openDetail(featured.ratingKey, currentClient); }); }
            }, true, "play");
            primary.className += " home-feature-primary";
            var info = button(actions, "Open details", function () {
                visit(function () { openDetail(featured.ratingKey, currentClient); });
            }, false, "info");
            info.className += " round-control";
            info.setAttribute("aria-label", translate("Open details"));
            if (features.length > 1) {
                var next = button(actions, "Next featured title", function () {
                    featuredIndex = (featuredIndex + 1) % features.length;
                    updateFeature();
                }, false, "next");
                next.className += " round-control";
                next.setAttribute("aria-label", translate("Next featured title"));
            }
            copy.appendChild(actions);
            hero.appendChild(copy);
            var dots = element("div", "home-feature-dots");
            dots.setAttribute("aria-hidden", "true");
            features.forEach(function () { dots.appendChild(element("span", "feature-dot")); });
            hero.appendChild(dots);
            function updateFeature() {
                featured = features[featuredIndex];
                title.textContent = featured.grandparentTitle || featured.title;
                meta.textContent = [translate(featured.type === "episode" || featured.type === "show" ? "TV Shows" : "Movie"),
                    featured.year, featured.contentRating].filter(Boolean).join(" · ");
                description.textContent = featured.summary || "";
                primary.textContent = translate(["movie", "episode", "clip"].indexOf(featured.type) !== -1 ?
                    featured.viewOffset ? "Continue" : "Play" : "Open details");
                var nextArt = element("img", "home-hero-art");
                nextArt.alt = "";
                hero.replaceChild(nextArt, art);
                art = nextArt;
                queueImage(art, currentClient, featured.art || featured.grandparentArt || featured.thumb,
                    { width: 1280, height: 720 }, 4 * 1024 * 1024, null, true);
                Array.prototype.forEach.call(dots.children, function (dot, index) {
                    dot.className = "feature-dot" + (index === featuredIndex ? " selected" : "");
                });
            }
            updateFeature();
            screen.appendChild(hero);
        }

        if (!browsable.length) {
            var sectionPanel = element("section", "content-panel");
            addSectionHeading(sectionPanel, translate("Libraries"));
            sectionPanel.appendChild(element("p", "empty-state", translate("No libraries were returned by this server.")));
            screen.appendChild(sectionPanel);
        }

        var hubPanel = element("section", "content-panel home-shelves");
        hubPanel.setAttribute("aria-label", translate("Plex shelves"));
        if (!visibleHubs.length) {
            hubPanel.appendChild(element("p", "empty-state", translate("No Home shelves were returned.")));
        }
        visibleHubs.forEach(function (hub) {
            var deck = !!(window.PlexItemMenu && window.PlexItemMenu.isDeckHub(hub));
            var hubSection = element("section", "shelf");
            hubSection.appendChild(element("h3", "hub-title", hub.title || "Plex shelf"));
            var row = element("div", "shelf-row");
            hubSection.appendChild(row);
            var metadata = Array.isArray(hub.Metadata) ? hub.Metadata : [];
            metadata.slice(0, 12).forEach(function (item) {
                if (item.ratingKey) { card(row, item, currentClient, null, { deck: deck, shelf: true }); }
            });
            hubPanel.appendChild(hubSection);
        });
        screen.appendChild(hubPanel);
        setStatus(usingRelay ? "Connected through Plex relay (bandwidth limited)." : "");
        var restoringFocus = !!pendingRestore;
        focusFirst();
        if (!restoringFocus && document.activeElement === screen.querySelector(".account-control")) {
            screen.querySelector(".home-navigation button").focus();
        }
    }

    function browseHeader(selected) {
        setDetailMode(true);
        var header = element("header", "browse-header");
        var account = button(header, "Account", function () {
            var utilities = screen.querySelector(".home-utilities");
            utilities.hidden = !utilities.hidden;
            if (!utilities.hidden) { utilities.querySelector("button").focus(); }
        }, false, "profile");
        account.className += " account-control round-control";
        account.setAttribute("aria-label", translate("Account"));
        profileAvatar(account, activeProfile || linkedProfile, currentClient);
        var nav = element("nav", "home-navigation");
        nav.setAttribute("aria-label", translate("Home"));
        var home = button(nav, "Home", function () { navigation = []; loadHome(false); }, false, "home");
        if (!selected) { home.setAttribute("aria-current", "page"); }
        var favorites = favoriteKeys();
        var browsable = homeSections.filter(function (section) {
            return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
        });
        (window.PlexFavorites ? window.PlexFavorites.filter(browsable, favorites) : browsable).forEach(function (section) {
            var choice = button(nav, section.title || "Untitled library", function () {
                visit(function () { openSection(section); });
            }, true, "library");
            choice.className += " library-button";
            if (selected && String(selected.key) === String(section.key)) { choice.setAttribute("aria-current", "page"); }
        });
        button(nav, "Search", function () { visit(openSearch); });
        header.appendChild(nav);
        screen.appendChild(header);
        var utilities = element("div", "home-utilities");
        button(utilities, "Settings", function () { visit(openSettings); });
        button(utilities, "Refresh", function () {
            if (selected) { openSection(selected); } else { loadHome(false); }
        }, false, "refresh");
        button(utilities, "Live TV and DVR", function () { visit(openTelevision); }, false, "television");
        if (accountClient) { button(utilities, "Watchlist", function () { visit(function () { catalogueUi().watchlist(); }); }); }
        if (accountClient) { button(utilities, "Plex catalogue", function () { visit(function () { catalogueUi().search(); }); }); }
        button(utilities, "Change server", function () {
            currentClient = null;
            currentServerId = "";
            if (accountClient) { openServers(); } else { addConnectForm(""); }
        });
        utilities.hidden = true;
        screen.appendChild(utilities);
    }

    function profileAvatar(parent, profile, client) {
        if (!profile || !profile.thumb) { return; }
        var image = element("img", "profile-avatar");
        image.alt = "";
        parent.appendChild(image);
        queueImage(image, client, profile.thumb, { width: 168, height: 168 }, 256 * 1024, function () {
            parent.setAttribute("data-avatar", "true");
        });
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
        retryView = function () { loadNextPage(); };
        page(section.title || "Library", "library");
        browseHeader(section);
        var toolbar = group(screen, "", "page-toolbar");
        button(toolbar, "Sort and filters", function () { visit(function () { openBrowseOptions(section); }); });
        button(toolbar, "A-Z", function () { visit(function () { openLetters(section); }); });
        button(toolbar, "Collections", function () {
            visit(function () {
                openListing("Collections", function (offset) { return currentClient.getCollections(section.key, offset); }, currentClient);
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
        var restoringFocus = !!pendingRestore;
        focusFirst();
        sectionLandingFocus = null;
        if (!restoringFocus && document.activeElement === screen.querySelector(".account-control")) {
            // Hold focus on this library's tab while titles load, then hand it to the first title.
            sectionLandingFocus = screen.querySelector('.home-navigation button[aria-current="page"]') ||
                screen.querySelector(".page-toolbar button");
            sectionLandingFocus.focus();
        }
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
            var focused = document.activeElement;
            var focusedKey = focused && focused.plexCard ? String(focused.plexCard.item.ratingKey) : null;
            clear(list);
            resetImages();
            var restored = null;
            currentItems.forEach(function (item) {
                var control = card(list, item, currentClient, currentItems);
                if (focusedKey === String(item.ratingKey)) { restored = control; }
            });
            if (focusedKey) {
                (restored || list.querySelector("button") || document.getElementById("home-back")).focus();
            } else if (sectionLandingFocus && document.activeElement === sectionLandingFocus && list.querySelector("button")) {
                list.querySelector("button").focus();
            }
            sectionLandingFocus = null;
            if (!currentItems.length) { list.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            var loadMore = document.getElementById("load-more");
            loadMore.disabled = currentOffset >= page.totalSize || page.items.length === 0;
            if (loadMore.disabled && document.activeElement === loadMore) {
                document.getElementById("home-back").focus();
            }
            setStatus(translate("{loaded} of {total} items loaded. Showing the latest {shown}.", { loaded: currentOffset, total: page.totalSize, shown: currentItems.length }));
        }).catch(function (error) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            if (accountClient && recoverSession(error)) { return; }
            setStatus(errorText(error), true);
        });
    }

    function openListing(title, loader, client, offset, retained, cached) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        retryView = function () { openListing(title, loader, client, offset, retained); };
        page(title, "listing");
        setStatus("Loading...");
        offset = offset || 0;
        retained = retained || [];
        (cached ? Promise.resolve(cached) : loader(offset)).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var items = retained.concat(container.Metadata || []).slice(-200);
            restoreView = function () {
                openListing(title, loader, client, offset, retained, container);
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
            setStatus(translate("{count} items shown.", { count: items.length }));
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry", function () { openListing(title, loader, client, offset, retained); });
            button(screen, "Back", backView);
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function openBrowseOptions(section) {
        var generation = ++viewGeneration;
        restoreView = function () { openBrowseOptions(section); };
        retryView = restoreView;
        var selected = JSON.parse(JSON.stringify(libraryFilters));
        clear(screen);
        page(translate("Sort and filters"), "filters");
        var quick = group(screen, "", "page-toolbar");
        button(quick, "All titles", function () { libraryFilters = {}; openSection(section); }, false, "library");
        button(quick, "Unwatched", function () {
            var filters = {};
            filters[section.type === "show" ? "unwatchedLeaves" : "unwatched"] = 1;
            openSection(section, { items: [], offset: 0, filters: filters });
            loadNextPage();
        }, false, "check");
        button(quick, "Recently added", function () {
            openSection(section, { items: [], offset: 0, filters: { sort: "addedAt:desc" } });
            loadNextPage();
        }, false, "clock");
        button(screen, "Back", backView);
        setStatus("Loading this server's supported filters and sorts...");
        currentClient.getBrowseMenus(section.key, section.type === "show" ? 2 : section.type === "artist" ? 8 :
            section.type === "photo" ? 13 : 1).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var types = container.Meta && container.Meta.Type || [];
            var type = types.filter(function (entry) { return entry.active; })[0] || types[0] || {};
            var sorting = group(screen, translate("Sort"), "selection-list");
            (type.Sort || []).forEach(function (sort) {
                ["asc", "desc"].forEach(function (direction) {
                    var choice = button(sorting, translate(sort.title || sort.key) + " / " +
                        translate(direction === "asc" ? "Ascending" : "Descending"), function () {
                        selected.sort = direction === "desc" && sort.descKey ? sort.descKey : sort.key + ":" + direction;
                        openSection(section, { items: [], offset: 0, filters: selected });
                        loadNextPage();
                    }, true, "sort-" + direction);
                    var sortKey = direction === "desc" && sort.descKey ? sort.descKey : sort.key + ":" + direction;
                    choice.setAttribute("aria-pressed", selected.sort === sortKey ? "true" : "false");
                });
            });
            var filtering = group(screen, translate("Filters"), "selection-list");
            (type.Filter || []).forEach(function (filter) {
                if (!filter.key || !filter.filter) { return; }
                button(filtering, filter.title || filter.filter, function () {
                    visit(function () {
                        var filterGeneration = ++viewGeneration;
                        clear(screen);
                        page(filter.title || "Filter", "filter-values");
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
                            setStatus(errorText(error), true);
                            button(screen, "Back", backView);
                            focusFirst();
                        });
                    });
                });
            });
            setStatus("Filter and sort choices come from the selected server.");
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        });
        focusFirst();
    }

    function openLetters(section) {
        var generation = ++viewGeneration;
        restoreView = function () { openLetters(section); };
        retryView = restoreView;
        clear(screen);
        page(translate("Jump to a letter"), "alphabet");
        button(screen, "Back", backView);
        setStatus("Loading the server's alphabet index...");
        currentClient.getLetters(section.key).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var offset = 0;
            var letters = group(screen, "", "alphabet-list");
            (container.Directory || []).forEach(function (letter) {
                var start = offset;
                button(letters, letter.title || letter.key, function () {
                    openSection(section, { items: [], offset: start, filters: { sort: "titleSort:asc" } });
                    loadNextPage();
                });
                offset += Number(letter.size) || 0;
            });
            if (!(container.Directory || []).length) { letters.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            setStatus("Select a letter to jump within title order.");
            focusFirst();
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        });
    }

    function openSearch(savedQuery) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        page(translate("Search your servers"), "search");
        var input = element("input", "remote-input");
        input.type = "search";
        input.maxLength = 200;
        input.value = typeof savedQuery === "string" ? savedQuery : "";
        input.setAttribute("aria-label", "Search movies and television");
        screen.appendChild(input);
        var recents = element("section", "search-recents");
        var results = element("div", "search-results");
        function recentProfile() {
            var profile = activeProfile || linkedProfile;
            return profile && profile.uuid ? String(profile.uuid) : "default";
        }
        function renderRecents() {
            clear(recents);
            var terms = window.PlexRecents && !input.value.trim() ?
                window.PlexRecents.load(window.localStorage, recentProfile()) : [];
            recents.hidden = !terms.length;
            if (!terms.length) { return; }
            recents.appendChild(element("h3", "", translate("RECENT SEARCHES")));
            terms.forEach(function (term) {
                button(recents, term, function () { input.value = term; search(); }, true, "search");
            });
            button(recents, "Clear recent searches", function () {
                window.PlexRecents.clear(window.localStorage, recentProfile());
                renderRecents();
                input.focus();
            });
        }
        function search() {
            var query = input.value.trim();
            if (!query) { setStatus("Enter a title to search.", true); input.focus(); return; }
            if (window.PlexRecents) { window.PlexRecents.remember(window.localStorage, recentProfile(), query); }
            recents.hidden = true;
            var searchGeneration = ++viewGeneration;
            cancelViewRequests();
            clear(results);
            resetImages();
            restoreView = function () { openSearch(query); };
            retryView = restoreView;
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
                                        var people = element("section", "people-results");
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
                                    var row = element("div", "shelf-row");
                                    shelf.appendChild(row);
                                    items.slice(0, Math.max(0, Math.min(50, 200 - shown))).forEach(function (item) {
                                        card(row, item, client); shown += 1;
                                    });
                                    results.appendChild(shelf);
                                });
                            });
                        }).catch(function (error) {
                            failures += 1;
                            if (searchGeneration === viewGeneration) {
                                results.appendChild(element("p", "inline-error", errorText(error)));
                            }
                        }).then(function () {
                            active -= 1;
                            finished += 1;
                            if (searchGeneration !== viewGeneration) { return; }
                            if (finished === targets.length) {
                                if (!shown && !failures) { results.appendChild(element("p", "empty-state", translate("No matching media found."))); }
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
        screen.appendChild(recents);
        screen.appendChild(results);
        input.addEventListener("keydown", function (event) {
            if (event.keyCode === 13) { event.preventDefault(); search(); }
        });
        input.addEventListener("input", function () { if (!input.value.trim()) { clear(results); } renderRecents(); });
        restoreView = function () { openSearch(input.value); };
        renderRecents();
        setStatus("");
        focusFirst();
        if (typeof savedQuery === "string" && savedQuery) { search(); }
    }

    function openDetail(id, client) {
        retryView = function () { openDetail(id, client); };
        restoreView = retryView;
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        button(screen, "Back", backView);
        setStatus("Loading details...");
        focusLoading();
        client.getMetadata(id).then(function (item) {
            if (generation !== viewGeneration) { return; }
            if (!item) { throw new Error("This item is no longer on the server."); }
            renderDetail(item, client);
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry details", function () { openDetail(id, client); });
            setStatus(errorText(error), true);
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
        screen.className = "screen screen-detail";
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
        if (["artist", "album", "track", "photoalbum", "collection"].indexOf(item.type) !== -1) {
            hero.className += " detail-hero-with-cover";
            var cover = element("img", "detail-cover");
            cover.alt = "";
            cover.src = placeholderArt();
            hero.appendChild(cover);
            queueImage(cover, client, item.thumb, { width: 480, height: 480 });
        }
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

        var synopsis = element("p", "synopsis detail-synopsis", item.summary || translate("No synopsis is available."));
        main.appendChild(synopsis);
        if (item.summary) {
            var expand = button(main, "Read more", function () {
                var expanded = synopsis.className.indexOf(" expanded") === -1;
                synopsis.className = "synopsis detail-synopsis" + (expanded ? " expanded" : "");
                expand.textContent = translate(expanded ? "Read less" : "Read more");
                expand.setAttribute("aria-expanded", String(expanded));
                revealControl(expand);
            });
            expand.className = "detail-expand";
            expand.setAttribute("aria-expanded", "false");
        }

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
        var more = element("div", "detail-more detail-overflow");
        more.hidden = true;
        var fileInfoRows = window.PlexFileInfo ? window.PlexFileInfo.rows(item) : [];
        var fileInfo = null;
        if (fileInfoRows.length) {
            fileInfo = element("section", "file-info-panel");
            fileInfo.hidden = true;
            fileInfo.setAttribute("role", "dialog");
            fileInfo.setAttribute("aria-modal", "true");
            fileInfo.setAttribute("aria-label", translate("File information"));
            fileInfo.appendChild(element("h2", "", translate("File information")));
            fileInfoRows.forEach(function (row) {
                var fact = element("p", "file-info-row");
                var context = translate("Version {number}", { number: row.version });
                if (row.part) { context += " / " + translate("Part {number}", { number: row.part }); }
                if (row.trackType) {
                    context += " / " + translate(row.trackType) + " " + row.track;
                }
                fact.appendChild(element("span", "file-info-label", context + " / " + translate(row.label) + ": "));
                fact.appendChild(element("span", "file-info-value", row.value));
                fileInfo.appendChild(fact);
            });
            var closeFileInfo = button(fileInfo, "Close menu", function () {
                fileInfo.hidden = true;
                moreButton.focus();
            });
            detailAction(more, "File information", "info", function () {
                fileInfo.hidden = false;
                more.hidden = true;
                moreButton.setAttribute("aria-expanded", "false");
                closeFileInfo.focus();
            });
        }
        var onDeck = item.OnDeck && item.OnDeck.Metadata;
        if (Array.isArray(onDeck)) { onDeck = onDeck[0]; }
        if (item.type === "show" && onDeck && onDeck.type === "episode" && onDeck.ratingKey) {
            var nextEpisode = onDeck;
            detailAction(actions, nextEpisode.viewOffset ? "Resume" : "Play next episode", "play", function () {
                playFromCard(nextEpisode, client, true);
            }).className = "detail-pill detail-primary detail-pill-play";
            if (nextEpisode.viewOffset) {
                detailAction(actions, "Play from beginning", "restart", function () { playFromCard(nextEpisode, client, false); });
            }
        }
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
            if (item.type !== "album" && !(item.type === "show" && nextEpisode)) {
                children.className = "detail-pill detail-primary detail-pill-list";
            }
        }
        if (["movie", "episode", "show", "season"].indexOf(item.type) !== -1) {
            detailAction(more, "Mark watched", "watched", function () { confirmWatchAction(item, client, "watched"); });
            detailAction(more, "Mark unwatched", "unwatched", function () { confirmWatchAction(item, client, "unwatched"); });
        }
        var trailer = window.PlexItemMenu && window.PlexItemMenu.trailerFor(item);
        if (trailer) {
            detailAction(more, "Play trailer", "play", function () { playFromCard(trailer, client, false); });
        }
        var plexGuid = /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(item.guid || "") ? item.guid :
            (item.Guid || []).filter(function (guid) { return /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(guid.id || ""); })[0];
        if (plexGuid && accountClient) {
            var guid = typeof plexGuid === "string" ? plexGuid : plexGuid.id;
            detailAction(more, "Add to Watchlist", "add", function () {
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
        var moreButton = detailAction(actions, "More", "more", function () {
            more.hidden = !more.hidden;
            moreButton.setAttribute("aria-expanded", String(!more.hidden));
            if (!more.hidden) { more.querySelector("button").focus(); }
        });
        moreButton.className += " round-control";
        moreButton.setAttribute("aria-label", translate("More"));
        moreButton.setAttribute("aria-expanded", "false");
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
        if (fileInfo) { screen.appendChild(fileInfo); }

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
            var extrasRow = element("div", "shelf-row");
            shelf.appendChild(extrasRow);
            extras.slice(0, 20).forEach(function (extra) { card(extrasRow, extra, client); });
            screen.appendChild(shelf);
        }
        setStatus("Choose Play or Resume to start playback. Browsing does not update watch history.");
        var restoringFocus = !!pendingRestore;
        focusFirst();
        if (playable && !restoringFocus) { primary.focus(); }
    }

    function confirmWatchAction(item, client, action) {
        visit(function () {
            var generation = ++viewGeneration;
            clear(screen);
            var label = action === "remove" ? "Remove from Continue Watching" :
                action === "watched" ? "Mark watched" : "Mark unwatched";
            page(label, "confirmation");
            screen.appendChild(element("p", "synopsis", item.title || "Selected item"));
            screen.appendChild(element("p", "help-text", action === "remove" ?
                "Hide this item from Continue Watching without clearing its resume position." :
                action === "unwatched" ? "This clears watched status and the saved resume position on Plex." :
                    "This changes watched status on Plex."));
            if (item.type === "show" || item.type === "season") {
                screen.appendChild(element("p", "help-text", translate("This changes every episode in this show or season.")));
            }
            var pending = false;
            var confirm = button(screen, translate(action === "remove" ? "Confirm remove from continue watching" :
                action === "unwatched" ? "Confirm mark unwatched" : "Confirm mark watched"), function () {
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
                    setStatus(translate("{message} {warning}", { message: translate("Plex did not confirm the change. Check the server state before retrying."), warning: errorText(error) }), true);
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

    function openPerson(person, client, careerStart) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        restoreView = function () { openPerson(person, client, careerStart); };
        retryView = restoreView;
        page(person.tag || "Person", "person");
        var portrait = element("img", "person-portrait");
        portrait.alt = "";
        portrait.src = placeholderArt();
        screen.appendChild(portrait);
        queueImage(portrait, client, person.thumb, { width: 360, height: 360 });
        if (person.role) { screen.appendChild(element("p", "detail-meta", person.role)); }
        button(screen, "Titles in this server", function () {
            visit(function () {
                openListing(person.tag || "Person", function (offset) {
                    return client.getPerson(null, person.id, offset);
                }, client);
            });
        });
        button(screen, "Back", backView);
        setStatus(accountClient && person.tagKey ? "Loading..." : "Person biography and catalogue credits require a linked Plex account.");
        if (accountClient && person.tagKey) {
            accountClient.personProfile(person.tagKey).then(function (container) {
                if (generation !== viewGeneration) { return; }
                var profile = (container.Metadata || [])[0] || {};
                screen.appendChild(element("p", "synopsis", profile.summary || "No biography supplied by Plex."));
                if (profile.bornAt) {
                    screen.appendChild(element("p", "detail-meta", profile.bornAt + (profile.birthPlace ? " / " + profile.birthPlace : "")));
                }
            }).catch(function (error) {
                if (generation === viewGeneration) { setStatus(errorText(error), true); focusFirst(); }
            });
            var localIndex = client.personLibraryIndex(person.id).catch(function () { return null; });
            Promise.all([accountClient.personCredits(person.tagKey), localIndex]).then(function (results) {
                var groups = results[0];
                var local = results[1];
                if (generation !== viewGeneration) { return; }
                var allCredits = [];
                var held = 0;
                groups.forEach(function (group) {
                    (group.Credit || []).forEach(function (credit) {
                        if (credit.Metadata) { allCredits.push({ group: group.title, credit: credit }); }
                    });
                });
                var career = element("section", "career-pages");
                screen.appendChild(career);
                function renderCareer(start) {
                    careerStart = start;
                    clear(career);
                    held = 0;
                    var credits;
                    var groupName;
                    allCredits.slice(start, start + 50).forEach(function (entry) {
                        var credit = entry.credit;
                        var title = credit.Metadata;
                        if (!credits || groupName !== entry.group) {
                            groupName = entry.group;
                            credits = element("section", "credit-list");
                            credits.appendChild(element("h3", "group-title", groupName || "Credits"));
                            career.appendChild(credits);
                        }
                        var label = (title.title || "Untitled") + (title.year ? " / " + title.year : "") +
                            (credit.role ? " / " + credit.role : "");
                        var ratingKey = local && window.PlexApi.matchCredit(local.index, title.ratingKey);
                        if (ratingKey) {
                            held += 1;
                            titleTile(credits, { title: label + " / " + translate("In this library"), thumb: title.thumb }, function () {
                                visit(function () { openDetail(ratingKey, client); });
                            }, client);
                        } else {
                            titleTile(credits, { title: label + " / " + translate("Search libraries"), thumb: title.thumb }, function () {
                                visit(function () { openSearch(title.title); });
                            }, client);
                        }
                    });
                    if (start > 0) {
                        button(career, "Previous page", function () { renderCareer(start - 50); }).focus();
                    }
                    if (start + 50 < allCredits.length) {
                        var nextPage = button(career, "Next page", function () { renderCareer(start + 50); });
                        if (start === 0 && document.activeElement && !screen.contains(document.activeElement)) { nextPage.focus(); }
                    }
                    setStatus(local ? translate("{count} credits are in this library.", { count: held }) +
                        (local.complete ? "" : " " + translate("Local title lookup reached its safety limit.")) :
                        translate("This server's titles could not be checked. Search libraries to find an available version."));
                }
                renderCareer(careerStart || 0);
                focusFirst();
            }).catch(function (error) {
                if (generation === viewGeneration) { setStatus(errorText(error), true); focusFirst(); }
            });
        }
        focusFirst();
    }

    function showPlayerError(error) { setStatus(errorText(error) || "Playback failed. Stop and retry.", true); }

    function serviceView(title, restore, kind) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        restoreView = restore;
        retryView = restore;
        page(translate(title), kind || "service");
        var toolbar = group(screen, "", "page-toolbar");
        button(toolbar, "Back", backView);
        setStatus("Loading...");
        focusLoading();
        return generation;
    }

    function openTelevision() {
        window.PlexTelevisionUi.create({
            client: function () { return currentClient; }, preferences: function () { return preferences; },
            screen: screen, view: serviceView, generation: function () { return viewGeneration; },
            element: element, button: button, translate: translate, visit: visit, back: backView,
            status: setStatus, focus: focusFirst, confirm: confirmServiceWrite,
            group: group, tile: titleTile
        }).open();
    }

    function catalogueUi() {
        return window.PlexCatalogueUi.create({
            account: function () { return accountClient; }, screen: screen, view: serviceView,
            generation: function () { return viewGeneration; }, element: element, button: button,
            translate: translate, visit: visit, status: setStatus, focus: focusFirst, confirm: confirmServiceWrite,
            find: findCatalogueItem, group: group, tile: titleTile,
            artwork: function () { return currentClient; }
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
                            screen.appendChild(element("p", "inline-error", errorText(error)));
                        }).then(function () {
                            active -= 1; finished += 1;
                            if (generation !== viewGeneration) { return; }
                            if (finished === targets.length) {
                                if (failed) { button(screen, "Retry", retryView); }
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
            var generation = serviceView(title, refresh, "confirmation");
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
                    setStatus(translate("The change was not confirmed. Check Plex before retrying.") + " " + errorText(error), true);
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
        screen.className = "screen screen-photos";
        restoreView = function () { openPhotos(items, index, client); };
        try {
            if (!window.URL || !window.URL.createObjectURL) { throw new Error("Photo display is unavailable in this runtime."); }
            var viewer = window.PlexPhotos.create({
                items: items, index: index, client: client, parent: screen, element: element,
                button: button, status: setStatus, translate: translate, urls: window.URL, back: backView
            });
            viewCleanup = viewer.close;
        } catch (error) { setStatus(errorText(error), true); button(screen, "Back", backView); }
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
        var controls = screen.querySelectorAll(".playback-controls button");
        if (controls.length) { controls[controls.length - 1].focus(); }
    }

    function qualityLabel(media) {
        if (!media) { return translate("Not reported by server"); }
        return [media.height ? media.height + "p" : media.videoResolution || "",
            media.videoCodec || media.audioCodec || "",
            media.bitrate ? (Number(media.bitrate) / 1000).toFixed(1) + " Mbps" : ""].filter(Boolean).join(" · ") ||
            translate("Not reported by server");
    }

    function applySubtitleAppearance(node) {
        if (!node) { return; }
        node.className = "subtitle-text";
        if (!externalCues) { return; }
        node.className += " subtitle-size-" + preferences.subtitleSize +
            " subtitle-position-" + preferences.subtitlePosition +
            " subtitle-color-" + preferences.subtitleColor;
    }

    function refreshSubtitleAppearance() {
        applySubtitleAppearance(document.getElementById("subtitle-text"));
    }

    function preferenceChoice(parent, title, preferenceKey, values, labelForValue) {
        var options = values.map(function (value) {
            return { value: value, label: labelForValue(value) };
        });
        var selected = options.filter(function (option) { return option.value === preferences[preferenceKey]; })[0];
        button(parent, translate("{setting}: {value}", {
            setting: translate(title), value: selected ? translate(selected.label) : ""
        }), function () {
            settingsChoices(title, options.map(function (option) {
                return { value: option.value, label: translate(option.label) };
            }), preferences[preferenceKey], function (value) {
                preferences[preferenceKey] = value;
                if (savePreferences()) { backView(); }
            });
        }, false, "settings");
    }

    function openPlaybackOptions() {
        if (!player) { return; }
        cancelScrub();
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
            var quality = player.quality();
            information.textContent = translate("Original source") + ": " + qualityLabel(quality.source) + ". " +
                translate(quality.mode === "direct" ? "Direct play" : "Server transcode") + ". " +
                translate("Server stream") + ": " + qualityLabel(quality.stream) + ". " +
                (quality.mode === "direct" ? "" : translate("Transcode limit") + ": " + quality.limit + "p.");
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
            audioId: trackOptions ? trackOptions.audioId : undefined,
            subtitleId: trackOptions ? trackOptions.subtitleId : undefined,
            overlaySubtitle: !!(trackOptions && trackOptions.cues),
            paused: !!(trackOptions && trackOptions.paused),
            profile: directPlayProfile()
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
        applySubtitleAppearance(subtitle);
        screen.appendChild(subtitle);
        var controls = element("div", "playback-controls");
        var rewind = button(controls, translate("Back {seconds} seconds", { seconds: preferences.skipInterval }),
            function () { seekPlayer(-preferences.skipInterval * 1000); }, false, "rewind");
        rewind.setAttribute("data-seconds", String(preferences.skipInterval));
        var pauseControl = button(controls, "Pause / Play", togglePlayer, false, "pause");
        pauseControl.setAttribute("aria-label", translate("Pause / Play"));
        var forward = button(controls, translate("Forward {seconds} seconds", { seconds: preferences.skipInterval }),
            function () { seekPlayer(preferences.skipInterval * 1000); }, false, "forward");
        forward.setAttribute("data-seconds", String(preferences.skipInterval));
        button(controls, "More", openPlaybackOptions, false, "settings");
        hud.appendChild(controls);
        screen.appendChild(hud);
        var ownPlayer;
        try {
            var adapter = window.PlexAvplay.create({
                avplay: window.webapis && window.webapis.avplay,
                onEvent: function (event) {
                    if (!player || player !== ownPlayer || playerClosing) { return; }
                    if (event.type === "time") {
                        var label = document.getElementById("playback-time");
                        if (label) { label.textContent = timeLabel(event.position) + " / " + timeLabel(event.duration || item.duration); }
                        var percent = Math.min(100, Math.max(0, event.position * 100 / (event.duration || item.duration || 1)));
                        progress.setAttribute("aria-valuenow", String(Math.round(percent)));
                        if (progressFill.style) { progressFill.style.width = percent + "%"; }
                        if (externalCues) {
                            var externalSubtitle = document.getElementById("subtitle-text");
                            if (externalSubtitle) {
                                externalSubtitle.textContent = window.PlexSubtitles.at(externalCues,
                                    event.position - preferences.subtitleDelayMs);
                            }
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
                        setStatus(event.detail ? "Buffering..." : "");
                        showHud();
                    } else if (event.type === "state") {
                        pauseControl.className = pauseControl.className.replace(/menu-icon-(pause|play)/,
                            event.state === "paused" ? "menu-icon-play" : "menu-icon-pause");
                        showHud();
                    } else if (event.type === "resume-failed") {
                        setStatus("Couldn't return to where you left off. Playing from the start.");
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
                    if (event.type === "direct-fallback" && player === ownPlayer) {
                        setStatus("This TV could not play the original file. Asking Plex to convert it...");
                    }
                    if (event.type === "progress-error" || event.type === "cleanup-error") {
                        if (player === ownPlayer) { setStatus(errorText(event), true); }
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
        seekToPlayer(player.snapshot().position + delta);
    }

    function seekToPlayer(target) {
        if (!player || playerClosing) { return; }
        var selectedPlayer = player;
        player.seek(target).then(function (position) {
            if (player !== selectedPlayer || playerClosing) { return; }
            setStatus(translate("Seek landed at {time}.", { time: timeLabel(position) }));
            showHud();
        }).catch(function (error) {
            if (player === selectedPlayer && !playerClosing) { showPlayerError(error); }
        });
    }

    function cancelScrub() {
        if (scrubTimer !== null) { clearTimeout(scrubTimer); scrubTimer = null; }
        scrubTarget = null; scrubRepeats = 0; scrubOwner = null;
    }

    function commitScrub() {
        var target = scrubTarget;
        var owner = scrubOwner;
        cancelScrub();
        if (target !== null && player === owner && !playerClosing) { seekToPlayer(target); }
    }

    function scrubPlayer(direction) {
        var snapshot = player.snapshot();
        if (["playing", "paused"].indexOf(snapshot.state) === -1 || playerClosing) { return; }
        if (scrubOwner !== player || scrubTarget === null) {
            cancelScrub(); scrubOwner = player; scrubTarget = snapshot.position;
        }
        scrubRepeats += 1;
        var step = preferences.skipInterval * 1000 * Math.min(4, 1 + Math.floor((scrubRepeats - 1) / 3));
        scrubTarget = Math.max(0, Math.min(snapshot.duration || playerItem.duration || 0, scrubTarget + direction * step));
        setStatus(translate("Seek to {time}", { time: timeLabel(scrubTarget) }));
        if (scrubTimer !== null) { clearTimeout(scrubTimer); }
        scrubTimer = setTimeout(commitScrub, 300);
    }

    function stopPlayer(after) {
        if (!player || playerClosing) { return Promise.resolve(); }
        playerClosing = true;
        cancelScrub();
        subtitleSearchGeneration += 1;
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
            button(menu, chapter.tag || translate("Chapter {number}", { number: index + 1 }), function () {
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

    // Restart playback at the current position with an explicit track choice. `cues` keeps an
    // app-rendered text overlay; only "Subtitles off" may send subtitleStreamID=0, because moving
    // the PMS selection off a downloaded subtitle deletes it (docs/pms-api.md section 8).
    function reloadTracks(audioId, subtitleId, cues) {
        if (!player) { return; }
        var item = playerItem;
        var client = playerClient;
        var position = player.snapshot().position;
        var version = playerSettings.mediaIndex;
        var options = { audioId: audioId, subtitleId: subtitleId, paused: player.snapshot().state === "paused" };
        if (cues) { options.cues = cues; }
        stopPlayer(function () { startPlayer(item, client, position, version, options); });
    }

    function useTextOverlay(stream, audioId) {
        var selectedPlayer = player;
        var generation = ++subtitleSearchGeneration;
        setStatus("Loading text subtitles...");
        playerClient.subtitleText(stream.id, stream.codec).then(function (text) {
            if (player !== selectedPlayer || playerClosing || generation !== subtitleSearchGeneration) { return; }
            reloadTracks(audioId, stream.id, window.PlexSubtitles.parse(text));
        }).catch(function (error) {
            if (player === selectedPlayer && !playerClosing && generation === subtitleSearchGeneration) { showPlayerError(error); }
        });
    }

    function subtitleSearchLanguages(first) {
        var seen = [];
        function add(tag) {
            var code = window.PlexSubtitleSearch.twoLetter(tag);
            if (code && seen.indexOf(code) === -1) { seen.push(code); }
        }
        add(first);
        (player.part().Stream || []).forEach(function (stream) { add(stream.languageCode || stream.languageTag); });
        add(preferences.language);
        add("en");
        return seen;
    }

    // Read-only search; picking a result is the only server write and needs an explicit OK.
    function openSubtitleSearch(language) {
        if (!player) { return; }
        cancelHudTimer();
        var search = window.PlexSubtitleSearch;
        var generation = ++subtitleSearchGeneration;
        var selectedPlayer = player;
        var ratingKey = playerItem.ratingKey;
        var audioId = player.selection().audioId;
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Search for subtitles")));
        var languages = subtitleSearchLanguages(language);
        var languageButton = button(menu, translate("Language: {language}", { language: language }), function () {
            openSubtitleSearch(languages[(languages.indexOf(language) + 1) % languages.length]);
        }, true, "settings");
        var results = group(menu, translate("Results"), "track-group");
        var note = element("p", "help-text", translate("Searching for subtitles..."));
        note.setAttribute("aria-live", "polite");
        results.appendChild(note);
        button(menu, "Back to audio and subtitles", openTracks);
        button(menu, "Close menu", closePlayerMenu);
        screen.appendChild(menu);
        languageButton.focus();
        function current() { return player === selectedPlayer && generation === subtitleSearchGeneration; }
        function retry() { openSubtitleSearch(language); }
        playerClient.searchSubtitles(ratingKey, language).then(function (container) {
            if (!current()) { return; }
            var hits = search.hitsOf(container);
            if (!hits.length) {
                note.textContent = translate("No subtitles found for this language.");
                return;
            }
            note.textContent = translate("Choosing a result adds it to this item on your Plex server.");
            hits.forEach(function (hit) {
                var label = [hit.title || hit.language || translate("Subtitle"), hit.provider,
                    hit.hearingImpaired ? "SDH" : "", hit.forced ? translate("Forced") : ""]
                    .filter(Boolean).join(" / ");
                var choice = button(results, label, function () { downloadSubtitle(hit); }, true);
                choice.setAttribute("aria-label", label + ", " + translate("score {score}", { score: hit.score }));
            });
        }).catch(function (error) {
            if (!current()) { return; }
            var verdict = search.failure(error);
            note.textContent = translate(verdict === "denied" ? "This Plex account cannot search for subtitles on this server." :
                verdict === "missing" ? "This item is no longer on the server." :
                verdict === "bad-language" ? "Plex cannot search subtitles in this language." :
                "The subtitle search failed. Check the connection and try again.");
            if (verdict === "transport") { button(results, "Retry", retry).focus(); }
        });
        function downloadSubtitle(hit) {
            if (!current()) { return; }
            generation = ++subtitleSearchGeneration;
            Array.prototype.forEach.call(results.querySelectorAll("button"), function (node) { node.disabled = true; });
            note.textContent = translate("Adding the subtitle to your Plex server...");
            search.download(playerClient, ratingKey, hit, { alive: current }).then(function (stream) {
                if (!current()) { return; }
                if (!stream) {
                    note.textContent = translate("Plex accepted the subtitle but has not finished adding it. Open Audio and subtitles again shortly.");
                    return;
                }
                if (["srt", "subrip", "webvtt"].indexOf(stream.codec) !== -1) {
                    useTextOverlay(stream, audioId);
                } else {
                    reloadTracks(audioId, stream.id);
                }
            }).catch(function (error) {
                if (!current()) { return; }
                var verdict = search.failure(error);
                note.textContent = translate(verdict === "denied" ? "This Plex account cannot add subtitles on this server." :
                    verdict === "missing" ? "This item is no longer on the server." :
                    "Adding the subtitle failed. Search again and pick a fresh result.");
                Array.prototype.forEach.call(results.querySelectorAll("button"), function (node) { node.disabled = false; });
                if (verdict === "transport") { button(results, "Search again", retry).focus(); }
            });
        }
    }

    function openTracks() {
        if (!player) { return; }
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", translate("Audio and subtitles")));
        var audioGroup = group(menu, translate("Audio"), "track-group");
        var subtitleGroup = group(menu, translate("Subtitles"), "track-group");
        var current = player.selection();
        var reload = reloadTracks;
        (player.part().Stream || []).forEach(function (stream) {
            if (stream.streamType === 2) {
                var audioChoice = button(audioGroup, stream.displayTitle || stream.language || stream.codec || String(stream.id), function () {
                    reload(stream.id, current.subtitleId, externalCues);
                });
                audioChoice.setAttribute("aria-pressed", String(String(current.audioId) === String(stream.id)));
            } else if (stream.streamType === 3) {
                var subtitleChoice = button(subtitleGroup, stream.displayTitle || stream.language || stream.codec || String(stream.id),
                    function () { reload(current.audioId, stream.id); });
                subtitleChoice.setAttribute("aria-pressed", String(!externalCues && String(current.subtitleId) === String(stream.id)));
                if (["srt", "subrip", "webvtt"].indexOf(stream.codec) !== -1) {
                    button(subtitleGroup, translate("Text overlay / {track}", { track: stream.displayTitle || stream.language || stream.id }), function () {
                        useTextOverlay(stream, current.audioId);
                    });
                }
            }
        });
        button(subtitleGroup, "Subtitles off", function () { reload(current.audioId, 0); })
            .setAttribute("aria-pressed", String(!current.subtitleId && !externalCues));
        if (playerItem.type === "movie" || playerItem.type === "episode") {
            button(subtitleGroup, "Search for subtitles", function () {
                openSubtitleSearch(window.PlexSubtitleSearch.defaultLanguage(player.part(), preferences.language));
            });
        }
        var appearance = group(menu, translate("Text overlay appearance"), "track-group");
        appearance.appendChild(element("p", "help-text", translate("These settings apply only to the app-rendered SRT/WebVTT text overlay, not device-native or burned subtitles.")));
        function cycleAppearance(title, preferenceKey, values, labelForValue) {
            var current = values.indexOf(preferences[preferenceKey]);
            button(appearance, translate("{setting}: {value}", {
                setting: translate(title), value: translate(labelForValue(preferences[preferenceKey]))
            }), function () {
                preferences[preferenceKey] = values[(current + 1) % values.length];
                if (savePreferences()) {
                    refreshSubtitleAppearance();
                    openTracks();
                }
            }, false, "settings");
        }
        cycleAppearance("Text size", "subtitleSize", ["small", "medium", "large"], function (value) { return value; });
        cycleAppearance("Text position", "subtitlePosition", ["low", "middle", "high"], function (value) { return value; });
        cycleAppearance("Text color", "subtitleColor", ["white", "yellow"], function (value) { return value; });
        cycleAppearance("Subtitle delay", "subtitleDelayMs", [-2000, -1000, -500, 0, 500, 1000, 2000],
            function (value) { return (value > 0 ? "+" : "") + value + " ms"; });
        var nativeTracks = element("div", "native-tracks");
        nativeTracks.hidden = true;
        try {
            player.tracks().forEach(function (track) {
                if (track.type !== "AUDIO" && track.type !== "TEXT") { return; }
                button(nativeTracks, translate("Samsung {type} track {number}", { type: translate(track.type), number: track.index }), function () {
                    try {
                        player.selectTrack(track.type, track.index);
                        if (track.type === "TEXT") { player.subtitles(true); }
                        setStatus("Samsung track selected. Verify the output on this model.");
                    } catch (error) { showPlayerError(error); }
                });
            });
        } catch (error) { menu.appendChild(element("p", "inline-error", errorText(error))); }
        if (nativeTracks.querySelectorAll("button").length) {
            button(menu, "Device tracks", function () {
                nativeTracks.hidden = !nativeTracks.hidden;
            }, false, "settings");
            menu.appendChild(nativeTracks);
        }
        button(menu, "Playback options", openPlaybackOptions);
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
        menu.appendChild(element("p", "help-text", translate("Original source") + ": " + qualityLabel(player.quality().source)));
        function change(quality, version) {
            var item = playerItem;
            var client = playerClient;
            var position = player.snapshot().position;
            var tracks = { audioId: playerSettings.audioId, subtitleId: playerSettings.subtitleId, cues: externalCues,
                paused: player.snapshot().state === "paused" };
            preferences.quality = quality;
            stopPlayer(function () { startPlayer(item, client, position, version, tracks); });
        }
        ["720", "1080"].forEach(function (quality) {
            button(menu, translate("{quality}p server transcode", { quality: quality }), function () { change(quality, playerSettings.mediaIndex); })
                .setAttribute("aria-pressed", String(playerSettings.quality === quality));
        });
        (playerItem.Media || []).forEach(function (media, version) {
            if (playerItem.Media.length < 2) { return; }
            button(menu, translate("Version {number} / {quality}", { number: version + 1, quality: qualityLabel(media) }),
                function () { change(preferences.quality, version); })
                .setAttribute("aria-pressed", String(playerSettings.mediaIndex === version));
        });
        menu.appendChild(element("p", "help-text", translate("Original direct play is not available on this model profile.")));
        button(menu, "Playback options", openPlaybackOptions);
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
                button(screen, translate("Up Next: {title}", { title: next.title }), function () {
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

    function settingsChoices(title, values, current, choose) {
        retryView = null;
        visit(function renderChoices() {
            viewGeneration += 1;
            clear(screen);
            page(translate(title), "settings");
            values.forEach(function (value) {
                button(screen, value.label, function () { choose(value.value); }).setAttribute("aria-pressed",
                    String(current === value.value));
            });
            button(screen, "Back", backView);
            restoreView = renderChoices;
            setStatus("");
            focusFirst();
        });
    }

    function openSettings() {
        retryView = null;
        var focusedSetting = restoreView === openSettings ?
            Array.prototype.slice.call(screen.querySelectorAll("button")).indexOf(document.activeElement) : -1;
        viewGeneration += 1;
        clear(screen);
        page(translate("Settings"), "settings");
        var menu = element("section", "settings-menu");
        menu.setAttribute("aria-label", translate("Settings"));
        screen.appendChild(menu);
        var playbackSettings = group(menu, translate("Playback"), "settings-group");
        playbackSettings.appendChild(element("p", "help-text", directPlaySummary()));
        button(playbackSettings, translate("Transcode quality: {quality}p", { quality: preferences.quality }), function () {
            settingsChoices("Transcode quality", ["720", "1080"].map(function (quality) {
                return { value: quality, label: translate("{quality}p server transcode", { quality: quality }) };
            }), preferences.quality, function (quality) {
                preferences.quality = quality;
                if (savePreferences()) { backView(); }
            });
        }, false, "settings");
        preferenceChoice(playbackSettings, "Skip interval", "skipInterval", [5, 10, 15, 30, 60],
            function (seconds) { return seconds + " seconds"; });
        var autoNext = button(playbackSettings, translate("Auto-play next episode: {state}", { state: translate(preferences.autoNext ? "On" : "Off") }), function () {
            preferences.autoNext = !preferences.autoNext;
            if (savePreferences()) { openSettings(); }
        }, false, "play");
        autoNext.setAttribute("aria-pressed", preferences.autoNext ? "true" : "false");
        button(playbackSettings, translate("Direct play: {state}", {
            state: translate(preferences.directPlay === "off" ? "Off" : "Auto")
        }), function () {
            preferences.directPlay = preferences.directPlay === "off" ? "auto" : "off";
            if (savePreferences()) { openSettings(); }
        }, false, "play");
        button(playbackSettings, translate("Continue Watching: {state}", {
            state: translate(preferences.continueAction === "play" ? "Play" : "Open details")
        }), function () {
            preferences.continueAction = preferences.continueAction === "play" ? "details" : "play";
            if (savePreferences()) { openSettings(); }
        }, false, "play");
        var subtitleSettings = group(menu, translate("Text overlay appearance"), "settings-group");
        subtitleSettings.appendChild(element("p", "help-text", translate("These settings apply only to the app-rendered SRT/WebVTT text overlay, not device-native or burned subtitles.")));
        preferenceChoice(subtitleSettings, "Text size", "subtitleSize", ["small", "medium", "large"], function (value) { return value; });
        preferenceChoice(subtitleSettings, "Text position", "subtitlePosition", ["low", "middle", "high"], function (value) { return value; });
        preferenceChoice(subtitleSettings, "Text color", "subtitleColor", ["white", "yellow"], function (value) { return value; });
        preferenceChoice(subtitleSettings, "Subtitle delay", "subtitleDelayMs", [-2000, -1000, -500, 0, 500, 1000, 2000],
            function (value) { return (value > 0 ? "+" : "") + value + " ms"; });
        if (currentClient && currentServerId) {
            var librarySettings = group(menu, translate("Libraries"), "settings-group");
            button(librarySettings, "Favorite libraries", function () { visit(function () { openFavorites(false); }); });
        }
        var languages = group(menu, translate("Language"), "settings-group");
        var names = { en: "English", es: "Español", be: "Беларуская" };
        button(languages, translate("Language") + ": " + names[preferences.language], function () {
            settingsChoices("Language", ["en", "es", "be"].map(function (language) {
                return { value: language, label: names[language] };
            }), preferences.language, function (language) {
                preferences.language = language;
                if (savePreferences()) { backView(); }
            });
        }, false, "language");
        var privacy = group(menu, translate("Privacy and data"), "settings-group");
        var storageWarning = "";
        if (accountToken && window.PlexSession) {
            var savedAccount = "";
            try { savedAccount = window.PlexSession.load(window.localStorage); }
            catch (error) { storageWarning = errorText(error); }
            var savedSignIn = savedAccount === accountToken;
            var savedLabel = translate("Stay signed in on this TV") + ": " +
                translate(savedSignIn ? "On" : "Off");
            var saveSignIn = button(privacy, savedLabel, function () {
                var shouldSave = saveSignIn.getAttribute("aria-pressed") !== "true";
                try {
                    if (shouldSave) {
                        window.PlexSession.save(window.localStorage, accountToken);
                        window.PlexSession.setEnabled(window.localStorage, true);
                    } else {
                        window.PlexSession.forget(window.localStorage);
                        window.PlexSession.setEnabled(window.localStorage, false);
                    }
                    saveSignIn.setAttribute("aria-pressed", String(shouldSave));
                    saveSignIn.textContent = translate("Stay signed in on this TV") + ": " +
                        translate(shouldSave ? "On" : "Off");
                    setStatus("");
                } catch (error) {
                    setStatus("Could not update saved sign-in. Check app storage permissions.", true);
                }
            }, true);
            saveSignIn.setAttribute("aria-pressed", String(savedSignIn));
            privacy.appendChild(element("p", "help-text",
                translate("Saved Plex credentials are stored unencrypted on this TV.")));
        }
        button(privacy, "Reset preferences", function () {
            try {
                window.PlexPreferences.reset(window.localStorage);
                if (window.PlexFavorites) { window.PlexFavorites.reset(window.localStorage); }
                if (window.PlexRecents) { window.PlexRecents.reset(window.localStorage); }
                preferences = window.PlexPreferences.load(window.localStorage);
                window.PlexI18n.setLanguage(preferences.language);
                openSettings();
            } catch (error) { setStatus("Could not reset preferences. Check app storage permissions.", true); }
        });
        button(privacy, "Diagnostics", function () {
            visit(function () {
                viewGeneration += 1;
                clear(screen);
                page(translate("Diagnostics"), "diagnostics");
                screen.appendChild(element("p", "help-text", translate("Sign-in is saved on this TV by default. You can turn it off in Settings. Storage is unencrypted. No analytics or crash uploads are enabled.")));
                screen.appendChild(element("p", "help-text",
                    translate("AVPlay: {state}. {profile}. Model support is not certified. Account tokens, server origins, titles and queries are not logged or uploaded.", {
                        state: translate(window.webapis && window.webapis.avplay ? "available" : "unavailable"), profile: directPlaySummary() })));
                button(screen, "Back", backView);
                focusFirst();
            });
        });
        button(privacy, "Sign out", signOut);
        button(privacy, "Back", backView);
        restoreView = openSettings;
        setStatus(storageWarning, !!storageWarning);
        focusFirst();
        var controls = screen.querySelectorAll("button");
        if (focusedSetting >= 0 && controls[focusedSetting]) { controls[focusedSetting].focus(); }
    }

    function insideHidden(node) {
        for (var current = node; current; current = current.parentNode) {
            if (current !== document && current.hidden === true) { return true; }
        }
        return false;
    }

    function moveFocus(direction, key) {
        var active = document.activeElement;
        var localRow = active && active.parentNode;
        if ((key === 37 || key === 39) && localRow &&
                /(?:home-navigation|home-feature-actions|playback-controls|detail-actions)/.test(localRow.className || "")) {
            var rowControls = Array.prototype.slice.call(localRow.querySelectorAll("button"));
            var rowIndex = rowControls.indexOf(active);
            var adjacent = rowControls[rowIndex + direction];
            if (adjacent && !adjacent.disabled) { adjacent.focus(); }
            return;
        }
        if ((key === 38 || key === 40) && active && active.parentNode &&
                /home-navigation/.test(active.parentNode.className || "")) {
            if (key === 38) { return; }
            var featuredAction = screen.querySelector(".home-feature-primary");
            var firstCard = screen.querySelector(".media-card");
            if (featuredAction) {
                screen.className = "screen screen-home";
                screen.scrollTop = 0;
            }
            if (featuredAction || firstCard) { (featuredAction || firstCard).focus(); return; }
        }
        if (key === 40 && active && active.parentNode &&
                /home-feature-actions/.test(active.parentNode.className || "")) {
            var cardBelow = screen.querySelector(".media-card");
            if (cardBelow) { cardBelow.focus(); return; }
        }
        if (key === 38 && active && active.parentNode &&
                /home-feature-actions/.test(active.parentNode.className || "")) {
            var homeNavigation = screen.querySelector(".home-navigation");
            if (homeNavigation) { homeNavigation.querySelector("button").focus(); return; }
        }
        if (key === 38 && active && active.plexCard && screen.className.indexOf("screen-home") !== -1) {
            var shelves = Array.prototype.slice.call(screen.querySelectorAll(".shelf-row")).filter(function (row) {
                return row.querySelector(".media-card");
            });
            if (shelves[0] && shelves[0].contains(active)) {
                var featureAbove = screen.querySelector(".home-feature-primary");
                if (featureAbove) {
                    screen.className = "screen screen-home";
                    featureAbove.focus();
                    return;
                }
            }
        }
        if ((key === 38 || key === 40) && active && active.plexCard &&
                screen.className.indexOf("screen-home") !== -1) {
            var homeRows = Array.prototype.slice.call(screen.querySelectorAll(".shelf-row")).filter(function (row) {
                return row.querySelector(".media-card");
            });
            var rowPosition = homeRows.indexOf(active.parentNode);
            if (rowPosition >= 0) {
                var targetRow = homeRows[rowPosition + (key === 38 ? -1 : 1)];
                if (targetRow) {
                    var sourceBounds = active.getBoundingClientRect();
                    var sourceCenter = sourceBounds.left + sourceBounds.width / 2;
                    var closest = null;
                    var distance = Infinity;
                    Array.prototype.forEach.call(targetRow.querySelectorAll(".media-card"), function (candidate) {
                        var bounds = candidate.getBoundingClientRect();
                        var delta = Math.abs(bounds.left + bounds.width / 2 - sourceCenter);
                        if (!candidate.disabled && delta < distance) { closest = candidate; distance = delta; }
                    });
                    if (closest) { closest.focus(); }
                }
                return;
            }
        }
        var menu = document.getElementById("player-menu");
        var fileInfo = screen.querySelector(".file-info-panel");
        var focusSurface = fileInfo && !fileInfo.hidden ? fileInfo : menu || screen;
        var controls = Array.prototype.slice.call(focusSurface.querySelectorAll("button, input, select")).filter(function (node) {
            return !node.disabled && !insideHidden(node);
        });
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
            if (menu) {
                if (player && menu.querySelector("button") &&
                        Array.prototype.some.call(menu.querySelectorAll("button"), function (control) {
                            return control.textContent === translate("Playback options");
                        })) { openPlaybackOptions(); }
                else { closePlayerMenu(); }
                return;
            }
            var utilities = screen.querySelector(".home-utilities");
            if (utilities && !utilities.hidden) {
                utilities.hidden = true;
                screen.querySelector(".account-control").focus();
                return;
            }
            var fileInfo = screen.querySelector(".file-info-panel");
            if (fileInfo && !fileInfo.hidden) {
                fileInfo.hidden = true;
                var detailMore = screen.querySelector('[aria-label="More"]');
                if (detailMore) { detailMore.focus(); }
                return;
            }
            var overflow = screen.querySelector(".detail-overflow");
            if (overflow && !overflow.hidden) {
                overflow.hidden = true;
                var moreControl = screen.querySelector('.detail-actions [aria-expanded]');
                moreControl.setAttribute("aria-expanded", "false");
                moreControl.focus();
                return;
            }
            backView();
            return;
        }
        if (player && [415, 19, 10252, 413, 417, 412].indexOf(key) !== -1) {
            event.preventDefault();
            if (Date.now() - lastAction < 150) { return; }
            lastAction = Date.now();
            if (key === 413) { stopPlayer(); }
            else if (key === 417 || key === 412) {
                seekPlayer(key === 417 ? preferences.skipInterval * 1000 : -preferences.skipInterval * 1000);
            }
            else if (key === 415 && player.snapshot().state !== "paused") { return; }
            else if (key === 19 && player.snapshot().state !== "playing") { return; }
            else { togglePlayer(); }
            return;
        }
        if (player && !document.getElementById("player-menu") && (key === 37 || key === 39)) {
            event.preventDefault();
            scrubPlayer(key === 39 ? 1 : -1);
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
        if ((event.keyCode === 37 || event.keyCode === 39) && scrubTarget !== null) {
            event.preventDefault(); commitScrub(); return;
        }
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
            cancelScrub();
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
        } catch (error) { setStatus(errorText(error), true); }
    }
}());
