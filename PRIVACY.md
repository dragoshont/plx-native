# Privacy and data handling

This project's active product is Vemm for Samsung Tizen. The complete
current statement is [Samsung data handling](samsung/PRIVACY.md).

The client communicates with Plex and user-selected media servers. Normal
playback can update progress/watched state. Saved sign-in uses **unencrypted
Web storage**; Stay signed in defaults on and can be disabled. Sign-out and
Reset preferences have different scopes, documented in the full statement.

There is no maintainer-operated app backend, analytics or crash-upload feature
in this Samsung client. Development tools can collect private device/content
data when explicitly run; raw records must stay private.

The previous native LG privacy policy is preserved at
[the pre-migration source](https://github.com/dragoshont/plx-native/blob/f74610c8e8fda765245f548adcc6565becdca31b/PRIVACY.md).
It does not describe this Samsung package or a service provided by its maintainer.
