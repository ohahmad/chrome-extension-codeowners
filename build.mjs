#!/usr/bin/env node
import * as esbuild from "esbuild";

console.log(process.argv);

const context = await esbuild.context({
  logLevel: "info",
  entryPoints: [
    "src/codeowners_sw.ts",
    "src/codeowners/codeowners.ts",
    "src/options/options.ts",
  ],
  outdir: "./dist",
  bundle: process.argv.includes("bundle"),
  minify: process.argv.includes("minify"),
});

if (process.argv.includes("watch")) {
  await context.watch();
} else {
  await context.rebuild();
  context.dispose();
}
