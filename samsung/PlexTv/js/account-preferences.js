/* Plex account audio and subtitle preferences (clients.plex.tv /api/v2/user/profile), matching
 * the LG client's Settings > Audio & subtitles. The language catalog is Plex Web's account picker,
 * copied verbatim from rust-modules/plex/src/plex/languages.rs (tests compare the two). */
(function (root) {
    "use strict";

    var LANGUAGES = [
        ["ab", "Abkhazian"],
        ["om", "Afaan Oromoo"],
        ["aa", "Afaraf"],
        ["af", "Afrikaans"],
        ["ak", "Akan"],
        ["am", "Amharic"],
        ["an", "Aragonés"],
        ["as", "Assamese"],
        ["ig", "Asụsụ Igbo"],
        ["gn", "Avañeʼẽ"],
        ["ae", "Avesta"],
        ["ay", "Aymar aru"],
        ["az", "Azərbaycan dili"],
        ["id", "Bahasa Indonesia"],
        ["ms", "Bahasa Melayu"],
        ["bm", "Bamanankan"],
        ["jv", "Basa Jawa"],
        ["su", "Basa Sunda"],
        ["bn", "Bengali"],
        ["bi", "Bislama"],
        ["bs", "Bosanski jezik"],
        ["br", "Brezhoneg"],
        ["my", "Burmese"],
        ["ca", "Català"],
        ["cs", "Čeština"],
        ["ch", "Chamoru"],
        ["ny", "ChiCheŵa"],
        ["sn", "ChiShona"],
        ["co", "Corsu"],
        ["cy", "Cymraeg"],
        ["da", "Dansk"],
        ["se", "Davvisámegiella"],
        ["de", "Deutsch"],
        ["nv", "Diné bizaad"],
        ["dv", "Divehi"],
        ["et", "Eesti"],
        ["na", "Ekakairũ Naoero"],
        ["en", "English"],
        ["en-GB", "English (UK)"],
        ["es", "Español"],
        ["eo", "Esperanto"],
        ["eu", "Euskara"],
        ["ee", "Eʋegbe"],
        ["to", "Faka Tonga"],
        ["fo", "Føroyskt"],
        ["fr", "Français"],
        ["fr-CA", "Français Canadien"],
        ["fy", "Frysk"],
        ["ff", "Fulfulde"],
        ["ga", "Gaeilge"],
        ["gv", "Gaelg"],
        ["sm", "Gagana faʻa Samoa"],
        ["gd", "Gàidhlig"],
        ["gl", "Galego"],
        ["ki", "Gĩkũyũ"],
        ["ho", "Hiri Motu"],
        ["hr", "Hrvatski"],
        ["io", "Ido"],
        ["rw", "Ikinyarwanda"],
        ["ia", "Interlingua"],
        ["ie", "Interlingue"],
        ["ik", "Iñupiaq"],
        ["nr", "IsiNdebele (North)"],
        ["nd", "IsiNdebele (South)"],
        ["xh", "IsiXhosa"],
        ["zu", "IsiZulu"],
        ["is", "Íslenska"],
        ["it", "Italiano"],
        ["mh", "Kajin M̧ajeļ"],
        ["kl", "Kalaallisut"],
        ["kr", "Kanuri"],
        ["kw", "Kernewek"],
        ["km", "Khmer"],
        ["kg", "KiKongo"],
        ["rn", "KiRundi"],
        ["sw", "Kiswahili"],
        ["ht", "Kreyòl ayisyen"],
        ["kj", "Kuanyama"],
        ["ku", "Kurdî"],
        ["lo", "Lao"],
        ["la", "Latine"],
        ["lv", "Latviešu valoda"],
        ["lb", "Lëtzebuergesch"],
        ["lt", "Lietuvių kalba"],
        ["li", "Limburgs"],
        ["ln", "Lingála"],
        ["lu", "Luba-Katanga"],
        ["lg", "Luganda"],
        ["hu", "Magyar"],
        ["mg", "Malagasy fiteny"],
        ["ml", "Malayalam"],
        ["mt", "Malti"],
        ["mo", "Moldavian"],
        ["nl", "Nederlands"],
        ["no", "Norsk"],
        ["nb", "Norsk bokmål"],
        ["nn", "Norsk nynorsk"],
        ["oc", "Occitan"],
        ["uz", "Oʻzbek"],
        ["oj", "Ojibwe"],
        ["or", "Oriya"],
        ["hz", "Otjiherero"],
        ["ng", "Owambo"],
        ["pl", "Polski"],
        ["pt", "Português"],
        ["pb", "Português (Brasil) [deprecated]"],
        ["pt-BR", "Português Brasileiro"],
        ["ty", "Reo Tahiti"],
        ["ro", "Română"],
        ["rm", "Rumantsch grischun"],
        ["qu", "Runa Simi"],
        ["sc", "Sardu"],
        ["za", "Saɯ cueŋƅ"],
        ["st", "Sesotho"],
        ["tn", "Setswana"],
        ["sq", "Shqip"],
        ["si", "Sinhala"],
        ["ss", "SiSwati"],
        ["sk", "Slovenčina"],
        ["sl", "Slovenščina"],
        ["so", "Soomaaliga"],
        ["fi", "Suomeksi"],
        ["sv", "Svenska"],
        ["mi", "Te reo Māori"],
        ["te", "Telugu"],
        ["vi", "Tiếng Việt"],
        ["ti", "Tigrinya"],
        ["ve", "Tshivenḓa"],
        ["tr", "Türkçe"],
        ["tk", "Türkmen"],
        ["tw", "Twi"],
        ["ug", "Uyƣurqə"],
        ["vo", "Volapük"],
        ["fj", "Vosa Vakaviti"],
        ["wa", "Walon"],
        ["tl", "Wikang Tagalog"],
        ["wo", "Wollof"],
        ["ts", "Xitsonga"],
        ["sg", "Yângâ tî sängö"],
        ["yo", "Yorùbá"],
        ["el", "Ελληνικά"],
        ["av", "авар мацӀ"],
        ["ba", "башҡорт теле"],
        ["be", "Беларуская"],
        ["bg", "български език"],
        ["os", "ирон æвзаг"],
        ["kv", "коми кыв"],
        ["ky", "кыргыз тили"],
        ["kk", "Қазақ тілі"],
        ["mk", "македонски јазик"],
        ["mn", "монгол"],
        ["ce", "нохчийн мотт"],
        ["ru", "русский язык"],
        ["sr", "српски језик"],
        ["tt", "татарча"],
        ["tg", "тоҷикӣ"],
        ["uk", "українська"],
        ["cv", "чӑваш чӗлхи"],
        ["cu", "ѩзыкъ словѣньскъ"],
        ["ka", "ქართული"],
        ["hy", "Հայերեն"],
        ["yi", "ייִדיש"],
        ["he", "עברית"],
        ["ur", "اردو"],
        ["ar", "العربية"],
        ["ps", "پښتو"],
        ["fa", "فارسی"],
        ["ha", "هَوُسَ"],
        ["ks", "कश्मीरी"],
        ["ne", "नेपाली"],
        ["pi", "पाऴि"],
        ["bh", "भोजपुरी"],
        ["mr", "मराठी"],
        ["sa", "संस्कृतम्"],
        ["sd", "सिन्धी"],
        ["hi", "हिन्दी"],
        ["pa", "ਪੰਜਾਬੀ"],
        ["gu", "ગુજરાતી"],
        ["ta", "தமிழ்"],
        ["kn", "ಕನ್ನಡ"],
        ["th", "ไทย"],
        ["bo", "བོད་ཡིག"],
        ["dz", "རྫོང་ཁ"],
        ["iu", "ᐃᓄᒃᑎᑐᑦ"],
        ["cr", "ᓀᐦᐃᔭᐍᐏᐣ"],
        ["ko", "한국어"],
        ["ii", "ꆈꌠ꒿ Nuosuhxop"],
        ["zh", "中文"],
        ["ja", "日本語"],
        ["zh-TW", "臺語"]
    ];
    var DEPRECATED = { pb: "pt-BR" };
    var SUBTITLE_MODES = [0, 1, 2];
    var FORCED_MODES = [0, 1, 2, 3];

    function canonical(code) {
        return Object.prototype.hasOwnProperty.call(DEPRECATED, code) ? DEPRECATED[code] : code;
    }

    function picker() {
        return LANGUAGES.filter(function (language) { return canonical(language[0]) === language[0]; })
            .map(function (language) { return { code: language[0], name: language[1] }; });
    }

    function label(code) {
        code = canonical(code);
        var match = LANGUAGES.filter(function (language) { return language[0] === code; })[0];
        return match ? match[1] : code;
    }

    function cleanLanguage(value) {
        if (value === null || value === undefined) { return null; }
        var text = String(value).trim();
        return text && text !== "-1" ? text : null;
    }

    function softInteger(value) {
        if (typeof value === "number" && isFinite(value)) { return Math.floor(value); }
        if (typeof value === "string" && /^-?\d+$/.test(value.trim())) { return parseInt(value, 10); }
        return null;
    }

    function softBoolean(value) {
        if (value === true || value === 1 || value === "1" || value === "true") { return true; }
        if (value === false || value === 0 || value === "0" || value === "false") { return false; }
        return null;
    }

    /* The profile JSON is either the bare object or wrapped in { profile: {...} }. */
    function parse(payload) {
        if (!payload || typeof payload !== "object") { throw new Error("Plex returned invalid account preferences."); }
        var profile = payload.profile && typeof payload.profile === "object" ? payload.profile : payload;
        var mode = softInteger(profile.autoSelectSubtitle !== undefined ? profile.autoSelectSubtitle : profile.subtitleMode);
        var forced = softInteger(profile.defaultSubtitleForced !== undefined ? profile.defaultSubtitleForced : profile.subtitleForced);
        return {
            autoSelectAudio: softBoolean(profile.autoSelectAudio),
            audioLanguage: cleanLanguage(profile.defaultAudioLanguage),
            subtitleLanguage: cleanLanguage(profile.defaultSubtitleLanguage),
            subtitleMode: SUBTITLE_MODES.indexOf(mode) === -1 ? 0 : mode,
            subtitleForced: FORCED_MODES.indexOf(forced) === -1 ? 0 : forced
        };
    }

    /* Returns { query, next }. Only changed values are sent. Like Plex Web and the LG client,
     * choosing any audio language (including Original) turns automatic audio selection on. */
    function update(previous, change) {
        if (change.subtitleMode !== undefined && SUBTITLE_MODES.indexOf(change.subtitleMode) === -1 ||
                change.subtitleForced !== undefined && FORCED_MODES.indexOf(change.subtitleForced) === -1) {
            throw new Error("Invalid account preference.");
        }
        ["audioLanguage", "subtitleLanguage"].forEach(function (key) {
            if (change[key] !== undefined && (typeof change[key] !== "string" || !/^([a-z]{2}(-[A-Za-z0-9]{2,3})?)?$/.test(change[key]))) {
                throw new Error("Invalid account preference.");
            }
        });
        var next = {
            autoSelectAudio: previous.autoSelectAudio, audioLanguage: previous.audioLanguage,
            subtitleLanguage: previous.subtitleLanguage, subtitleMode: previous.subtitleMode,
            subtitleForced: previous.subtitleForced
        };
        var query = {};
        if (change.audioLanguage !== undefined) {
            if (previous.autoSelectAudio !== true) { query.autoSelectAudio = "true"; }
            next.autoSelectAudio = true;
        }
        [["audioLanguage", "defaultAudioLanguage"], ["subtitleLanguage", "defaultSubtitleLanguage"]].forEach(function (pair) {
            var value = change[pair[0]];
            if (value === undefined) { return; }
            if ((previous[pair[0]] || "") !== value) { query[pair[1]] = value; }
            next[pair[0]] = value || null;
        });
        [["subtitleMode", "autoSelectSubtitle"], ["subtitleForced", "defaultSubtitleForced"]].forEach(function (pair) {
            var value = change[pair[0]];
            if (value === undefined) { return; }
            if (previous[pair[0]] !== value) { query[pair[1]] = String(value); }
            next[pair[0]] = value;
        });
        return { query: query, next: next };
    }

    var api = {
        LANGUAGES: LANGUAGES, SUBTITLE_MODES: SUBTITLE_MODES, FORCED_MODES: FORCED_MODES,
        canonical: canonical, picker: picker, label: label, parse: parse, update: update
    };
    if (typeof module !== "undefined" && module.exports) { module.exports = api; }
    else { root.PlexAccountPreferences = api; }
}(this));
