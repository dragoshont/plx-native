'use strict';

// Read-only, allowlisted remote navigation for the Plex Tizen app. There is no arbitrary
// evaluation: the only expression sent is STATE below, and keys go through Input.dispatchKeyEvent.
// OK is refused unless the focused control is on an explicit browse-only allowlist.
const { InspectorError } = require('./client');

const KEYS = Object.freeze({ up: 38, down: 40, left: 37, right: 39, ok: 13, back: 10009 });

// Runs on Chrome 47 (ES5). Media titles are never returned; control labels are, for non-card
// controls only, because navigation cannot be guarded without them.
const STATE = '(' + function () {
    function label(node) {
        var text = node.getAttribute && node.getAttribute('aria-label');
        if (!text) text = (node.textContent || '').replace(/\s+/g, ' ');
        return text.replace(/^\s+|\s+$/g, '').slice(0, 48);
    }
    function within(node, pattern) {
        for (var cursor = node; cursor && cursor !== document.body; cursor = cursor.parentNode) {
            if (pattern.test(cursor.className || '')) return true;
        }
        return false;
    }
    var screen = document.querySelector('.screen');
    var active = document.activeElement;
    var preference = 'unset';
    try {
        var stored = window.localStorage.getItem('plx-tizen-preferences');
        if (stored) {
            var parsed = JSON.parse(stored);
            preference = parsed && parsed.continueAction === 'play' ? 'play' :
                parsed && (parsed.continueAction === 'details' || parsed.continueAction === undefined) ? 'details' : 'invalid';
        }
    } catch (error) { preference = 'invalid'; }
    var result = {
        screen: screen ? String(screen.className || '').slice(0, 80) : '',
        menu: !!document.getElementById('player-menu'),
        player: !!document.querySelector('.player-hud'),
        continueAction: preference,
        active: { kind: 'none' }
    };
    if (active && active !== document.body) {
        var card = active.plexCard;
        var box = active.getBoundingClientRect();
        result.active = {
            kind: card ? 'card' : active.tagName === 'BUTTON' ? 'button' :
                /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName) ? 'input' : 'other',
            box: { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) },
            nav: within(active, /home-navigation/),
            row: within(active, /home-feature-actions/) ? 'feature' : within(active, /shelf-row/) ? 'shelf' :
                within(active, /detail-actions/) ? 'detail' : within(active, /player-menu/) ? 'menu' : 'other'
        };
        if (card) {
            result.active.cardType = String(card.item && card.item.type || '').slice(0, 16);
            result.active.ratingKey = String(card.item && card.item.ratingKey || '').slice(0, 16);
            result.active.deck = !!(card.options && card.options.deck);
        } else {
            result.active.label = label(active);
            result.active.choice = /(^| )server-choice( |$)/.test(active.className || '') ? 'server' :
                /(^| )identity-choice( |$)/.test(active.className || '') ? 'profile' : '';
            result.active.disabled = active.disabled === true;
        }
    }
    return result;
}.toString() + ')()';

// Labels whose activation only browses. Everything else is refused, including Play/Continue,
// trailers, watch state, watchlist, DVR, sign-out, profile switching and settings writes.
const BROWSE = new Set(['Open details', 'Next featured title', 'Read more', 'Read less', 'More', 'Back',
    'Back to Home', 'Home', 'Search', 'Settings', 'Account', 'Change profile', 'Close menu', 'Cancel',
    'Collections', 'All titles', 'Recently added', 'Load more', 'Next page', 'Previous page', 'Favorite libraries']);
const DENY = /play|continue|resume|start|trailer|watch|record|dvr|delete|remove|sign|shuffle|confirm|use this|reset|linked|server|rate|mark|queue|stop/i;
// Exact pre-Home routing controls that only read: "Use linked account" opens the server list
// without the profile-switch request, and a server choice only connects and loads Home.
const ROUTE = new Set(['Use linked account']);
// The one local-storage write this tool can make, and only when the caller passes the explicit
// `saveSignIn` opt-in: turning the owner's saved sign-in ON from the Settings screen. The "On"
// label (which forgets the saved sign-in) stays refused by the deny pattern.
const SAVE_SIGN_IN = 'Stay signed in on this TV: Off';
const PLAYABLE = new Set(['movie', 'episode', 'clip', 'track']);

function text(value, max) {
    return typeof value === 'string' && value.length <= max ? value : '';
}

