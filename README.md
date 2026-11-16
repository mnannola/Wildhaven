# Wildhaven

Browser ecosystem sandbox built with Phaser 3, TypeScript, React, and Vite.

Aging is implemented: animals advance through juvenile, adult, and elder stages, with varied adult starting ages, gradual elder movement/stamina decline, and natural deaths. The inspector shows sex, age, and stage; World activity separates old-age deaths. Save format 9 upgrades older worlds. See LIFECYCLE.md for aging settings and REPRODUCTION.md for mating, pregnancy, inherited traits, dependent young, and population controls.

## Run

`npm install` then `npm run dev`. Production: `npm run build`. Behavioral checks: `npm test`.

## Formatting

Run `npm run format` to format all supported files, including TypeScript, TSX, JavaScript, CSS, HTML, JSON, and Markdown. Run `npm run format:check` to check formatting without changing files.

Prettier uses the shared `.prettierrc.json` configuration. Generated files and dependencies are excluded through `.gitignore`; `package-lock.json` keeps npm's generated formatting. For format on save, install your editor's Prettier extension, select Prettier as the default formatter, and enable format on save.

## Controls

Drag to pan; scroll or use + / − to zoom. Click an animal to inspect it. Click Deer or Wolf to immediately add one animal near the center of the current view. The arrow returns to selection. Use ◎ for paths and detection radius. Pause / 1× / 2× / 5× control simulation speed. Saves persist in IndexedDB in the current browser; use Load to restore. Closing the page stops the simulation.

Terrain-aware movement and hunting: see TERRAIN.md for woodland concealment, footing, weighted routes, river pursuits, and save compatibility. The inspector shows surroundings, cover, and movement modifiers.

Territories and dens: see HOMES.md for pack dens, bear home ranges, herd gathering sites, ownership, den pups, map controls, and save support.

## Architecture

- `src/sim.ts`: seeded, engine-independent state and fixed-step simulation, utility goal selection, short action sequences, grid navigation, resources, predation, personality.
- `src/homes.ts`: familiar sites, ownership, territorial warnings, home routines, and knowledge sharing.
- `src/game.ts`: Phaser camera, pixel rendering, interaction, and simulation bridge.
- `src/main.tsx`: React journal, inspector, controls.
- `src/storage.ts`: IndexedDB persistence.

Prototype limitations: Animals use short goal-specific action plans. Animals perceive nearby resources and animals with tree-blocked sight, remember discoveries, and forget them over time. Navigation uses terrain-weighted A\*; hunting and escape routes respect cover, obstacles, and river fords. Nearby animals are currently scanned directly. Species sprites are programmatically drawn pixel art. Reproduction and dependent young are implemented. No seasons or terrain editor. Simulation CPU performance has been measured at 50, 100, and 200 animals; see PERFORMANCE.md for results and browser-rendering limits. Simulated day counter advances every 240 seconds and is not yet a biological day/night cycle.

New reserves start empty. Click a species button to add one animal near the center of the current view and select it in the inspector. Sprinting hunters and fleeing deer move faster, use running animations, and accumulate fatigue faster. Delete animal removes the selected animal. Reset animals clears all animals (including carcasses) and activity while keeping terrain, resources, and simulation time. Existing saves retain their animals.

Perception and memory: cautious deer see farther and remember wolves longer. Wolves search last seen prey locations for longer with higher persistence. Shorelines remain in memory for 300 simulated seconds, grass for 120 seconds, and animal sightings for shorter trait-dependent periods. Resource choices use discovered locations. Terrain navigation still uses the world grid. The inspector shows knowledge counts and recent animal sightings; the overlay shows perception range. Saves include memories and older saves start with empty memories.

Short action plans: animals travel to remembered resources, pause to check their surroundings, then drink, graze, feed, or rest until satisfied. Hunters pursue prey then feed. Plans persist between decisions, respond to threats and critical needs, and abandon missing resources or unreachable destinations. The inspector shows completed, current, and upcoming steps. Plans and their progress are saved.

Wolf packs: wolves with sociability of at least 35 form persistent packs when meeting within 8 tiles and clear sight. Packmates within 12 tiles and clear sight share prey, carcass, and water memories without refreshing sighting age. Hungry, rested members can interrupt ordinary activity to join a nearby hunt; critical thirst and fatigue take priority. One hunter chases directly while others aim ahead and to either side where terrain allows. Members can feed on the same carcass and regroup using remembered packmate locations. Solitary wolves still hunt independently. The inspector shows pack membership and roles; the debug overlay connects nearby packmates. Pack membership is included in saves.

Deer herds: social deer (sociability 35+) form persistent herds when meeting within 6 tiles and sight. Members regroup toward recent remembered companions when ordinary needs allow, prefer food patches away from other grazing destinations, and bias escape routes toward the group while prioritizing distance from danger. Nearby herd mates within 8 tiles and clear sight relay wolf warnings up to 3 seconds old without refreshing their age. Solitary deer remain independent. The inspector shows herd membership and status; the overlay connects nearby members. Herd membership is saved and older saves initialize each deer independently.

Rivers and fish: fresh reserves have a winding Fernwater river with a lake tributary and stepping-stone fords. Each river section has a finite fish stock and capacity. Stocks recover at 0.025 fish per simulated second, capped at capacity; catchFish(sectionId, amount) consumes available stock for future fishing behavior. Silver fish silhouettes and ripples reflect stock availability. Click river water to inspect the section. Fish stocks are saved (save format 3). Older saves keep their original terrain and do not have rivers carved through existing animals.

