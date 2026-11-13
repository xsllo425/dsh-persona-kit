# Third-party notices

dsh-persona-kit is MIT-licensed (see LICENSE). It contains no third-party source files. The following works
influenced it; where wording or a selector pattern was reused, that is stated. Licences are noted per entry
(checked on GitHub on 2026-11-01).

## dsh-persona-switcher — https://github.com/yupaoa/dsh-persona-switcher
Design reference for the role library (`<rolesDir>/<id>/ROLE.md`), the `/role` command surface, and the "role
change" notice written into the conversation after a switch. `lib/roles.js` is an independent implementation, but the
English notice text in `formatNotice()` follows that plugin's wording closely (including the sentence "Your next
reply already belongs to the persona named here, not to the discarded one."). The session state file format is kept
compatible so the two can be swapped.

```
MIT License

Copyright (c) 2026 yupaoa

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## dsh-chat-avatars — https://github.com/BlackRasion/dsh-chat-avatars
Ideas only: avatars beside chat messages with per-workspace overrides, and the "poke" idea. The implementation here
is new (a header element per reply). Licence: MIT, Copyright (c) 2026 dsh-chat-avatars contributors.

## dsh-account-identity — https://github.com/wysxxx/dsh-account-identity
Idea only: a custom name and picture for the sidebar account button. The implementation here is new (a restyle of
the existing account button). Licence: MIT, Copyright (c) 2026 wysxxx.

## dsh-meme (DeepSeek Harness sticker plugin)
The sticker pack format (`manifest.json` + `index.db` + image folders) is read as is, so existing packs keep working.
