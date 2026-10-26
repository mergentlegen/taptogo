// Builds the Cloudflare Workers bundle (.open-next/) inside a Linux container.
//
//   pnpm cf:build:docker
//
// Why Docker: the OpenNext adapter creates symbolic links while it bundles, which Windows
// only allows with administrator rights or Developer Mode. On Linux (a container, WSL or CI)
// it just works. The container gets a copy of the sources WITHOUT .env.local, so no secret
// can end up inside the bundle; settings come from wrangler.jsonc and `wrangler secret`.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const project = resolve(import.meta.dirname, "..");
const output = resolve(project, ".open-next");
mkdirSync(output, { recursive: true });
const script = `
set -e
mkdir /app
cd /src
tar --exclude=./node_modules --exclude=./.next --exclude=./.open-next --exclude=./.wrangler \\
    --exclude=./.env.local --exclude=./.dev.vars --exclude=./.git --exclude=./test-results \\
    --exclude=./tsconfig.tsbuildinfo -cf - . | tar -xf - -C /app
cd /app
npm i -g pnpm@12.14.0 >/dev/null 2>&1
pnpm install --frozen-lockfile
pnpm cf:build
find /dst -mindepth 1 -delete
cp -r .open-next/. /dst/
`;

execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${project}:/src:ro`,
    "-v",
    `${output}:/dst`,
    "node:24-bookworm-slim",
    "bash",
    "-c",
    script,
  ],
  { stdio: "inherit" },
);
console.info("Built: .open-next/ (deploy it with `pnpm wrangler deploy`)");
