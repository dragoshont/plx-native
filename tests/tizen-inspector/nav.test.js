'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fake } = require('./fake');
const { STATE, sanitizeState, refuseOk, press } = require('../../tools/tizen/inspector/nav');
const { options, run } = require('../../tools/tizen/inspector');

const button = (label, extra = {}) => ({ screen: 'screen screen-home', menu: false, player: false, continueAction: 'unset',
    active: { kind: 'button', label, nav: false, row: 'other', box: { x: 0, y: 0, width: 1, height: 1 }, ...extra } });
const card = (extra = {}, state = {}) => ({ screen: 'screen screen-home', menu: false, player: false, continueAction: 'unset',
    ...state, active: { kind: 'card', cardType: 'movie', ratingKey: '42', deck: false, nav: false, row: 'shelf',
        box: { x: 0, y: 0, width: 1, height: 1 }, ...extra } });

test('OK refuses every playback, account and state-changing control', () => {
    for (const label of ['Play', 'Continue', 'Resume from 10:00', 'Play trailer', 'Watched', 'Unwatched', 'Watchlist',
        'Live TV and DVR', 'Sign out', 'Delete saved sign-in', 'Shuffle / On or off', 'Use this profile', 'Confirm',
        'Reset preferences', 'Change server', 'Stop and return to details', 'Playback options', '']) {
        assert.notEqual(refuseOk(sanitizeState(button(label))), null, label);
        assert.notEqual(refuseOk(sanitizeState(button(label, { nav: true }))), null, 'nav ' + label);
    }
    assert.equal(refuseOk(sanitizeState(button('A profile name'))), 'label_not_allowlisted');
    assert.equal(refuseOk(sanitizeState({ ...button('Open details'), player: true })), 'player_active');
    assert.equal(refuseOk(sanitizeState({ ...button('Movies', { nav: true }), menu: true })), 'label_not_allowlisted');
    assert.equal(refuseOk(sanitizeState({ ...button('x'), active: { kind: 'input' } })), 'not_a_button');
});

test('OK allows browse-only buttons and library names in the Home capsule', () => {
    for (const label of ['Open details', 'Back', 'Home', 'Search', 'Settings', 'Read more', 'Next featured title']) {
        assert.equal(refuseOk(sanitizeState(button(label))), null, label);
    }
    assert.equal(refuseOk(sanitizeState(button('Movies', { nav: true }))), null);
    assert.equal(refuseOk(sanitizeState(button('Open details')), '42'), 'rating_key_given_for_non_card');
});

test('card OK needs the observed rating key and never a deck card that may play', () => {
    assert.equal(refuseOk(sanitizeState(card())), 'card_requires_rating_key');
    assert.equal(refuseOk(sanitizeState(card()), '41'), 'rating_key_mismatch');
    assert.equal(refuseOk(sanitizeState(card()), '42'), null);
    assert.equal(refuseOk(sanitizeState(card({ ratingKey: 'x' })), '42'), 'rating_key_mismatch');
    assert.equal(refuseOk(sanitizeState(card({ deck: true })), '42'), null);
    for (const action of ['play', 'invalid']) {
        for (const cardType of ['movie', 'episode', 'clip']) {
            assert.equal(refuseOk(sanitizeState(card({ deck: true, cardType }, { continueAction: action })), '42'),
                'deck_card_may_play', action + cardType);
        }
    }
    assert.equal(refuseOk(sanitizeState(card({ deck: true, cardType: 'season' }, { continueAction: 'play' })), '42'), null);
    assert.equal(refuseOk(sanitizeState(card({ cardType: 'track' })), '42'), 'track_card_may_play');
    assert.equal(refuseOk(sanitizeState(card({}, { menu: true })), '42'), 'card_in_menu');
});

test('state sanitizer drops unknown fields and card titles', () => {
    const state = sanitizeState({ ...card({ title: 'PRIVATE', label: 'PRIVATE' }), extra: 'PRIVATE', screen: 'screen<PRIVATE>' });
    assert.doesNotMatch(JSON.stringify(state), /PRIVATE>|title|extra/);
    assert.equal(state.active.label, undefined);
    assert.throws(() => sanitizeState({}), /invalid_state/);
    assert.equal(sanitizeState({ ...button('x'), continueAction: 'other' }).continueAction, 'invalid');
});

test('fixed state expression runs as old-engine script and reports focus without titles', () => {
    const item = { type: 'movie', ratingKey: 7, title: 'PRIVATE' };
    const active = { tagName: 'BUTTON', className: 'media-card', plexCard: { item, options: { deck: true } },
        getBoundingClientRect: () => ({ left: 1.4, top: 2, width: 3, height: 4 }),
        parentNode: { className: 'shelf-row', parentNode: null } };
    const document = { activeElement: active, body: {}, getElementById: () => null,
        querySelector: selector => selector === '.screen' ? { className: 'screen screen-home' } : null };
    const window = { localStorage: { getItem: () => JSON.stringify({ continueAction: 'play' }) } };
    const value = vm.runInNewContext(STATE, { document, window, JSON });
    const state = sanitizeState(value);
    assert.deepEqual(state.active, { kind: 'card', box: { x: 1, y: 2, width: 3, height: 4 }, nav: false, row: 'shelf',
        cardType: 'movie', ratingKey: '7', deck: true });
    assert.equal(state.continueAction, 'play');
    assert.doesNotMatch(JSON.stringify(value), /PRIVATE/);
});

