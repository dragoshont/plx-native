(function (root) {
    "use strict";
    root.PlexCatalogueUi = {
        create: function (options) {
            function account() {
                var client = options.account();
                if (!client) { throw new Error("Link a Plex account to use Watchlist and catalogue."); }
                return client;
            }
            function openWatchlist(filter, start) {
                filter = filter || "all";
                start = start || 0;
                var generation = options.view("Watchlist", function () { openWatchlist(filter, start); });
                ["all", "available", "released"].forEach(function (value) {
                    options.button(options.screen, options.translate("Watchlist filter / {filter}", {
                        filter: options.translate(value)
                    }), function () { openWatchlist(value, 0); });
                });
                var client;
                try { client = account(); }
                catch (error) { options.status(error.message, true); return; }
                client.watchlist(filter, start).then(function (container) {
                    if (generation !== options.generation()) { return; }
                    if (!Array.isArray(container.Metadata) && Number(container.size) !== 0) {
                        throw new Error("Plex returned an invalid Watchlist.");
                    }
                    var items = container.Metadata || [];
                    items.slice(0, 50).forEach(function (item) {
                        options.button(options.screen, item.title || options.translate("Untitled"), function () {
                            options.visit(function () { openItem(item, true); });
                        }, true);
                    });
                    if (start) {
                        options.button(options.screen, "Previous page", function () { openWatchlist(filter, Math.max(0, start - 50)); });
                    }
                    if (container.totalSize ? start + items.length < Number(container.totalSize) : items.length >= 50) {
                        options.button(options.screen, "Next page", function () { openWatchlist(filter, start + 50); });
                    }
                    options.status(items.length ? "Watchlist belongs to the linked Plex identity. Choose a title for availability." : "Your Watchlist is empty.");
                    options.focus();
                }).catch(function (error) {
                    if (generation !== options.generation()) { return; }
                    options.status(error.message, true);
                    options.button(options.screen, "Retry", function () { openWatchlist(filter, start); });
                });
            }
            function openItem(item, listed) {
                var generation = options.view("Catalogue details", function () { openItem(item, listed); });
                var title = options.element("h3", "", item.title || options.translate("Untitled"));
                var summary = options.element("p", "synopsis", item.summary || options.translate("No synopsis is available."));
                options.screen.appendChild(title);
                options.screen.appendChild(summary);
                if (item.year) { options.screen.appendChild(options.element("p", "", String(item.year))); }
                (listed === true ? [false] : listed === false ? [true] : [true, false]).forEach(function (add) {
                    options.button(options.screen, add ? "Add to Watchlist" : "Remove from Watchlist", function () {
                        var client;
                        try { client = account(); }
                        catch (error) { options.status(error.message, true); return; }
                        options.confirm(add ? "Add to Watchlist" : "Remove from Watchlist",
                            function () { return client.setWatchlist(item.guid, add); }, function () { openWatchlist("all", 0); });
                    });
                });
                options.button(options.screen, "Find in my libraries", function () {
                    options.visit(function () { options.find(item); });
                });
                options.status("Catalogue titles are not server media IDs. Licensed Plex streaming is not enabled; choose a matching server version.");
                options.focus();
                Promise.resolve().then(function () { return account().catalogueDetails(item); }).then(function (details) {
                    if (generation !== options.generation()) { return; }
                    title.textContent = details.title || item.title;
                    summary.textContent = details.summary || options.translate("No synopsis is available.");
                }).catch(function (error) {
                    if (generation !== options.generation()) { return; }
                    options.screen.appendChild(options.element("p", "inline-error", error.message));
                    options.button(options.screen, "Retry details", function () { openItem(item, listed); });
                });
            }
            function openSearch(query, run) {
                var generation = options.view("Plex catalogue", function () { openSearch(query, run); });
                var input = options.element("input", "remote-input");
                input.type = "search"; input.maxLength = 200; input.value = query || "";
                input.setAttribute("aria-label", options.translate("Search Plex catalogue"));
                options.screen.appendChild(input);
                function search() { openSearch(input.value, true); }
                options.button(options.screen, "Search", search);
                input.addEventListener("keydown", function (event) {
                    if (event.keyCode === 13) { event.preventDefault(); search(); }
                });
                options.focus();
                if (!run) { options.status("Search Plex metadata. Licensed catalogue streaming is not enabled."); return; }
                Promise.resolve().then(function () { return account().searchCatalogue(query); }).then(function (items) {
                    if (generation !== options.generation()) { return; }
                    items.forEach(function (item) {
                        options.button(options.screen, item.title || options.translate("Untitled"), function () {
                            options.visit(function () { openItem(item); });
                        }, true);
                    });
                    options.status(items.length ? "Showing up to 30 catalogue results. Refine the query for more." : "No matching media found.");
                    options.focus();
                }).catch(function (error) {
                    if (generation === options.generation()) { options.status(error.message, true); }
                });
            }
            return { watchlist: openWatchlist, item: openItem, search: openSearch };
        }
    };
}(this));
