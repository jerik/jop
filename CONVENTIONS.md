# Conventions

Binding for everyone working in this repository, humans and agents. The
dispatcher of [agenterix](https://github.com/jerik/agenterix) appends this file
to the prompt of every run on this repository.

## What jop is

A phone web app (PWA, used on iOS) that **reads** a plain-text journal from a
private GitHub repository, lets the owner list and filter its entries, and
edit their state and comments.

- **One way to write.** jop changes the journal only by sending a
  `repository_dispatch` `journal-edit` with the old line, its occurrence and
  the new line (#15). A workflow in the private repository applies it and
  refuses anything but a marker swap plus one appended ` # yyyy-mm-dd …`. No
  `PUT`, no commits from the app, no other kind of write; widening this needs
  an issue from the owner.
- The journal format is explained in the issue that asks for the parser. Once
  it is implemented, the parser and its tests are the reference.

## As little as possible is public

This repository is public; the journal and its location are not.

- **Never write the private repository's owner, name, branch, file path or a
  token into this repository** — not as a default, not as an example, not in
  a test. The app asks for them in a setup step on the device and stores them
  only there.
- The token is a fine-grained personal access token for one repository with
  Contents: Read and write (the dispatch API requires write). Never log it, render it, or send it anywhere but
  `api.github.com`.
- **The only network destination is `api.github.com`.** No CDN, no web fonts,
  no analytics, no third-party scripts. Everything the app needs ships in this
  repository.
- `journal.anon.txt` is an anonymised copy of a real journal and serves as the
  **test fixture**. Do not modify it; tests may count on its exact content.

## Every sub page uses the same frame

Every view besides the list is an entry of `PAGES` in `app.js`, reached at
`#/<name>`. A page returns only its title and body; `mountApp` adds the frame —
a sticky header with the back button and the title, then the notice. Back goes
through browser history, so the button and the iOS edge swipe agree.
`tests/app.test.js` checks the frame for every entry of `PAGES`. A new page goes
into `PAGES`, never into its own branch of `render`.

## Branches and what runs on the phone

- `master` is the version the owner accepted on the iPhone. Work for an
  objective happens on `objective/OBJ-<n>`; for its duration that branch is
  the default branch and the GitHub Pages source, so every iteration can be
  tried on the phone. Only the owner merges it; afterwards both go back to
  `master` (README, „Auslieferung“).
- The installed app survives a switch: keep `id`, `start_url` and `scope` in
  the manifest relative (`./`), or the phone treats it as a new app and loses
  access, copy and shortlist.
- **Every change to a shipped file bumps `CACHE_VERSION` in `sw.js`**, and a
  new file also goes into `SHELL`. The worker answers from its cache first;
  without a new version the phone keeps running the old files.
  `tests/pwa.test.js` fails until the new version and its fingerprint are
  added to `tests/shell-versions.json`; the failure message gives both.
- A new version takes over only after the app was closed completely once;
  „Zugang löschen“ does not clear the cache. Say so in the manual checks of
  every change that ships (README check 9).

## No build step, no dependencies

- Plain ES modules (`"type": "module"`), served as they are. The same module
  is imported by the browser and by the tests.
- No runtime dependencies and no `devDependencies`. If something seems to need
  a package, say so in the answer instead of adding it.

## A code change must be tested

```bash
node --test          # from the repository root, must be green
```

- **Tests run on plain node**, no browser, no network:
  `tests/<topic>.test.js`, using `node:test` and `node:assert`.
- Browser APIs (`fetch`, `localStorage`, …) are passed in or mocked in the
  test. Do not write a test that only runs in a real browser.
- `node --test` passes with zero tests. A change to behaviour without a test
  covering it counts as untested.
- What can only be checked on the phone (home-screen install, safe areas,
  offline start) cannot be tested here. **List those manual checks** in the
  answer, as steps the owner can follow on the device.
- **End the answer with `Verify: <command>`**, usually `node --test`.

## Every change has an issue and a changelog line

- Work starts from an issue that states the owner's request. Work done
  without one gets an issue afterwards, with the request verbatim and the
  commit it landed in.
- A change the owner notices when using the app adds one line to
  `CHANGELOG.md` (German), under the date it goes live, ending with the issue
  number. Say what changes in use, not how it is built.

## Language

- Code, identifiers, comments, commit messages: English.
- Text in the user interface, `README.md` and `CHANGELOG.md`: German.

## Background material

`doku.md` is an early research plan for a generic sync app, not a
specification. Where it contradicts an issue or this file, the issue and this
file win.
