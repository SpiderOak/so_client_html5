Overview
======
SpiderOak is working on reimplementing its client applications for mobile
devices as a central, platform-independent HTML5 / Javascript / CSS core
with native extensions to fill in the functionality gaps.  This is intended
to replace the current, platform-specific native applications.  We see many
potential benefits to the html5 approach, among them being implementation
in a widely used, comprehensible (if we're careful) medium that can be very
useful to others.

There are many ways that access to our code can be useful.  It can serve as
guidance to people as examples for using our APIs.  It can serve as a basis
for implementing idiosyncratic functionality that they need.  It can
provide the opportunity to contribute to and help grow this useful tool,
itself.  These and other reasons are why we make the code openly available,
and the development process reasonably transparent.

Hence the code is officially available as open source, under the Apache
license, and we are conducting our development using a SpiderOak public
repository situated at github.

It's worth mentioning that this mobile client is extremely important to
SpiderOak as a business.  We are opening the source in order to make the
development effort more immediately useful, in ways described above, as
well as to leverage various collaboration opportunities that such openness
affords.  We will continue to devote significant internal development
resources to this effort, as it requires.

Current Status
=======
Where we are at the point of open source release, in the beginning of
November, 2012:

The overall state of the SpiderOak mobile client is chaotic.  The existing
(native per-platform) application is lacking - it does not actually do
backups or other actions that require reading of the host mobile devices,
and there are unresolved problem with some of the things it does do.

While we are slowly continuing to attend to the existing problems, we have
devoted resources to first replacing the existing functionality with this
HTML5-based version, and then concentrating on basing full functionality on
that foundation, including device reading and writing.

* Fundamental infrastructure and implementation is in place for:
  * Replacing existing native app functionality
  * Building platform, brand, and theme variants

* We have more to do to get to sufficient parity with the existing app:
  * The UI essentials are there, but there is a lot of fleshing-out and
    basic polish pending
  * Resolve various internal formulations of how the central view of the
    various content collections is organized (storage vs. share rooms
    originated by the account vs. linked public share rooms), between a
    "consolidated root" view (see
    `docs/HTML5ClientProjectConsolidatedRoot.txt`) and one more like the
    existing SpiderOak application and other remote storage applications
  * We have several elementary features to implement, including:
    * Sustained login, so people can elect to have perpetual login after boot,
      and at least, authentication time-out is under user-control, rather
      than by authentication cookie time-out.  (Will depend on storage of
      credentials secured using platform-specific provisions, available via
      hybrid facilities.)
    * PIN-protected login
    * Locally cached favorites
    * Sharing to other applications (Share / Send-to)
    * File details
    * File previewers
    * "Storage bar" gauge and text indicating
    * Other reconciliations with mobile app design spec
  * Flesh out internationalization
  * Implement tests - real unit and functional tests
  * Implement hybrid provisions for Android as well as iOS,
  * Propagate full releases for both platforms.
  * Convert code comments to [http://en.wikipedia.org/wiki/JSDoc JSDoc] or
    other suitable smart-annotation format
  * Polish UI

* Once we have achieved parity with the existing, native application that
  we'll be replacing, these are the high-priority next steps:

  * Optimization for performance - implement easy/low hanging fruit,
    including but not limited to conventional ways to optimize jQuery mobile
    behavior, implement batch fetches of folders and pre-fetching of
    anticipated next-visits
  * Implement local backup and sync functionality! Existing mobile client
    lacks local file system read - doesn't backup device. That will be the
    next step (along with essential optimization), once reimplementation of
    existing functionality is complete.

What's Here
======
This repository includes working code for developing and running the HTML5
client, documentation, and tools for composing and building various kinds
of releases.

The html5 app, as cloned from the github repository, is arranged so that
development is done in the files organized in the clone's root.  A few
scripts in the ./tools subdirectory compose the releases, and build the
platform-specific application packages, using the development copies and
resources collected in specific subdirs.

* The cloned repo's top level files, including `index.html`, `SpiderOak.js`,
  and generally the files included in the index.html header, are what the
  developer edits.

  Some of the top level files are actually symlinks into specific versions
  of resources that vary for different renderings of the app.  Edits to
  those files would have to be reflected in their corresponding other
  versions.  Care has been taken to minimize unnecessary redundancy in
  these files, so they contain only variant-specific aspects.

  This top level is organized so you can run by pointing your browser at
  the index.html, for immediate feedback, or you can view release versions
  produced by some scripts, described next.  (NOTE that, if you want to run
  by pointing your browser at locally situated file-system files, rather
  than ones on a web server, you have to specifically enable your
  cross-origin operation for your browser - see
  `docs/HTML5ClientAppSameOriginIssues`)

* The `docs` subdirectory contains accumulated project documentation,
  including notably:

  * `docs/AppOverview.txt`, describing architectural and other technical
    details of the application
  * `docs/HTML5ClientProject.txt`, an historical record of the tasks done
    and planned, before the open source release

* The `release_artifacts` subdirectory contains version-specific
  ingredients of builds, used by the build machinery (described next) to
  concoct the release variations of the app.

* The `tools/prep_release` script produces various, complete-unto-themselves
  "release" collections of the html/javascript/css files, in the `releases`
  subdirectory.  These releases vary according to branding, color scheme,
  and platform theme, and are named accordingly.

  The releases created by `tools/prep_release` are not platform-specific
  executables.  (As of this writing, only the iOS platform theme is
  implemented, Android will be added soon).

  This `prep_release` script is configured with lists of the variations
  within a set of categories, currently brand, color scheme, and
  platform style.  The script takes selection of no variants within a
  category to mean doing all the variants for that category.  You can see
  the available variants (without any work done) by invoking the script
  with `--help`.

  The script assembles the releases from a combination of the development
  copies and resources residing in the `release_artifacts` subdirectory.

  The `tools/prep_releases` script provides the canonical reference on the
  ingredients and how they are combined, since it actually does the job.
  It is fairly well commented, and possibly intelligible shell script code.
  Read it for details.

* The `tools/build_platforms` script uses the results of (and machinery
  from) the `tools/prep_release` script to assemble and compile
  platform-specific PhoneGap executable application packages in the
  `releases/PhoneGap` subdirectory.  Currently, we only have the
  basics of a build for iOS implemented.  Our immediate plans explicitly
  include extending the coverage to recent Android versions, as well.

  `tools/build_platforms` takes the same set of variation specifiers as the
  `tools/prep_release` script.  Unlike the latter, `build_platforms` does
  nothing if no variants at all are selected.  You can explicitly get all
  variants built, without enumerating all the variant selectors, by passing
  the flag `--all`.

  `build_platforms` currently uses the respective platform SDK to build the
  platform-specific packages.  it depends on a copy of a version of the
  PhoneGap build tools that have been imported into this repository.
  Currently we only have the iOS platform-specific build implemented.  We
  do not yet use the relatively new (as of initial writing) PhoneGap
  resource that provides [https://build.phonegap.com/ cloud build services]
  for all our concerned platforms.
