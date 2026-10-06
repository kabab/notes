# Changelog

All notable changes to this project are documented here. The release workflow
publishes the section matching the pushed tag as the GitHub release notes.

## [0.1.0] - 2026-10-05

First release: macOS desktop app, local-only vault.

### Added
- Folders and notes: nested folder tree in the sidebar with create, rename, move (drag and drop) and soft delete.
- Markdown editor (CodeMirror 6) with autosave, clickable checkboxes, and `[[note]]` links with title autocomplete.
- Daily notes: today's note opens on launch, kept in an auto-created "Daily" folder; calendar in the sidebar.
- Tasks: `- [ ]` items from every note are indexed. To do view grouped by note; Done view by completion day. Checking a box in either view updates the note.
- Images: paste, drag-drop or pick files. They are resized to 2560px max, stripped of metadata, stored once as WebP, and shown inline.
- Full-text search (SQLite FTS5) and a ⌘K quick switcher that can also create notes.
- Export vault to Markdown files in their folder structure, with attachments and working image links.