Grizzly bears: use Add grizzly bear to place a bear. Bears discover fishing banks through local perception and remember the section and last observed stock for 180 simulated seconds. Hungry bears prefer reachable remembered banks with at least one fish; they travel, check surroundings, then catch one fish every 3 seconds, reducing hunger by 12 per catch. Depleted fishing plans are abandoned and their remembered stock is marked empty. If no productive fishing bank is known, bears scavenge remembered deer or wolf carcasses and otherwise explore for food. When fish and carcasses are unavailable, bears hunt known deer or isolated wolves. Bear memories, fishing targets, and plan progress are saved.

Combat: damage resolves simultaneously after movement, with one attack per predator per step and clear melee reach required. Bears hit harder than wolves; fatigue and injuries reduce damage and movement. A healthy bear wins a close duel against one wolf, while four fit nearby packmates can defeat it. Wolves rally only when four members of their own pack are within 6 tiles of the bear, can see it, have health above 25, fatigue below 70, and thirst below 90. Otherwise they flee. Bears avoid strong groups and retreat when badly injured; fighting animals can counterattack during escape. Recent damage pauses healing for 10 seconds. Kills produce edible carcasses. Combat targets and retreat state are saved; the inspector shows encounters and injured sprites flash.

Combat log: the animal inspector displays damage dealt and received in HP, grouped by opponent and simulated second, newest first. Each animal keeps up to 60 entries, including on carcasses. Lethal damage is capped to the target’s remaining health and attributed proportionally across simultaneous attackers. Opponent names and species remain available after deletion. Logs persist in saves; older saves start with an empty log.

Fishing and combat visuals: bear fishing follows the fishing plan timer (watch, raise paw, swipe), with splash effects and a lifted-fish eating pose triggered by actual catches. Wolves use jaw-opening bite lunges, bears use paw strikes, and recent damage produces recoil and hit flashes. Impact effects require a recent damage event. Catch and strike markers persist with saves; animation and effects follow simulation time and freeze on pause. Fishing and fighting overhead labels are hidden.

Carcass balance: new carcasses contain 50 meat units (previously 100), and natural decay removes 0.09 units per simulated second (previously 0.045). Scavenger feeding rates are unchanged. Save format 4 upgrades older carcasses by halving their remaining meat once; the inspector displays remaining units out of 50.

Death and carcass visuals: a recorded death plays a short collapse, then settles into a still, sprawled pose with closed eyes. Carcasses have fresh, depleted, and exposed-bone stages tied to remaining meat. Empty bones fade over 60 simulated seconds after depletion. Death and depletion timestamps are saved, so pause/speed and load preserve progress. Old carcasses without a death timestamp appear already settled rather than replaying a collapse. Sleeping poses remain tucked and breathing.

Ecosystem statistics (World activity): population and grass/fish availability history, deaths by cause/species, predator pursuit outcomes, food consumed, available carcass meat, and living animals with hunger/thirst/fatigue at 80 or above. Samples are recorded every 5 simulated seconds plus population changes, retaining the latest 720. Lifetime totals are separate from the bounded history. Each food-seeking predator pursuit is one attempt; repeating a plan does not add attempts, shared pack kills can credit multiple pursuers, abandoned pursuits fail, and defensive fights are excluded. Player additions/removals are separate from deaths. Reset animals starts a new statistics period. Save format 5 preserves counters, samples, and active pursuit tracking. Older saves begin tracking at load time without reconstructing lost history.

Ecosystem balancing: see BALANCE.md for the 20-minute before/after runs, limits, and reproduction commands. Gameplay resource rates and urgency thresholds are centralized in src/balance.ts. The tuning fixes repeated interruption of vital actions, searches trapped at map edges, excessive shoreline detours, and hunger overridden by social regrouping. No hunger/thirst deaths occurred in the three tested moderate mixed reserves or the deer-only control; predator-heavy reserves can still lose animals to food scarcity. Those reports predate reproduction; see REPRODUCTION.md for the subsequent family-behavior runs and their limits.

Woodland scenery: the playable reserve uses cached textured ground, layered oak and pine crowns, mossy riverbank stones, ferns, wildflowers, crossing approaches, dappled light, and root-framed dens. Trees sort by their ground position against animals and fade near the selected animal. Water highlights update at 8 Hz in simulation time and freeze when paused. Scenery uses coordinate noise independent of the world RNG; food depletion redraws only forage. This is the first procedural scenery pass toward the woodland concept; animals retain their existing sprites.

Deer appearance: rounded woodland silhouettes, shaded coats, slender jointed legs, pale bellies and tails, branching buck antlers, antlerless does, and spotted juvenile coats now share anatomy across all existing movement, feeding, awareness, family, sleep, and carcass poses. Juveniles use their existing growth scale and switch to adult coats at maturity. Texture frames are generated once at scene creation.

Deer visual refinement: textures are generated at 3x resolution and displayed at their original world size. Rounded stroke segments prevent folded-joint spikes. To inspect the same drawing commands offline on Windows, run npx tsx scripts/deer-preview.ts followed by ./scripts/deer-preview.ps1; the contact sheet is written under ignored performance-results. This GDI preview is a geometry reference, not a Phaser browser screenshot.

Wolf appearance: layered gray coats, cream throat and belly, a long muzzle, amber eyes, neck ruff, bushy tail, and jointed legs share anatomy across all existing behaviors. Pups use darker coats and rounder heads through their existing growth stages. Like deer, wolves use 3x texture resolution while retaining their original world size. Offline geometry review: npx tsx scripts/wolf-preview.ts then ./scripts/wolf-preview.ps1.

Bear appearance: textured brown coats, a grizzly shoulder hump, pale muzzles, rounded ears, broad paws and claws, and darker cub variants now share anatomy across movement, awareness, fishing and fish catches, combat, family behaviors, sleeping, and carcasses. Frames use 3x texture resolution at the existing world size. Offline geometry review: npx tsx scripts/bear-preview.ts then ./scripts/bear-preview.ps1.
