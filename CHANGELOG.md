# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.6.6](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.6.5...v0.6.6) (2026-09-02)


### Bug Fixes

* switch debug-log I/O to Node fs, normalize path display ([5b8b190](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/5b8b190f734255d67575e1c595bc9a433b6ef598))

### [0.6.5](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.6.4...v0.6.5) (2026-09-02)


### Bug Fixes

* reprocessor no longer trashes notes for un-fillable date fields ([b91589b](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/b91589b5b2e66e2c78ef590a881da15b11bc52d5))

### [0.6.4](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.6.3...v0.6.4) (2026-09-02)


### Refactoring

* reorder status-bar context menu — admin/logs at the bottom ([c1c95f5](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/c1c95f5424b559eaebc437dce820169398591501))

### [0.6.3](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.6.2...v0.6.3) (2026-09-02)


### Features

* debug toggle + debug.log (outside vault, status-bar command) ([e33c2d9](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/e33c2d973f030c6529757fabf2b81ed546971450))


### Bug Fixes

* 'c is not iterable' in reprocessInboxSubdirs + 2 other unguarded sites ([9f9a783](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/9f9a783c037ab85a951f4e203bc85d42bbef4c02))


### Refactoring

* in-process TypeScript scaffolder replaces init-project.py ([a797455](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/a797455e3c474326cdeca9fc02b01119427f5a1e))

### [0.6.2](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.6.1...v0.6.2) (2026-09-02)


### Bug Fixes

* defensive guard for settings.templates in processInbox + processSingleLine ([df038d8](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/df038d878c3110347ff02f75c257f47f25b1a4d7))

### [0.6.1](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.6.0...v0.6.1) (2026-09-02)


### Features

* project-template check + inbox reprocessor (v0.5.0 add-ons) ([2261a03](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/2261a0396284b3fb660a1b99210b99f636d31a94))

## [0.6.0](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.5.0...v0.6.0) (2026-09-01)


### ⚠ BREAKING CHANGES

* **release:** commit to force the right bump.

Local commit only per the standing git-push-needs-ask rule.

### Miscellaneous

* **release:** adopt standard-version for automated releases ([8e83bf7](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/8e83bf76ca864299a2b57d05fc9082e0047c08de))

## [0.5.0](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/compare/v0.4.1...v0.5.0) (2026-09-01)


### ⚠ BREAKING CHANGES

* **release:** commit to force the right bump.

Local commit only per the standing git-push-needs-ask rule.

### Features

* GH Actions release pipeline + NN limitation note ([4e2f476](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/4e2f4761c7f515e95f32a16256adc14e1d08b31b))
* **release:** adopt standard-version for automated releases ([0b92800](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/0b92800e2aa04a09d477006a7fa18bad66aa1a8e))


### Refactoring

* GH Action triggers on push-to-main, release.ps1 stops at push ([42b60fc](https://github.com/BigHoss/obsidian-inboxprocessor-plugin/commit/42b60fcf9ec5c73639015b2f2e9811a3b617960b))
