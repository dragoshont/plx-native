# Vemm platform capability evidence

## Evidence levels

Vemm keeps capability sources distinct:

1. **Published specification** — Samsung's dated media/engine tables.
2. **Device-reported capability** — public runtime APIs such as UHD/HDR panel
   reports and exact model/family/firmware/Tizen identity.
3. **Playback observation** — a bounded named-model/media result.
4. **Conservative fallback** — conversion or explicit unsupported/unknown state.

No single boolean represents all four levels.

## Current Samsung provider

`js/capabilities.js` builds a documented profile from Tizen version and
public panel information. It then checks `js/model-register.js` for an exact
model + family + firmware + Tizen tuple. A partial match never inherits another
device's observation.

The current observed register contains one 2017 UE55MU6172 tuple with narrow
video Direct Play observations. Its empty audio list, unknown subtitles and
unknown HDR are intentional: those dimensions were not certified by the video
observation.

Documented profiles can request Direct Play where Samsung's published
specification predicts support. They remain `measured: false`, PMS can decline,
and AVPlay rejection falls back unless Direct Play is Force.

## Capability contract

The profile used by playback contains:

- evidence status and source;
- measured flag;
- Tizen/runtime basis;
- supported video/audio codecs and container combinations;
- resolution, bitrate, frame-rate, bit-depth and H.264-level limits;
- HDR class;
- narrow observations where available.

Future evidence must add exact tuples or dated specification changes. Do not add
model-year aliases, broad product-family certification or another platform's
codec assumptions.

## Future platforms

Future clients may supply native capability providers and playback backends,
but Vemm does not define a false lowest-common-denominator interface in this
transition. A future platform must first demonstrate its real policy inputs,
error states and lifecycle needs. Samsung AVPlay behavior remains represented
directly by the current backend.

## Validation boundary

Host capability tests cover exact identity matching, published-profile
construction and conservative playback choices. Device acceptance still needs
exact model/region/firmware, source SHA, media tuple, expected/actual result and
redacted evidence. No device was contacted for this transition.
