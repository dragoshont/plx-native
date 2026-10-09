(function () {
    "use strict";

    var screen = document.getElementById("screen");
    var status = document.getElementById("status");
    var currentClient = null;
    var currentSection = null;
    var currentItems = [];
    var currentOffset = 0;
    var viewGeneration = 0;
    var itemsLoading = false;
    var authClient = null;
    var authPin = null;
    var authTimer = null;
    var authGeneration = 0;
    var accountToken = "";
    var rememberAccount = false;
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
    var nextTimer = null;
    var playerClosing = false;
    var lastAction = 0;
    var externalCues = null;
    var preferences = { quality: "1080", autoNext: false, language: "en" };
    var preferenceError = "";
    var pendingRestore = null;
    if (window.PlexPreferences) {
        try {
            preferences = window.PlexPreferences.load(window.localStorage);
            window.PlexI18n.setLanguage(preferences.language);
        } catch (error) { preferenceError = error.message; }
    }

    function translate(text) { return window.PlexI18n ? window.PlexI18n.text(text) : text; }

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
                Promise.resolve().then(function () { return job.client.image(job.path); }).then(function (blob) {
                    if (job.generation !== imageGeneration) { return; }
                    if (blob.size > 2 * 1024 * 1024) { throw new Error("Artwork exceeds the image memory limit."); }
                    var url = window.URL.createObjectURL(blob);
                    imageUrls.push(url);
                    if (imageUrls.length > 60) { window.URL.revokeObjectURL(imageUrls.shift()); }
                    job.node.src = url;
                }).catch(function () {
                    if (job.generation === imageGeneration) { job.node.alt = "Artwork unavailable"; }
                }).then(function () { imageActive -= 1; pumpImages(); });
            }(imageQueue.shift()));
        }
    }

    function card(parent, item, client) {
        var node = button(parent, "", function () {
            visit(function () { openDetail(item.ratingKey, client); });
        });
        node.className = "media-card";
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

    function clear(node) {
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
            if (!controls[i].disabled) {
                controls[i].focus();
                return;
            }
        }
    }

    function addSectionHeading(parent, title) {
        parent.appendChild(element("h2", "section-heading", title));
    }

    function stopAuthorization() {
        authGeneration += 1;
        if (authTimer !== null) {
            clearTimeout(authTimer);
            authTimer = null;
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
                if (rememberAccount && window.PlexSession) {
                    try { window.PlexSession.remember(window.localStorage, accountToken, true); }
                    catch (error) { warning = "Plex linked, but the session could not be saved. It remains memory-only."; }
                }
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles(warning);
            } else {
                stopAuthorization();
                info.textContent = result.status === "denied" ?
                    "Sign-in was denied. Start again to request a new code." :
                    "This sign-in code expired. Start again to request a new code.";
                setStatus(info.textContent, result.status === "denied");
            }
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = "Network issue while checking sign-in. Retrying…";
            authTimer = setTimeout(function () {
                pollAuthorization(generation, info);
            }, 5000);
        });
    }

    function button(parent, label, action, literal) {
        var node = element("button", "secondary-button", literal ? label : translate(label));
        node.type = "button";
        node.addEventListener("click", action);
        parent.appendChild(node);
        return node;
    }

    function openProfiles(warning) {
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
                screen.appendChild(element("p", "empty-state", "No Plex servers are shared with this identity."));
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
                    window.PlexApi.selectServer(server).then(function (selected) {
                        if (selection !== viewGeneration) { return; }
                        currentClient = selected.client;
                        usingRelay = selected.relay;
                        loadHome(false);
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

    function beginAuthorization(info) {
        stopAuthorization();
        accountToken = "";
        var generation = authGeneration;
        info.textContent = "Requesting a secure sign-in code…";
        setStatus("Contacting Plex…");
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
            clear(info);
            if (pin.qr) {
                var qr = element("img", "auth-qr");
                qr.src = pin.qr;
                qr.alt = "Scan to authorize this Plex client";
                qr.width = 280;
                qr.height = 280;
                info.appendChild(qr);
            }
            info.appendChild(element("p", "help-text", "On a phone or computer, open Plex and enter this code:"));
            info.appendChild(element("strong", "auth-code", pin.code));
            var link = element("a", "plex-link", "Open plex.tv/link");
            link.href = pin.linkUrl;
            link.target = "_blank";
            link.rel = "noopener";
            info.appendChild(link);
            info.appendChild(element("p", "help-text", "This code expires in about five minutes."));
            setStatus("Waiting for Plex sign-in. The code is temporary and is not saved.");
            pollAuthorization(generation, info);
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = "Could not start Plex sign-in. Check the network and try again.";
            setStatus(info.textContent, true);
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
        section.appendChild(element("h2", "", "Sign in to Plex"));
        section.appendChild(element("p", "help-text",
            "Sign in to Plex with a temporary device code, or connect directly to a test server."));

        var authPanel = element("div", "auth-panel");
        authPanel.appendChild(element("h3", "", "Plex device sign-in"));
        var authInfo = element("div", "auth-info", "No Plex account is linked.");
        authPanel.appendChild(authInfo);
        var signIn = element("button", "secondary-button", "Sign in to Plex");
        signIn.type = "button";
        signIn.addEventListener("click", function () {
            rememberAccount = remember && remember.checked;
            beginAuthorization(authInfo);
        });
        authPanel.appendChild(signIn);
        var remember = null;
        if (window.PlexSession) {
            var rememberLabel = element("label", "remember-option",
                "Remember this account on this TV (optional). The token is stored unencrypted in this app's local storage. Do not enable on a shared or untrusted TV.");
            remember = element("input", "remember-checkbox");
            remember.type = "checkbox";
            remember.checked = false;
            rememberLabel.appendChild(remember);
            authPanel.appendChild(rememberLabel);
            button(authPanel, "Delete saved sign-in", signOut);
        }
        section.appendChild(authPanel);

        var form = element("form", "connect-form");
        var serverLabel = element("label", "", "Server URL");
        var serverInput = element("input", "remote-input");
        serverInput.type = "url";
        serverInput.name = "server";
        serverInput.value = "http://127.0.0.1:32499";
        serverInput.autocomplete = "url";
        serverLabel.appendChild(serverInput);

        var tokenLabel = element("label", "", "Server access token");
        var tokenInput = element("input", "remote-input");
        tokenInput.type = "password";
        tokenInput.name = "token";
        tokenInput.autocomplete = "off";
        tokenLabel.appendChild(tokenInput);

        var submit = element("button", "primary-button", "Connect");
        submit.type = "submit";
        form.appendChild(serverLabel);
        form.appendChild(tokenLabel);
        form.appendChild(submit);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            connect(serverInput.value, tokenInput.value);
        });
        section.appendChild(form);
        if (message) {
            section.appendChild(element("p", "inline-error", message));
        }
        screen.appendChild(section);
        setStatus("Server tokens are kept in memory for this app session and sent in an HTTP header.");
        focusFirst();
    }

    function connect(serverUrl, token) {
        stopAuthorization();
        setStatus("Connecting…");
        try {
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

    function loadHome(showConnectOnError) {
        var generation = ++viewGeneration;
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
        screen.appendChild(element("h2", "", translate("Home")));

        var sectionPanel = element("section", "content-panel");
        addSectionHeading(sectionPanel, translate("Libraries"));
        if (!sections.length) {
            sectionPanel.appendChild(element("p", "empty-state", "No libraries were returned by this server."));
        }
        sections.filter(function (section) {
            return section.type === "movie" || section.type === "show";
        }).forEach(function (section) {
            var button = element("button", "library-button", section.title || "Untitled library");
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
            hubPanel.appendChild(element("p", "empty-state", "No Home shelves were returned."));
        }
        hubs.forEach(function (hub) {
            var hubSection = element("section", "shelf");
            hubSection.appendChild(element("h3", "hub-title", hub.title || "Plex shelf"));
            var metadata = Array.isArray(hub.Metadata) ? hub.Metadata : [];
            metadata.slice(0, 12).forEach(function (item) {
                if (item.ratingKey) { card(hubSection, item, currentClient); }
            });
            hubPanel.appendChild(hubSection);
        });
        screen.appendChild(hubPanel);
        button(screen, "Search", function () { visit(openSearch); });
        button(screen, "Settings", function () { visit(openSettings); });

        var disconnect = element("button", "secondary-button", "Change server");
        disconnect.type = "button";
        disconnect.addEventListener("click", function () {
            currentClient = null;
            if (accountClient) { openServers(); } else { addConnectForm(""); }
        });
        screen.appendChild(disconnect);
        setStatus((usingRelay ? "Connected through Plex relay (bandwidth limited). " : "Connected. ") +
            "Select a title for details. Playback starts only when you choose Play.");
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
        currentItems.forEach(function (item) { card(list, item, currentClient); });
        var previousPage = button(screen, "Previous page", function () {
            var start = Math.max(0, currentOffset - currentItems.length - 50);
            openSection(section, { items: [], offset: start, filters: libraryFilters });
            loadNextPage();
        });
        previousPage.id = "previous-page";
        previousPage.disabled = currentOffset <= currentItems.length;
        var loadMore = element("button", "secondary-button", "Load more");
        loadMore.type = "button";
        loadMore.id = "load-more";
        loadMore.addEventListener("click", loadNextPage);
        screen.appendChild(loadMore);
        var back = element("button", "secondary-button", "Back to Home");
        back.type = "button";
        back.id = "home-back";
        back.addEventListener("click", function () {
            backView();
        });
        screen.appendChild(back);
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
            currentItems.forEach(function (item) { card(list, item, currentClient); });
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
            if (!items.length) { list.appendChild(element("p", "empty-state", "No available items in this view.")); }
            items.forEach(function (item) { if (item.ratingKey) { card(list, item, client); } });
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
        currentClient.getBrowseMenus(section.key, section.type === "show" ? 2 : 1).then(function (container) {
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
                        (server ? window.PlexApi.selectServer(server).then(function (selected) { return selected.client; }) :
                            Promise.resolve(currentClient)).then(function (client) {
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
                                        return ["movie", "show", "season", "episode", "collection"].indexOf(item.type) !== -1;
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
                                        results.firstChild ? "Search complete." : "No matching movies or television found.", failures > 0);
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

    function renderDetail(item, client) {
        viewGeneration += 1;
        clear(screen);
        resetImages();
        restoreView = function () { openDetail(item.ratingKey, client); };
        screen.appendChild(element("h2", "", item.title || "Details"));
        screen.appendChild(element("p", "detail-meta", [item.year, item.contentRating,
            item.duration ? Math.round(item.duration / 60000) + " min" : "",
            item.viewCount ? "Watched" : ""].filter(Boolean).join(" / ")));
        screen.appendChild(element("p", "synopsis", item.summary || "No synopsis is available."));
        if (item.type === "movie" || item.type === "episode" || item.type === "clip") {
            if (item.viewOffset) {
                button(screen, "Resume at " + timeLabel(item.viewOffset), function () { startPlayer(item, client, item.viewOffset); });
            }
            button(screen, "Play from beginning", function () { startPlayer(item, client, 0); });
            (item.Media || []).forEach(function (media, index) {
                button(screen, "Version " + (index + 1) + " / " + (media.videoResolution || "") +
                    " " + (media.videoCodec || ""), function () { startPlayer(item, client, 0, index); });
            });
        }
        if (["show", "season", "collection"].indexOf(item.type) !== -1) {
            button(screen, item.type === "show" ? "Seasons" : item.type === "season" ? "Episodes" : "Collection items", function () {
                visit(function () {
                    openListing(item.title, function (offset) {
                        return item.type === "collection" ? client.getCollectionItems(item.ratingKey, offset) :
                            client.getChildren(item.ratingKey, offset);
                    }, client);
                });
            });
        }
        (item.Role || []).concat(item.Director || [], item.Writer || []).slice(0, 60).forEach(function (person) {
            button(screen, (person.tag || "Cast") + (person.role ? " / " + person.role : ""), function () {
                visit(function () {
                    openPerson(person, client);
                });
            }, true);
        });
        var extras = item.Extras && item.Extras.Metadata || [];
        if (extras.length) {
            var shelf = element("section", "shelf");
            shelf.appendChild(element("h3", "", "Extras and trailers"));
            extras.slice(0, 20).forEach(function (extra) { card(shelf, extra, client); });
            screen.appendChild(shelf);
        }
        button(screen, "Related titles", function () {
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
        button(screen, "Back", backView);
        setStatus("Choose Play or Resume to start playback. Browsing does not update watch history.");
        focusFirst();
    }

    function timeLabel(ms) {
        var seconds = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(seconds / 60) + ":" + ("0" + seconds % 60).slice(-2);
    }

    function openPerson(person, client) {
        var generation = ++viewGeneration;
        clear(screen);
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
            accountClient.personCredits(person.tagKey).then(function (groups) {
                if (generation !== viewGeneration) { return; }
                var shown = 0;
                groups.slice(0, 20).forEach(function (group) {
                    if (shown >= 200) { return; }
                    screen.appendChild(element("h3", "", group.title || "Credits"));
                    (group.Credit || []).slice(0, 200 - shown).forEach(function (credit) {
                        var title = credit.Metadata;
                        if (!title) { return; }
                        button(screen, (title.title || "Untitled") + (title.year ? " / " + title.year : "") +
                            (credit.role ? " / " + credit.role : "") + " / Search libraries", function () {
                            visit(function () { openSearch(title.title); });
                        }, true);
                        shown += 1;
                    });
                });
                setStatus((shown >= 200 ? "Showing the first 200 credits. " : "") +
                    "Catalogue credits are not server rating keys. Search libraries to find an available version.");
            }).catch(function (error) {
                if (generation === viewGeneration) { screen.appendChild(element("p", "inline-error", error.message)); }
            });
        }
        focusFirst();
    }

    function showPlayerError(error) { setStatus(error.message || "Playback failed. Stop and retry.", true); }

    function startPlayer(item, client, offset, mediaIndex, trackOptions) {
        if (player || playerClosing) { return; }
        viewGeneration += 1;
        resetImages();
        clear(screen);
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
        var time = element("p", "playback-time", "Preparing playback...");
        time.id = "playback-time";
        hud.appendChild(time);
        var subtitle = element("p", "subtitle-text");
        subtitle.id = "subtitle-text";
        screen.appendChild(subtitle);
        button(hud, "Pause / Play", togglePlayer);
        button(hud, "Back 10 seconds", function () { seekPlayer(-10000); });
        button(hud, "Forward 30 seconds", function () { seekPlayer(30000); });
        button(hud, "Chapters and markers", openChapters);
        button(hud, "Audio and subtitles", openTracks);
        button(hud, "Quality and version", openQuality);
        button(hud, "Playback information", function () {
            setStatus(player.mode() === "direct" ? "Direct play with an explicitly evidenced capability profile." :
                "Plex server transcode / HLS / H.264 + AAC / " + preferences.quality +
                "p. Native formats and HDR remain model-specific and unverified.");
        });
        button(hud, "Stop and return to details", stopPlayer);
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
                        setStatus(event.detail ? "Buffering..." : "Playback ready.");
                    } else if (event.type === "error") {
                        showPlayerError({ message: event.detail });
                    } else if (event.type === "ended") {
                        finishEpisode();
                    }
                }
            });
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
                    setStatus("Playing. Use the remote media keys or the on-screen controls.");
                }
            }).catch(function (error) {
                if (player === ownPlayer) { showPlayerError(error); }
            });
        } catch (error) {
            document.body.className = "";
            player = null;
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
            action.catch(showPlayerError);
        } catch (error) { showPlayerError(error); }
    }

    function seekPlayer(delta) {
        if (!player) { return; }
        player.seek(player.snapshot().position + delta).then(function (position) {
            setStatus("Seek landed at " + timeLabel(position) + ".");
        }).catch(showPlayerError);
    }

    function stopPlayer(after) {
        if (!player || playerClosing) { return Promise.resolve(); }
        playerClosing = true;
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
            if (!safeToLeave) { playerClosing = false; return; }
            player = null;
            playerClosing = false;
            document.body.className = "";
            if (typeof after === "function") { after(); }
            else { renderDetail(item, client); }
        });
    }

    function openChapters() {
        if (!player) { return; }
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
        button(menu, "Close menu", function () { menu.parentNode.removeChild(menu); focusFirst(); });
        screen.appendChild(menu);
        var control = menu.querySelectorAll("button")[0];
        if (control) { control.focus(); }
    }

    function openTracks() {
        if (!player) { return; }
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
        button(menu, "Close menu", function () { menu.parentNode.removeChild(menu); focusFirst(); });
        screen.appendChild(menu);
        var control = menu.querySelectorAll("button")[0];
        if (control) { control.focus(); }
    }

    function openQuality() {
        if (!player) { return; }
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
        menu.appendChild(element("p", "help-text", "Original quality needs an evidenced model capability profile. Unknown formats are not advertised as supported."));
        button(menu, "Close menu", function () { menu.parentNode.removeChild(menu); focusFirst(); });
        screen.appendChild(menu);
        menu.querySelectorAll("button")[0].focus();
    }

    function finishEpisode() {
        var item = playerItem;
        var client = playerClient;
        stopPlayer(function () {
            renderDetail(item, client);
            var generation = viewGeneration;
            client.nextEpisode(item).then(function (next) {
                if (!next || player || playerItem !== item || generation !== viewGeneration) { return; }
                button(screen, "Up Next: " + next.title, function () {
                    if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
                    openDetail(next.ratingKey, client);
                });
                if (preferences.autoNext) {
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

    function openSettings() {
        viewGeneration += 1;
        clear(screen);
        screen.appendChild(element("h2", "", translate("Settings")));
        screen.appendChild(element("p", "help-text", translate("Account credentials are session-only unless you explicitly enabled unencrypted remember-me. No analytics or crash uploads are enabled.")));
        ["720", "1080"].forEach(function (quality) {
            button(screen, "Transcode quality: " + quality + "p" + (preferences.quality === quality ? " (selected)" : ""), function () {
                preferences.quality = quality;
                if (savePreferences()) { openSettings(); }
            });
        });
        button(screen, "Auto-play next episode: " + (preferences.autoNext ? "On" : "Off"), function () {
            preferences.autoNext = !preferences.autoNext;
            if (savePreferences()) { openSettings(); }
        });
        ["en", "es", "be"].forEach(function (language) {
            var names = { en: "English", es: "Español", be: "Беларуская" };
            button(screen, translate("Language") + ": " + names[language], function () {
                preferences.language = language;
                if (savePreferences()) { openSettings(); }
            });
        });
        button(screen, "Reset preferences", function () {
            try {
                window.PlexPreferences.reset(window.localStorage);
                preferences = window.PlexPreferences.load(window.localStorage);
                window.PlexI18n.setLanguage(preferences.language);
                openSettings();
            } catch (error) { setStatus("Could not reset preferences. Check app storage permissions.", true); }
        });
        button(screen, "Diagnostics", function () {
            visit(function () {
                viewGeneration += 1;
                clear(screen);
                screen.appendChild(element("h2", "", "Diagnostics"));
                screen.appendChild(element("p", "help-text",
                    "AVPlay: " + (window.webapis && window.webapis.avplay ? "available (formats unverified)" : "unavailable") +
                    ". Model support is not certified. Account tokens, server origins, titles and queries are not logged or uploaded."));
                button(screen, "Back", backView);
                focusFirst();
            });
        });
        button(screen, "Sign out", signOut);
        button(screen, "Back", backView);
        restoreView = openSettings;
        setStatus("Unknown codec capabilities use server transcoding, not guessed direct play.");
        focusFirst();
    }

    function moveFocus(direction, key) {
        var menu = document.getElementById("player-menu");
        var controls = Array.prototype.slice.call((menu || screen).querySelectorAll("button, input, select")).filter(function (node) {
            return !node.disabled;
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
        var editing = active && ((active.tagName === "INPUT" && active.type !== "checkbox") || active.tagName === "TEXTAREA");
        if (key === 13 && event.repeat) { event.preventDefault(); return; }
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
            if (menu) { menu.parentNode.removeChild(menu); focusFirst(); return; }
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
        } else if (key === 13 && active && active.tagName === "BUTTON") {
            event.preventDefault();
            active.click();
        }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", function () {
        if (document.hidden && player) {
            try {
                if (player.snapshot().state === "playing") { player.pause().catch(showPlayerError); }
            } catch (error) { showPlayerError(error); }
        }
    });
    if (window.tizen && window.tizen.tvinputdevice) {
        try {
            ["MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop", "MediaFastForward", "MediaRewind"].forEach(function (name) {
                window.tizen.tvinputdevice.registerKey(name);
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