function sanitizeState(value) {
    if (!value || typeof value !== 'object' || !value.active || typeof value.active !== 'object') {
        throw new InspectorError('invalid_state');
    }
    const active = value.active;
    const kind = ['none', 'card', 'button', 'input', 'other'].includes(active.kind) ? active.kind : 'other';
    const state = {
        screen: text(value.screen, 80).replace(/[^a-z0-9 _-]/gi, ''),
        menu: value.menu === true, player: value.player === true,
        continueAction: ['unset', 'details', 'play', 'invalid'].includes(value.continueAction) ? value.continueAction : 'invalid',
        active: { kind }
    };
    if (kind === 'none') return state;
    const box = active.box || {};
    state.active.box = ['x', 'y', 'width', 'height'].reduce((out, key) => {
        out[key] = Number.isFinite(box[key]) ? box[key] : null;
        return out;
    }, {});
    state.active.nav = active.nav === true;
    state.active.row = ['feature', 'shelf', 'detail', 'menu', 'other'].includes(active.row) ? active.row : 'other';
    if (kind === 'card') {
        state.active.cardType = text(active.cardType, 16).replace(/[^a-z]/g, '');
        state.active.ratingKey = /^\d{1,12}$/.test(active.ratingKey) ? active.ratingKey : '';
        state.active.deck = active.deck === true;
    } else {
        state.active.label = text(active.label, 48);
        state.active.choice = ['server', 'profile'].includes(active.choice) ? active.choice : '';
        state.active.disabled = active.disabled === true;
    }
    return state;
}

// Decides whether OK may be pressed on the observed focus. Returns null when allowed.
function refuseOk(state, ratingKey, { saveSignIn = false } = {}) {
    if (state.player) return 'player_active';
    const active = state.active;
    if (active.kind === 'card') {
        if (!ratingKey) return 'card_requires_rating_key';
        if (!active.ratingKey || active.ratingKey !== ratingKey) return 'rating_key_mismatch';
        if (state.menu) return 'card_in_menu';
        if (active.deck && PLAYABLE.has(active.cardType) &&
            !['details', 'unset'].includes(state.continueAction)) return 'deck_card_may_play';
        if (active.cardType === 'track') return 'track_card_may_play';
        return null;
    }
    if (ratingKey) return 'rating_key_given_for_non_card';
    if (active.kind !== 'button') return 'not_a_button';
    if (active.disabled) return 'control_disabled';
    // Selecting a profile leads to the switch request; never automate it.
    if (active.choice === 'profile') return 'profile_switch_refused';
    if (active.label === SAVE_SIGN_IN) {
        if (!saveSignIn) return 'save_sign_in_requires_opt_in';
        return state.screen === 'screen screen-settings' && !state.menu ? null : 'save_sign_in_outside_settings';
    }
    if (saveSignIn) return 'save_sign_in_option_mismatch';
    if (active.choice === 'server' && !state.menu) return null;
    if (ROUTE.has(active.label) && !state.menu) return null;
    if (DENY.test(active.label) && !BROWSE.has(active.label)) return 'denied_label';
    if (BROWSE.has(active.label)) return null;
    // Library and destination names in the Home navigation capsule only change the browsed library.
    if (active.nav && active.label && !state.menu) return null;
    return 'label_not_allowlisted';
}

async function readState(client) {
    const reply = await client.rpc('Runtime.evaluate', { expression: STATE, returnByValue: true });
    if (!reply || !reply.result || reply.wasThrown || reply.exceptionDetails) throw new InspectorError('state_unavailable');
    return sanitizeState(reply.result.value);
}

function same(a, b) {
    return JSON.stringify(a.active) === JSON.stringify(b.active) && a.screen === b.screen && a.menu === b.menu;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One guarded key press. OK requires the same allowed focus on two reads `stableMs` apart, so an
// asynchronous focus move cannot redirect it onto a refused control just before it is pressed.
async function press(client, name, { ratingKey, saveSignIn = false, stableMs = 250 } = {}) {
    if (!Object.hasOwn(KEYS, name)) throw new InspectorError('invalid_key');
    const before = await readState(client);
    if (name === 'ok') {
        const reason = refuseOk(before, ratingKey, { saveSignIn });
        if (reason) return { status: 'refused', key: name, reason, before };
        await sleep(stableMs);
        const again = await readState(client);
        if (!same(before, again)) return { status: 'refused', key: name, reason: 'focus_moved', before };
    } else if (ratingKey || saveSignIn) {
        throw new InspectorError('inapplicable_option');
    } else if (before.player) {
        return { status: 'refused', key: name, reason: 'player_active', before };
    }
    const code = KEYS[name];
    const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await client.rpc('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
    await client.rpc('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    return { status: 'pressed', key: name, before };
}

module.exports = { KEYS, STATE, BROWSE, SAVE_SIGN_IN, sanitizeState, refuseOk, readState, press };
