(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexSubtitleSearch = api; }
}(this, function () {
    "use strict";

    // ISO 639-2 (bibliographic and terminology) to ISO 639-1, generated from LANG_SPELLINGS in
    // rust-modules/data/src/metadata.rs (Debian iso-codes). PMS answers a 3-letter search language
    // with HTTP 500 (docs/pms-api.md section 8), so only a 2-letter code is ever sent.
    var THREE_TO_TWO = "aaraa abkab afraf akaak amham araar argan asmas avaav aveae aymay azeaz bakba bambm belbe benbn bisbi bodbo tibbo bosbs brebr bulbg catca cescs czecs chach chece chucu chvcv corkw cosco crecr cymcy welcy danda deude gerde divdv dzodz ellel greel engen epoeo estet euseu baqeu eweee faofo fasfa perfa fijfj finfi frafr frefr fryfy fulff glagd glega glggl glvgv grngn gujgu hatht hauha hebhe herhz hinhi hmoho hrvhr scrhr hunhu hyehy armhy iboig idoio iiiii ikuiu ileie inaia indid ipkik islis iceis itait javjv jpnja kalkl kankn kasks katka geoka kaukr kazkk khmkm kikki kinrw kirky komkv konkg korko kuakj kurku laolo latla lavlv limli linln litlt ltzlb lublu luglg mahmh malml marmr mkdmk macmk mlgmg mltmt monmn mrimi maomi msams mayms myamy burmy nauna navnv nblnr ndend ndong nepne nldnl dutnl nnonn nobnb norno nyany ocioc ojioj orior ormom ossos panpa plipi polpl porpt pusps quequ rohrm ronro rumro runrn rusru sagsg sansa sinsi slksk slosk slvsl smese smosm snasn sndsd somso sotst spaes sqisq albsq srdsc srpsr sswss sunsu swasw swesv tahty tamta tattt telte tgktg tgltl thath tirti tonto tsntn tsots tuktk turtr twitw uigug ukruk urdur uzbuz venve vievi volvo wlnwa wolwo xhoxh yidyi yoryo zhaza zhozh chizh zulzu";

    function twoLetter(tag) {
        var primary = String(tag || "").replace(/^\s+|\s+$/g, "").split(/[-_]/)[0].toLowerCase();
        if (/^[a-z]{2}$/.test(primary)) { return primary; }
        if (!/^[a-z]{3}$/.test(primary)) { return null; }
        var at = (" " + THREE_TO_TWO).indexOf(" " + primary);
        return at === -1 ? null : THREE_TO_TWO.substr(at + 3, 2);
    }

    function streamsOf(item, stream) {
        var rows = [];
        (item && item.Media || []).forEach(function (media) {
            (media.Part || []).forEach(function (part) {
                (part.Stream || []).forEach(function (row) {
                    if (Number(row.streamType) === stream) { rows.push(row); }
                });
            });
        });
        return rows;
    }

    // The selected subtitle's language, then the selected audio's, then the app language.
    function defaultLanguage(part, appLanguage) {
        var picks = { 2: null, 3: null };
        (part && part.Stream || []).forEach(function (row) {
            var type = Number(row.streamType);
            if (row.selected && (type === 2 || type === 3) && !picks[type]) {
                picks[type] = twoLetter(row.languageCode || row.languageTag);
            }
        });
        return picks[3] || picks[2] || twoLetter(appLanguage) || "en";
    }

    // A candidate key is interpolated into a request path, so only the documented shape passes.
    function candidateKeyAllowed(key) {
        return typeof key === "string" && /^\/library\/streams\/[0-9]{1,20}(\.[A-Za-z0-9]{1,10})?$/.test(key);
    }

    function score(value) {
        var number = parseInt(String(value === undefined || value === null ? "" : value), 10);
        return isFinite(number) ? number : 0;
    }

    function hitsOf(container) {
        var rows = container && Array.isArray(container.Stream) ? container.Stream : [];
        var hits = [];
        rows.forEach(function (row, index) {
            if (!row || Number(row.streamType) !== 3 || !candidateKeyAllowed(row.key)) { return; }
            hits.push({
                key: row.key, title: String(row.title || row.displayTitle || ""),
                provider: String(row.providerTitle || ""), language: String(row.language || ""),
                codec: String(row.codec || ""), score: score(row.score), order: index,
                hearingImpaired: !!Number(row.hearingImpaired || 0), forced: !!Number(row.forced || 0)
            });
        });
        hits.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
        return hits;
    }

    function subtitleIds(item) {
        return streamsOf(item, 3).map(function (row) { return Number(row.id); }).filter(isFinite);
    }

    // Which stream a download installed: a new one titled like the pick, else the only new one,
    // else the newest new one. null means the install is unconfirmed, not failed.
    function identify(item, before, pickedTitle) {
        var fresh = streamsOf(item, 3).filter(function (row) {
            return before.indexOf(Number(row.id)) === -1 && row.key;
        });
        var titled = pickedTitle ? fresh.filter(function (row) { return row.title === pickedTitle; })[0] : null;
        if (titled) { return titled; }
        if (fresh.length === 1) { return fresh[0]; }
        return fresh.reduce(function (best, row) { return !best || Number(row.id) > Number(best.id) ? row : best; }, null);
    }

    function failure(error) {
        var status = error && error.status;
        if (status === 401 || status === 403) { return "denied"; }
        if (status === 404) { return "missing"; }
        if (error && error.code === "bad-language") { return "bad-language"; }
        return "transport";
    }

    // PUT, then poll the item until the installed stream appears. The stream ids are read before
    // the PUT so an existing subtitle is never mistaken for the new one. Resolves the stream row,
    // or null when nothing appeared within the bound (unconfirmed, not failed).
    function download(client, ratingKey, hit, options) {
        var attempts = options && options.attempts || 10;
        var wait = options && options.wait || function (ms) {
            return new Promise(function (resolve) { setTimeout(resolve, ms); });
        };
        var interval = options && options.interval !== undefined ? options.interval : 1500;
        var alive = options && options.alive || function () { return true; };
        var before;
        return client.getMetadata(ratingKey).then(function (item) {
            before = subtitleIds(item);
            return client.addSubtitle(ratingKey, hit.key);
        }).then(function () {
            function poll(left) {
                if (!left || !alive()) { return null; }
                return wait(interval).then(function () {
                    if (!alive()) { return null; }
                    return client.getMetadata(ratingKey);
                }).then(function (item) {
                    var installed = item && identify(item, before, hit.title);
                    return installed || poll(left - 1);
                });
            }
            return poll(attempts);
        });
    }

    return {
        download: download, twoLetter: twoLetter, defaultLanguage: defaultLanguage, candidateKeyAllowed: candidateKeyAllowed,
        hitsOf: hitsOf, subtitleIds: subtitleIds, identify: identify, failure: failure,
        POLL_ATTEMPTS: 10, POLL_INTERVAL_MS: 1500
    };
}));
