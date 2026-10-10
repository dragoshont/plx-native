'use strict';

// Page-side remote logic for the live viewer. Each function is self-contained so the page embeds
// its exact source with Function.prototype.toString and the host tests exercise the same code.

// Maps a keydown on the focused remote surface to a TV key. Returns null for keys the page must
// leave alone (no preventDefault): events from anything but the surface itself (forms, metadata
// fields, buttons, contenteditable), IME composition, any modifier, and unmapped keys. A mapped
// auto-repeat is swallowed but not sent, so a held key cannot flood the TV.
function keyCommand(event, surface) {
    if (!event || !surface || event.target !== surface || surface.isContentEditable) return null;
    if (event.isComposing || event.keyCode === 229 || event.key === 'Process' || event.key === 'Dead') return null;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
    var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        Enter: 'ok', ' ': 'ok', Spacebar: 'ok', Backspace: 'back' };
    if (!Object.prototype.hasOwnProperty.call(map, event.key)) return null;
    return { key: map[event.key], send: event.repeat !== true };
}

// One command at a time from this page: a second request while one is unanswered is dropped and
// reported, never queued, so neither Enter on a button nor a fast double press sends twice.
function createSender(post, report) {
    var busy = false;
    return {
        busy: function () { return busy; },
        send: function (key, extra) {
            if (busy) { report({ status: 'dropped', key: key, reason: 'command_in_flight' }); return false; }
            busy = true;
            var started = Date.now();
            report({ status: 'pending', key: key });
            Promise.resolve().then(function () { return post(key, extra || {}); }).then(function (result) {
                busy = false;
                report(Object.assign({}, result, { key: key, clientRttMs: Date.now() - started }));
            }, function () {
                busy = false;
                report({ status: 'error', key: key, reason: 'viewer_unreachable', clientRttMs: Date.now() - started });
            });
            return true;
        }
    };
}

module.exports = { keyCommand, createSender };
