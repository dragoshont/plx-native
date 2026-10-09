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
    var accountClient = null;
    var servers = [];

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
        status.textContent = message || "";
        status.className = isError ? "status status-error" : "status";
    }

    function focusFirst() {
        var controls = screen.querySelectorAll("button, input");
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
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles();
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

    function button(parent, label, action) {
        var node = element("button", "secondary-button", label);
        node.type = "button";
        node.addEventListener("click", action);
        parent.appendChild(node);
        return node;
    }

    function openProfiles() {
        var generation = ++viewGeneration;
        clear(screen);
        screen.appendChild(element("h2", "", "Who is watching?"));
        setStatus("Loading Plex Home profiles...");
        accountClient.getProfiles().then(function (profiles) {
            if (generation !== viewGeneration) { return; }
            profiles.forEach(function (profile) {
                button(screen, profile.title || profile.username || "Profile", function () {
                    clear(screen);
                    screen.appendChild(element("h2", "", profile.title || "Profile"));
                    var pin = element("input", "remote-input");
                    pin.type = "password";
                    pin.maxLength = 4;
                    pin.setAttribute("aria-label", "Profile PIN");
                    if (profile.protected) { screen.appendChild(pin); }
                    button(screen, "Use this profile", function () {
                        setStatus("Switching profile...");
                        accountClient.switchProfile(profile.uuid, profile.protected ? pin.value : "")
                            .then(function (token) {
                                accountClient = window.PlexApi.createAccountClient({ token: token });
                                openServers();
                            }).catch(function (error) { setStatus(error.message, true); });
                    });
                    button(screen, "Back to profiles", openProfiles);
                    focusFirst();
                });
            });
            button(screen, "Use linked account", openServers);
            button(screen, "Sign out", signOut);
            setStatus("Select the Plex identity to use. Credentials stay in memory.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry profiles", openProfiles);
            button(screen, "Use linked account", openServers);
            button(screen, "Sign out", signOut);
            setStatus(error.message, true);
            focusFirst();
        });
    }

    function signOut() {
        stopAuthorization();
        accountToken = "";
        accountClient = null;
        servers = [];
        currentClient = null;
        addConnectForm("");
    }

    function openServers() {
        var generation = ++viewGeneration;
        clear(screen);
        screen.appendChild(element("h2", "", "Choose a server"));
        setStatus("Discovering your Plex Media Servers...");
        accountClient.getServers().then(function (result) {
            if (generation !== viewGeneration) { return; }
            servers = result;
            if (!servers.length) {
                screen.appendChild(element("p", "empty-state", "No Plex servers are shared with this identity."));
            }
            servers.forEach(function (server) {
                button(screen, server.name + (server.owned ? " (owned)" : " (shared)"), function () {
                    var selection = ++viewGeneration;
                    var index = 0;
                    function probe() {
                        if (selection !== viewGeneration) { return; }
                        if (index >= server.connections.length || !server.token) {
                            setStatus("This server has no reachable secure connection. Check PMS and retry.", true);
                            return;
                        }
                        var connection = server.connections[index++];
                        var candidate = window.PlexApi.createClient({ baseUrl: connection.uri, token: server.token });
                        setStatus(connection.relay ? "Trying the Plex relay..." : "Connecting securely...");
                        candidate.identity().then(function (identity) {
                            if (selection !== viewGeneration) { return; }
                            if (identity.machineIdentifier !== server.id) {
                                setStatus("Server identity mismatch. This connection was not authorized.", true);
                                return;
                            }
                            currentClient = candidate;
                            loadHome(false);
                        }).catch(function (error) {
                            if (selection !== viewGeneration) { return; }
                            if (error.status === 401 || error.status === 403) {
                                setStatus("Plex refused access to this server. Re-select your profile or sign in again.", true);
                            } else { probe(); }
                        });
                    }
                    probe();
                });
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
        section.appendChild(element("h2", "", "Connect to a Plex Media Server"));
        section.appendChild(element("p", "help-text",
            "Sign in to Plex with a temporary device code, or connect directly to a test server."));

        var authPanel = element("div", "auth-panel");
        authPanel.appendChild(element("h3", "", "Plex device sign-in"));
        var authInfo = element("div", "auth-info", "No Plex account is linked.");
        authPanel.appendChild(authInfo);
        var signIn = element("button", "secondary-button", "Sign in to Plex");
        signIn.type = "button";
        signIn.addEventListener("click", function () {
            beginAuthorization(authInfo);
        });
        authPanel.appendChild(signIn);
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
        viewGeneration += 1;
        itemsLoading = false;
        Promise.all([
            currentClient.getSections(),
            currentClient.getHomeHubs()
        ]).then(function (result) {
            renderHome(result[0], result[1]);
        }).catch(function (error) {
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
        currentSection = null;
        screen.appendChild(element("h2", "", "Home"));

        var sectionPanel = element("section", "content-panel");
        addSectionHeading(sectionPanel, "Libraries");
        if (!sections.length) {
            sectionPanel.appendChild(element("p", "empty-state", "No libraries were returned by this server."));
        }
        sections.forEach(function (section) {
            var button = element("button", "library-button", section.title || "Untitled library");
            button.type = "button";
            button.addEventListener("click", function () {
                openSection(section);
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
            var hubSection = element("section", "hub");
            hubSection.appendChild(element("h3", "hub-title", hub.title || "Plex shelf"));
            var metadata = Array.isArray(hub.Metadata) ? hub.Metadata : [];
            metadata.slice(0, 8).forEach(function (item) {
                hubSection.appendChild(element("p", "hub-item", item.title || "Untitled item"));
            });
            hubPanel.appendChild(hubSection);
        });
        screen.appendChild(hubPanel);

        var disconnect = element("button", "secondary-button", "Change server");
        disconnect.type = "button";
        disconnect.addEventListener("click", function () {
            currentClient = null;
            accountToken = "";
            addConnectForm("");
        });
        screen.appendChild(disconnect);
        setStatus("Connected. Browsing is read-only in this development slice.");
        focusFirst();
    }

    function openSection(section) {
        viewGeneration += 1;
        itemsLoading = false;
        currentSection = section;
        currentItems = [];
        currentOffset = 0;
        clear(screen);
        screen.appendChild(element("h2", "", section.title || "Library"));
        var list = element("div", "item-list");
        list.id = "item-list";
        screen.appendChild(list);
        var loadMore = element("button", "secondary-button", "Load more");
        loadMore.type = "button";
        loadMore.id = "load-more";
        loadMore.addEventListener("click", loadNextPage);
        screen.appendChild(loadMore);
        var back = element("button", "secondary-button", "Back to Home");
        back.type = "button";
        back.id = "home-back";
        back.addEventListener("click", function () {
            loadHome(false);
        });
        screen.appendChild(back);
        focusFirst();
        loadNextPage();
    }

    function loadNextPage() {
        if (!currentClient || !currentSection || itemsLoading) {
            return;
        }
        var generation = viewGeneration;
        var section = currentSection;
        itemsLoading = true;
        setStatus("Loading library items…");
        currentClient.getSectionItems(section.key, currentOffset, 50).then(function (page) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            currentItems = currentItems.concat(page.items);
            currentOffset = page.offset + page.items.length;
            var list = document.getElementById("item-list");
            page.items.forEach(function (item) {
                var row = element("button", "item-row", item.title || "Untitled item");
                row.type = "button";
                row.addEventListener("click", function () {
                    setStatus("Media details are not implemented in this development slice.");
                });
                list.appendChild(row);
            });
            var loadMore = document.getElementById("load-more");
            loadMore.disabled = currentOffset >= page.totalSize || page.items.length === 0;
            if (loadMore.disabled && document.activeElement === loadMore) {
                document.getElementById("home-back").focus();
            }
            setStatus(currentItems.length + " of " + page.totalSize + " items loaded.");
        }).catch(function (error) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            setStatus(error.message, true);
        });
    }

    function moveFocus(direction) {
        var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input"));
        var active = document.activeElement;
        var index = controls.indexOf(active);
        if (!controls.length) {
            return;
        }
        if (index < 0) {
            controls[0].focus();
            return;
        }
        var next = (index + direction + controls.length) % controls.length;
        controls[next].focus();
    }

    function onKeyDown(event) {
        var key = event.keyCode;
        var active = document.activeElement;
        var editing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
        if (key === 10009 || key === 27 || key === 8) {
            if (currentSection) {
                event.preventDefault();
                loadHome(false);
            }
            return;
        }
        if (editing && (key === 37 || key === 39)) {
            return;
        }
        if (key === 38) {
            event.preventDefault();
            moveFocus(-1);
        } else if (key === 40) {
            event.preventDefault();
            moveFocus(1);
        } else if (key === 37) {
            event.preventDefault();
            moveFocus(-1);
        } else if (key === 39) {
            event.preventDefault();
            moveFocus(1);
        } else if (key === 13 && active && active.tagName === "BUTTON") {
            event.preventDefault();
            active.click();
        }
    }

    document.addEventListener("keydown", onKeyDown);
    addConnectForm("");
}());
