// Capture the actual texture generator's draw commands for offline visual review.
import { makeDeerTextures } from '../src/deerRendering';
import { mkdirSync, writeFileSync } from 'node:fs';
const frames: Record<string, unknown[]> = {};
makeDeerTextures({
  make: {
    graphics: () => {
      const commands: unknown[] = [];
      let g: any;
      g = new Proxy(
        {},
        {
          get:
            (_, name) =>
            (...args: unknown[]) => {
              if (name === 'generateTexture')
                frames[String(args[0])] = commands.slice();
              else if (name !== 'destroy') commands.push([name, ...args]);
              return g;
            },
        },
      );
      return g;
    },
  },
});
mkdirSync('performance-results', { recursive: true });
writeFileSync(
  'performance-results/deer-draw-commands.json',
  JSON.stringify(frames),
);