function deviceState(states) {
    const sent = [];
    return { sent, handler: (request, reply) => {
        sent.push(request.method === 'Input.dispatchKeyEvent' ? request.params : request.method);
        if (request.method === 'Runtime.evaluate') {
            assert.equal(request.params.expression, STATE);
            reply({ result: { type: 'object', value: states.length > 1 ? states.shift() : states[0] } });
        } else reply({});
    } };
}

test('press dispatches a raw key pair and refuses without dispatch', async t => {
    const device = deviceState([button('Movies', { nav: true })]);
    const server = await fake(device.handler);
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    assert.equal((await press(client, 'down')).status, 'pressed');
    assert.deepEqual(device.sent.slice(1), [
        { type: 'rawKeyDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
        { type: 'keyUp', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 }]);
    device.sent.length = 0;
    const play = await fake(deviceState([button('Play')]).handler);
    t.after(() => play.close());
    const playClient = await play.connect();
    t.after(() => playClient.close());
    const refused = await press(playClient, 'ok', { stableMs: 1 });
    assert.equal(refused.status, 'refused');
    assert.equal(refused.reason, 'denied_label');
    assert.equal(play.requests.some(request => request.method === 'Input.dispatchKeyEvent'), false);
    await assert.rejects(press(client, 'menu'), /invalid_key/);
    await assert.rejects(press(client, 'down', { ratingKey: '1' }), /inapplicable_option/);
});

test('OK is refused when focus moves between the two guard reads', async t => {
    const device = deviceState([button('Open details'), button('Play')]);
    const server = await fake(device.handler);
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    const result = await press(client, 'ok', { stableMs: 1 });
    assert.equal(result.reason, 'focus_moved');
    assert.equal(server.requests.some(request => request.method === 'Input.dispatchKeyEvent'), false);
    const allowed = await fake(deviceState([card()]).handler);
    t.after(() => allowed.close());
    const allowedClient = await allowed.connect();
    t.after(() => allowedClient.close());
    assert.equal((await press(allowedClient, 'ok', { ratingKey: '42', stableMs: 1 })).status, 'pressed');
});

test('unanswered state read times out without dispatching', async t => {
    const server = await fake(() => {});
    t.after(() => server.close());
    const client = await server.connect(30);
    t.after(() => client.close());
    await assert.rejects(press(client, 'ok', { stableMs: 1 }), /timeout/);
    assert.equal(server.requests.some(request => request.method === 'Input.dispatchKeyEvent'), false);
});

test('CLI key options are validated and end-to-end refusal releases the lock', async t => {
    assert.throws(() => options(['key', '--endpoint', 'http://127.0.0.1:1']), /invalid_key/);
    assert.throws(() => options(['key', '--endpoint', 'http://127.0.0.1:1', '--key', 'menu']), /invalid_key/);
    assert.throws(() => options(['key', '--endpoint', 'http://127.0.0.1:1', '--key', 'ok', '--rating-key', 'x']), /invalid_option/);
    assert.throws(() => options(['state', '--endpoint', 'http://127.0.0.1:1', '--key', 'ok']), /inapplicable_option/);
    assert.equal(options(['key', '--endpoint', 'http://127.0.0.1:1', '--key', 'ok', '--rating-key', '42']).ratingKey, '42');
    const server = await fake(deviceState([button('Continue')]).handler);
    t.after(() => server.close());
    let released = false;
    const result = await run(options(['key', '--endpoint', server.endpoint, '--key', 'ok', '--timeout-ms', '1000']),
        () => () => { released = true; });
    assert.equal(result.status, 'refused');
    assert.equal(released, true);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
});

test('pre-Home routing allows only the linked account and enabled server choices, never a profile switch', () => {
    assert.equal(refuseOk(sanitizeState(button('Use linked account'))), null);
    assert.equal(refuseOk(sanitizeState({ ...button('Use linked account'), menu: true })), 'denied_label');
    assert.equal(refuseOk(sanitizeState(button('Home server (owned)', { choice: 'server' }))), null);
    assert.equal(refuseOk(sanitizeState(button('Home server (owned)', { choice: 'server', disabled: true }))), 'control_disabled');
    assert.equal(refuseOk(sanitizeState(button('Movies', { choice: 'profile', nav: true }))), 'profile_switch_refused');
    assert.equal(refuseOk(sanitizeState(button('x', { choice: 'other' }))), 'label_not_allowlisted');
    assert.equal(sanitizeState(button('x', { choice: 'bogus' })).active.choice, '');
});
