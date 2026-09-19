// Reading and writing the logo scripts' inputs and outputs, by path from the project root.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);

/** A filesystem path for `path` from the project root, for tools that need one. */
export const projectPath = (path) => fileURLToPath(new URL(path, root));

export const readProjectFile = (path) => readFileSync(projectPath(path), 'utf8');

/** Writes `content` to `path` from the project root, and logs the path. */
export function writeProjectFile(path, content) {
  writeFileSync(projectPath(path), content);
  console.log(path);
}

/** Renders `svg` to a PNG at `path` from the project root, `width` by `height`, and logs the path. Needs rsvg-convert. */
export function writeProjectPng(path, svg, width, height = width) {
  execFileSync('rsvg-convert', ['--width', width, '--height', height, '--output', projectPath(path)], { input: svg });
  console.log(path);
}
