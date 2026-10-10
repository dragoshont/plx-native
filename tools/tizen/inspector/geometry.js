'use strict';

// Runs on Chrome 47: no text, attribute values, URLs, credentials or input values.
const EXPRESSION = '(' + function () {
    var nodes = document.getElementsByTagName('*');
    var result = {
        viewport: { width: window.innerWidth, height: window.innerHeight,
            scale: window.devicePixelRatio },
        scanned: 0,
        scanTruncated: nodes.length > 2000,
        entries: [],
        entriesTruncated: false
    };
    var tags = /^(DIV|SPAN|BUTTON|INPUT|SELECT|TEXTAREA|IMG|VIDEO|CANVAS|P|H1|H2|H3|UL|LI|A|MAIN|SECTION|HEADER|FOOTER|NAV|BODY|HTML)$/;
    for (var i = 0; i < Math.min(nodes.length, 2000); i++) {
        result.scanned = i + 1;
        var node = nodes[i];
        var box = node.getBoundingClientRect();
        var style = window.getComputedStyle(node);
        if (!box.width || !box.height || style.display === 'none' ||
            style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        if (result.entries.length === 200) {
            result.entriesTruncated = true;
            result.scanTruncated = i + 1 < nodes.length;
            break;
        }
        result.entries.push({
            ordinal: i,
            tag: tags.test(node.tagName) ? node.tagName : 'OTHER',
            box: { x: box.left, y: box.top, width: box.width, height: box.height },
            focused: node === document.activeElement,
            outsideViewport: box.left < 0 || box.top < 0 ||
                box.right > window.innerWidth || box.bottom > window.innerHeight,
            scrollOverflow: node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight,
            fontSize: parseFloat(style.fontSize) || 0,
            lineHeight: parseFloat(style.lineHeight) || 0
        });
    }
    return result;
}.toString() + ')()';

const { InspectorError } = require('./client');
const TAGS = new Set('DIV SPAN BUTTON INPUT SELECT TEXTAREA IMG VIDEO CANVAS P H1 H2 H3 UL LI A MAIN SECTION HEADER FOOTER NAV BODY HTML OTHER'.split(' '));

function number(value, min = -100000, max = 100000) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new InspectorError('invalid_geometry');
    }
    return Math.round(value * 100) / 100;
}

function boolean(value) {
    if (typeof value !== 'boolean') throw new InspectorError('invalid_geometry');
    return value;
}

function sanitizeGeometry(value) {
    if (!value || !value.viewport || !Array.isArray(value.entries) || value.entries.length > 200) {
        throw new InspectorError('invalid_geometry');
    }
    return {
        kind: 'dom-css-geometry-not-pixels',
        viewport: { width: number(value.viewport.width, 0), height: number(value.viewport.height, 0),
            scale: number(value.viewport.scale, 0, 20) },
        scanned: number(value.scanned, 0, 2000),
        scanTruncated: boolean(value.scanTruncated),
        entriesTruncated: boolean(value.entriesTruncated),
        entries: value.entries.map(entry => {
            if (!entry || !entry.box || !TAGS.has(entry.tag)) throw new InspectorError('invalid_geometry');
            return {
                ordinal: number(entry.ordinal, 0, 1999), tag: entry.tag,
                box: { x: number(entry.box.x), y: number(entry.box.y),
                    width: number(entry.box.width, 0), height: number(entry.box.height, 0) },
                focused: boolean(entry.focused), outsideViewport: boolean(entry.outsideViewport),
                scrollOverflow: boolean(entry.scrollOverflow),
                fontSize: number(entry.fontSize, 0, 10000), lineHeight: number(entry.lineHeight, 0, 10000)
            };
        })
    };
}

async function geometry(client) {
    const result = await client.rpc('Runtime.evaluate', { expression: EXPRESSION, returnByValue: true });
    if (result.wasThrown || result.exceptionDetails || !result.result ||
        !Object.hasOwn(result.result, 'value')) throw new InspectorError('geometry_evaluation_failed');
    return sanitizeGeometry(result.result.value);
}

module.exports = { EXPRESSION, geometry, sanitizeGeometry };
