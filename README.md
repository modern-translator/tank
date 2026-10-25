# IRON ECLIPSE

A dependency-free browser tank campaign built with HTML, CSS, vanilla JavaScript, and Canvas.

One prototype siege unit. Three dead sectors. One last titan.

![No build step](https://img.shields.io/badge/build-none-6be7f5) ![Vanilla JS](https://img.shields.io/badge/stack-vanilla%20JS-ffb45f) ![Canvas](https://img.shields.io/badge/render-canvas-9a7dff)

## Launch

Open `index.html` directly in a modern desktop browser, or serve the folder locally:

```bash
cd "Project OpenCode"
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

No installation, package manager, build step, or external assets are required. Audio is synthesized at runtime with the Web Audio API.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Drive the tank |
| Mouse | Aim the turret |
| Left mouse button | Fire the cannon |
| `Space` | Phase dash (brief invulnerability) |
| `Esc` | Pause / resume |
| `M` | Mute / unmute audio |
| `Enter` | Confirm the current screen |

## Campaign

| Sector | Environment | Signature hazard |
| --- | --- | --- |
| **01 — DUST DIVIDE** | Wind-scoured desert outpost | Sandstorm visibility and entrenched sentries |
| **02 — CRYO RELAY** | Frozen relay station | Slick ice patches and long-range artillery |
| **03 — ASH FOUNDRY** | Volcanic production floor | Timed lava vents and heavy assault units |
| **Final — THE SOVEREIGN** | Titan arena | A three-phase siege platform |

Each standard sector contains three waves, including an elite encounter. Clearing a sector grants a field refit choice of three random permanent upgrades.

### The Sovereign

- **Phase I — Bastion:** cannon fan patterns, missile locks, and a charge beam.
- **Phase II — Bulwark:** a shield matrix protects the core. Destroy all three orbiting shield nodes to expose it.
- **Phase III — Meltdown:** the core is exposed and the titan attacks relentlessly. An overdrive surge is granted for the final push.

## Permanent Upgrades

Choose one of three offers after each standard sector. Each upgrade has two integration levels.

- **Overpressure Rounds** — increased cannon damage
- **Autoloader Rig** — faster reload
- **Reactive Plating** — increased hull integrity
- **Servo Track Array** — improved drive speed and handling
- **Aegis Capacitor** — stronger regenerating shield
- **Phase Drive** — shorter dash cooldown and improved dash

## Systems

- Hull health plus a regenerating shield
- Dash invulnerability and afterimage trails
- Enemy variety: scouts, sentries, drones, artillery, heavies, and named elites
- Destructible-cover-aware line of sight and projectile collision
- Pickups for hull, shield, and temporary overdrive
- Wave scoring, kill tracking, accuracy, and run timer
- Local best score and mute preference via `localStorage`
- Screen shake, damage flash, particles, ambient weather, and synthesized music
- Pause, restart-sector, retry, and return-to-title flows

## Project Layout

```text
.
├── index.html          # Menu, briefing, HUD, boss UI, and end screens
├── css/
│   └── style.css       # Neon-industrial presentation and responsive layout
├── js/
│   ├── config.js       # Utilities, campaign data, enemies, upgrades, balance
│   ├── audio.js        # Procedural sound effects and music
│   └── game.js         # Entities, combat, boss phases, rendering, game flow
└── README.md
```

Scripts are loaded as classic `<script>` tags so the game works from the local filesystem without a server.

## Tips

- Keep moving. Artillery and missile locks punish a stationary tank.
- Use `Space` to phase through beams and mortar rings, not just to reposition.
- In Phase II, ignore the Sovereign's core until all three shield nodes are down.
- Save overdrive pickups for Phase III, or collect them early to burst a shield node.
- The shield regenerates after a delay. Disengage briefly when it collapses instead of trading hull.

## Browser Support

Built for current desktop versions of Firefox, Chrome, Edge, and Safari. Keyboard and mouse are required; the layout adapts to smaller windows but the game is designed desktop-first.

## Troubleshooting

- **No audio:** browsers require a user gesture before audio can start. Click **Begin campaign** or press a key first.
- **Blank screen from `file://`:** confirm all three scripts in `js/` are present, or run the local server command above.
- **Low frame rate:** close other GPU-heavy tabs. The renderer caps the device pixel ratio at 2 and limits particle counts.
- **Progress not saved:** `localStorage` may be unavailable in private browsing; the game still runs, but records reset.
