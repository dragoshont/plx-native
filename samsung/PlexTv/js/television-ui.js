(function (root) {
    "use strict";
    root.PlexTelevisionUi = {
        create: function (options) {
            function openTelevision() {
                var generation = options.view("Live TV and DVR", openTelevision, "television");
                var api = root.PlexTelevision.create(options.client());
                var navigation = options.group(options.screen, "", "page-toolbar");
                options.button(navigation, "Scheduled recordings", function () { options.visit(function () { openRecordings(false); }); });
                options.button(navigation, "Recording subscriptions", function () { options.visit(function () { openRecordings(true); }); });
                api.providers().then(function (providers) {
                    if (generation !== options.generation()) { return; }
                    var guides = options.group(options.screen, options.translate("Live TV guide"), "selection-list");
                    providers.forEach(function (provider) {
                        options.button(guides, provider.title || provider.identifier, function () {
                            options.visit(function () { openGuide(provider); });
                        });
                    });
                    options.status(providers.length ? "Choose a guide or manage recordings." :
                        "This server advertises no Live TV provider. Configure a supported tuner and check this profile's permissions in Plex.");
                    options.focus();
                }).catch(function (error) { if (generation === options.generation()) { options.status(error.message, true); } });
            }

            function openGuide(provider) {
                var generation = options.view("Live TV guide", function () { openGuide(provider); }, "guide");
                var api = root.PlexTelevision.create(options.client());
                api.browse("/" + provider.identifier + "/hubs/discover", 0).then(function (container) {
                    if (generation !== options.generation()) { return; }
                    var count = 0;
                    (container.Hub || []).slice(0, 20).forEach(function (hub) {
                        var programs = options.group(options.screen, hub.title || "Programs", "guide-list");
                        (hub.Metadata || []).slice(0, 200 - count).forEach(function (program) {
                            count += 1;
                            options.tile(programs, program, function () {
                                options.visit(function () { openProgram(program, provider); });
                            }, options.client());
                        });
                    });
                    options.status(count ? "Choose a program to inspect recording options." : "No guide programs were returned.");
                    options.focus();
                }).catch(function (error) { if (generation === options.generation()) { options.status(error.message, true); } });
                options.button(options.screen, "Channel lineups", function () {
                    options.visit(function openLineups() {
                        var own = options.view("Channel lineups", openLineups, "lineups");
                        api.dvrs().then(function (dvrs) {
                            if (own !== options.generation()) { return; }
                            dvrs.slice(0, 50).forEach(function (dvr) {
                                if (!dvr.lineup) { return; }
                                options.button(options.screen, dvr.lineup, function () {
                                    options.visit(function openChannels() {
                                        var channelGeneration = options.view("Channels", openChannels, "channels");
                                        api.channels(dvr.lineup).then(function (channels) {
                                            if (channelGeneration !== options.generation()) { return; }
                                            channels.slice(0, 200).forEach(function (channel) {
                                                options.screen.appendChild(options.element("p", "channel-row", (channel.identifier || "") + " / " + (channel.callSign || "")));
                                            });
                                            options.status(channels.length ? "Channel list supplied by Plex. Live tuning requires a verified playback-session contract." : "No available items in this view.");
                                            options.focus();
                                        }).catch(function (error) {
                                            if (channelGeneration === options.generation()) { options.status(error.message, true); }
                                        });
                                    });
                                });
                            });
                            options.status(dvrs.some(function (dvr) { return !!dvr.lineup; }) ? "Choose an existing DVR lineup. Tuner setup remains in Plex." : "No available items in this view.");
                            options.focus();
                        }).catch(function (error) { if (own === options.generation()) { options.status(error.message, true); } });
                    });
                });
            }

            function openProgram(program, provider) {
                var generation = options.view("Program", function () { openProgram(program, provider); }, "program");
                options.screen.appendChild(options.element("h3", "", program.grandparentTitle || program.title || "Program"));
                options.screen.appendChild(options.element("p", "synopsis", program.summary || ""));
                (program.Media || []).slice(0, 20).forEach(function (media) {
                    options.screen.appendChild(options.element("p", "", (media.channelTitle || "") + " / " +
                        (media.beginsAt ? new Date(Number(media.beginsAt) * 1000).toLocaleString(options.preferences().language) : "")));
                    if (media.gridKey && (provider.Feature || []).some(function (feature) { return feature.type === "grid"; })) {
                        options.button(options.screen, options.translate("Channel schedule / {channel}", { channel: media.channelTitle || media.gridKey }),
                            function () { options.visit(function () { openChannel(provider, media); }); });
                    }
                });
                var api = root.PlexTelevision.create(options.client());
                if (!(provider.Feature || []).some(function (feature) {
                    return feature.type === "subscribe" && feature.flavor === "record";
                })) {
                    options.status("This provider does not advertise recording permission for this profile.");
                    return;
                }
                api.templates(program.guid).then(function (templates) {
                    if (generation !== options.generation()) { return; }
                    templates.slice(0, 20).forEach(function (template) {
                        options.button(options.screen, options.translate("Record / {title}", { title: template.title || options.translate("Program") }), function () {
                            options.visit(function openDestination() {
                                var own = options.view("Schedule recording", openDestination, "recording-destination");
                                options.client().getSections().then(function (sections) {
                                    if (own !== options.generation()) { return; }
                                    sections.filter(function (section) {
                                        return section.type === (Number(template.type) === 1 ? "movie" : "show");
                                    })
                                        .forEach(function (section) {
                                            options.button(options.screen, section.title || "Library", function () {
                                                options.confirm("Schedule recording", function () { return api.record(template, section.key); },
                                                    function () { openRecordings(true); });
                                            });
                                        });
                                    options.status("Choose the destination library. Scheduling requires explicit confirmation.");
                                    options.focus();
                                }).catch(function (error) { if (own === options.generation()) { options.status(error.message, true); } });
                            });
                        });
                    });
                    options.status(templates.length ? "Recording options supplied by Plex; nothing has been scheduled." :
                        "No recording options are available for this program.");
                    options.focus();
                }).catch(function (error) { if (generation === options.generation()) { options.status(error.message, true); } });
            }

            function openChannel(provider, media, date) {
                var now = new Date();
                date = date || now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2) + "-" + ("0" + now.getDate()).slice(-2);
                var generation = options.view("Channel schedule", function () { openChannel(provider, media, date); }, "channel-schedule");
                var input = options.element("input", "remote-input");
                input.type = "date"; input.value = date;
                input.setAttribute("aria-label", options.translate("Guide date"));
                options.screen.appendChild(input);
                options.button(options.screen, "Load guide date", function () { openChannel(provider, media, input.value); });
                root.PlexTelevision.create(options.client()).grid(provider, String(media.gridKey), date).then(function (programs) {
                    if (generation !== options.generation()) { return; }
                    var list = options.group(options.screen, "", "guide-list");
                    programs.slice(0, 200).forEach(function (program) {
                        options.tile(list, program, function () {
                            options.visit(function () { openProgram(program, provider); });
                        }, options.client());
                    });
                    options.status(programs.length ? "Guide times and programs are supplied by Plex." : "No guide programs were returned.");
                    options.focus();
                }).catch(function (error) {
                    if (generation === options.generation()) { options.status(error.message, true); }
                });
                options.focus();
            }

            function openRecordings(subscriptions) {
                var generation = options.view(subscriptions ? "Recording subscriptions" : "Scheduled recordings",
                    function () { openRecordings(subscriptions); }, "recordings");
                var api = root.PlexTelevision.create(options.client());
                (subscriptions ? api.subscriptions() : api.scheduled()).then(function (items) {
                    if (generation !== options.generation()) { return; }
                    items.slice(0, 200).forEach(function (item) {
                        var recording = options.group(options.screen, item.title || item.Metadata && item.Metadata.title || "Recording", "recording-row");
                        recording.appendChild(options.element("p", "detail-meta", String(item.status || "")));
                        if (!subscriptions) { return; }
                        options.button(recording, "Cancel recording subscription", function () {
                            options.confirm("Cancel recording subscription", function () { return api.remove(item.key); },
                                function () { openRecordings(true); });
                        });
                        options.button(recording, "Recording preferences", function () {
                            options.visit(function openRecordingPreferences() {
                                options.view("Recording preferences", openRecordingPreferences, "recording-preferences");
                                var fields = [];
                                (item.Setting || []).filter(function (setting) { return !setting.hidden; }).slice(0, 50)
                                    .forEach(function (setting) {
                                        var label = options.element("label", "setting-row", setting.label || setting.id);
                                        var choices = setting.enumValues ? String(setting.enumValues).split("|").map(function (value) {
                                            var split = value.indexOf(":");
                                            return { value: value.slice(0, split), label: value.slice(split + 1) };
                                        }) : setting.type === "bool" ? [
                                            { value: "false", label: options.translate("Off") }, { value: "true", label: options.translate("On") }
                                        ] : [];
                                        var input = options.element(choices.length ? "select" : "input");
                                        choices.forEach(function (choice) {
                                            var option = options.element("option", "", choice.label);
                                            option.value = choice.value; input.appendChild(option);
                                        });
                                        if (!choices.length && setting.type === "int") { input.type = "number"; input.step = "1"; }
                                        input.value = String(setting.value === undefined ? setting.default : setting.value);
                                        if (choices.length && !input.value) { input.value = choices[0].value; }
                                        label.appendChild(input); options.screen.appendChild(label);
                                        fields.push({ id: setting.id, type: setting.type, input: input });
                                    });
                                options.button(options.screen, "Save recording preferences", function () {
                                    var values;
                                    try {
                                        values = fields.map(function (field) {
                                            if (field.type === "int" && !/^-?[0-9]+$/.test(field.input.value)) {
                                                throw new Error("Recording preferences require whole numbers.");
                                            }
                                            return { id: field.id, value: field.input.value };
                                        });
                                    } catch (error) { options.status(error.message, true); return; }
                                    options.confirm("Save recording preferences", function () { return api.edit(item.key, values); },
                                        function () { openRecordings(true); });
                                });
                                options.status("Plex supplies these preferences. Changes require confirmation.");
                                options.focus();
                            });
                        });
                    });
                    options.status(items.length > 200 ? "Showing the first 200 recordings." :
                        items.length ? "Recording status supplied by Plex. Conflicts are not automatically changed." : "No recordings were returned.");
                    options.focus();
                }).catch(function (error) { if (generation === options.generation()) { options.status(error.message, true); } });
            }

            return { open: openTelevision };
        }
    };
}(this));
