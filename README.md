# Mapvento

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Mapvento Icon" width="112">
</p>

**Mapvento** is a locally installable, open-source application for planning,
editing, and analyzing hiking and cycling routes. Routes and projects stay on
your device; map data is loaded online.

## Features

- Plan and edit multiple hiking and cycling routes on an interactive map
- Calculate routes with BRouter and precisely edit route waypoints
- View elevation profiles, distance, elevation gain, and duration
- Import GPX routes and export your own routes
- Select map layers and overlays, and manage points and POIs
- View OpenStreetMap places on the map by using Overpass API
- Save projects locally and continue working on them later

Expand the elevation profile with the arrow button or the mini chart. In the
expanded profile, click a position or use the arrow keys to
inspect route points. Home and End select the endpoints; Escape clears the
selection. The corresponding position is shown on the map. When elevation
data is unavailable, the profile identifies its synthetic fallback values.
Route statistics show placeholders until at least two distinct points define a
distance. Durations without usable timestamps are marked as estimates; when
timestamps are available, duration is derived from them.

Dialogs keep keyboard focus inside until closed. Escape cancels the current
dialog, or closes an open POI icon picker first. Clicking outside a dialog
does not close it or discard its draft; use its actions to apply or cancel.
Escape also closes the place search and cancels an in-progress waypoint drag
or route-line drag without changing the route.

The main menu and route action menus support Arrow Up/Down, Home and End;
Escape closes them and returns focus to their trigger. Search, map layers and
OSM places are mutually exclusive toolbar panels. Escape or each panel's close
button returns focus to its trigger, while clicking elsewhere closes the panel
without moving focus away from the clicked control.

### Action styles

Shared semantic color tokens in `src/app/base.css` and action styles in
`src/app/actions.css` define the interface hierarchy: green-filled primary
actions apply or advance, neutral secondary actions cancel or close, and
red-accented danger actions discard or delete. Text-labelled action buttons
do not include redundant symbols. Icon actions use the same
hover, pressed, disabled and visible-focus conventions. On light map panels,
separate surface, text, border and focus tokens keep controls legible without
changing map content or provider attribution. Disabled actions are subdued;
read-only values remain readable.

Comparable editors place destructive actions separately on the left, followed
by cancel and then the primary action; confirmation dialogs use the same order.
The map and route-color content retains its own domain-specific colors.

### Icons and route colors

Icon-only controls have an accessible action name; close, cancel and delete
remain distinct by their names and context. Text buttons do not carry icons.
Map tools use a 20-unit SVG grid, rounded 1.6-unit strokes and a 17 px display
size. POI choices use a 20 px icon area; original Carto viewBoxes and filled
shapes remain intact, while custom POI drawings use a 24-unit grid with rounded
1.8-unit strokes. POI IDs and attribution are unchanged. Active tools have a
distinct background, selected POI choices have a shape marker as well as
color, and keyboard focus has a separate outline.

Route color presets have names and expose their selected state; a check mark
and the current color name identify the selection without relying on color.
The default is light green. The native custom color picker retains the last
custom color even when a preset is selected.

### Keyboard focus check

The interface declares German as its document language and identifies the
English branding and read-only badges separately. Keyboard focus uses a visible
outline on dark panels and a dark outline on light map controls; the map itself
uses a two-tone outline.

The following keyboard check was performed in headless Chrome at 1051 × 944
pixels, with native Tab and Shift+Tab key events:

- At normal text size, focus moved from the main menu through the project and
  route controls, map and map tools, then the elevation profile controls.
- In the route editor, focus moved through the description, provider link,
  route type, color choices, distance-marker switch and actions, wrapping to
  the name field. The same controls and reverse navigation were checked at
  200% root text size.
- In the POI editor, all 46 icon choices were traversed. Leaving the picker
  closed its overlay, keeping the title field visible. Place-search actions
  and attribution links were also checked.

These are representative checks, not a full screen-reader or browser-zoom
audit; editing routes on the map remains mouse-oriented.

### Text readability

The interface uses scalable text for route metadata, editor labels, status
messages and elevation axes. At 200% text size, long panels and editors can
scroll, and the elevation profile reflows below the route metrics.

Representative WCAG contrast checks (foreground against the effective
background, including transparency) are maintained in
`tests/textContrast.test.ts`:

| Context | Minimum measured ratio |
| --- | ---: |
| Secondary text on dark panel / raised / soft surfaces | 5.50:1 |
| Secondary text on hover / focus surfaces | 5.50:1 |
| Error text on hover | 6.26:1 |
| Profile selection over the green chart | 6.67:1 |
| Search placeholder on white | 6.26:1 |
| Map attribution over a black map | 7.35:1 |
| Map notice over a white map | 12.42:1 |

Disabled action controls are intentionally subdued and are excluded from
the text contrast requirement; read-only field values remain readable.
Colors and labels baked into external map tiles are controlled by their
providers and are outside these checks.

Visited map tiles and OSM places use separate local caches. Clearing either
cache requires confirmation and does not affect the other; cleared data must
be loaded again. Full offline maps are not currently available. Cache actions
show their progress and outcome; the cache dialog remains open while a tile
cache action is running.

Project file and tile-cache problems remain visible until dismissed. OSM place
cache errors remain available in the places panel for retry. Project success
and cancellation notices disappear automatically.

## Platforms and requirements

Mapvento provides a desktop application for **Linux and Windows**. The web
UI can be run in a current browser during development. Releases are provided
as Linux AppImage (Linux builds target Ubuntu 24.04 compatibility) and a
Windows installer.

Development and builds require:

- Node.js 22 and npm
- Rust stable (1.90 or later) for the desktop application
- Tauri 2 platform dependencies and a C/C++ compiler

## Development

### Clone the repository

**Linux (Ubuntu):**

```bash
git clone https://github.com/decaritat/Mapvento.git
cd Mapvento
npm ci
```

### Run or build the web UI

The development server prints its local address in the terminal.

```bash
npm run build
npm run dev
npm test
```

### Run or build the Tauri desktop application

Install the Tauri system packages and Rust first:

```bash
sudo apt update
sudo apt install -y build-essential curl wget file libxdo-dev libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libwebkit2gtk-4.1-dev
```

Install Rust with [rustup](https://rustup.rs/). Then use the following
commands to run or build the desktop application:

```bash
npm run desktop:dev
npm run desktop:build
```

## License

Mapvento is licensed under the
[GNU General Public License, version 3 or later](LICENSE).
