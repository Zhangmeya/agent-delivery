import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPackageForBootstrap,
  buildPublishPackageJson,
  parseArgs,
  resolveTargetPackage,
} from "./bootstrap-npm-package.mjs";

test("parseArgs recognizes publish and skip-build flags", () => {
  assert.deepEqual(parseArgs(["@paperclipai/plugin-workspace-diff", "--publish", "--skip-build"]), {
    help: false,
    selector: "@paperclipai/plugin-workspace-diff",
    publish: true,
    skipBuild: true,
    otp: null,
  });
});

test("parseArgs accepts an explicit otp value", () => {
  assert.deepEqual(parseArgs(["packages/plugins/plugin-workspace-diff", "--publish", "--otp", "123456"]), {
    help: false,
    selector: "packages/plugins/plugin-workspace-diff",
    publish: true,
    skipBuild: false,
    otp: "123456",
  });
});

test("parseArgs leaves otp null when omitted", () => {
  assert.deepEqual(parseArgs(["packages/plugins/plugin-workspace-diff", "--publish"]), {
    help: false,
    selector: "packages/plugins/plugin-workspace-diff",
    publish: true,
    skipBuild: false,
    otp: null,
  });
});

test("parseArgs returns help mode", () => {
  assert.deepEqual(parseArgs(["--help"]), {
    help: true,
    selector: null,
    publish: false,
    skipBuild: false,
    otp: null,
  });
});

test("resolveTargetPackage matches by package name or dir", () => {
  const packages = [
    { dir: "packages/a", name: "@penclipai/a", pkg: {} },
    { dir: "packages/b", name: "@penclipai/b", pkg: {} },
  ];

  assert.equal(resolveTargetPackage("@penclipai/a", packages).dir, "packages/a");
  assert.equal(resolveTargetPackage("./packages/b", packages).name, "@penclipai/b");
});

test("buildPublishPackageJson promotes publishConfig and drops dev-only fields", () => {
  const packageJson = buildPublishPackageJson({
    pkg: {
      name: "@penclipai/example",
      version: "1.0.0",
      type: "module",
      repository: {
        type: "git",
        url: "https://github.com/penclipai/paperclip-cn",
      },
      exports: {
        ".": "./src/index.ts",
      },
      publishConfig: {
        access: "public",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": {
            import: "./dist/index.js",
            types: "./dist/index.d.ts",
          },
        },
      },
      files: ["dist"],
      scripts: {
        build: "tsc",
      },
      dependencies: {
        picocolors: "^1.1.1",
      },
      devDependencies: {
        typescript: "^5.7.3",
      },
    },
  });

  assert.deepEqual(packageJson.exports, {
    ".": {
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    },
  });
  assert.equal(packageJson.main, "./dist/index.js");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.deepEqual(packageJson.dependencies, { picocolors: "^1.1.1" });
  assert.deepEqual(packageJson.publishConfig, { access: "public" });
  assert.equal(packageJson.repository.url, "git+https://github.com/penclipai/paperclip-cn.git");
  assert.equal("scripts" in packageJson, false);
  assert.equal("devDependencies" in packageJson, false);
});

test("buildPublishPackageJson converts local compatibility aliases to npm aliases", () => {
  const packageJson = buildPublishPackageJson(
    {
      pkg: {
        name: "@penclipai/example",
        version: "1.0.0",
        dependencies: {
          "@paperclipai/plugin-sdk": "link:../../packages/plugins/sdk",
          "@penclipai/shared": "workspace:@penclipai/shared@*",
          "@daytonaio/sdk": "^0.171.0",
        },
      },
    },
    {
      resolveDependencyVersion(name) {
        return name === "@penclipai/plugin-sdk" ? "2026.428.0" : "2026.428.1";
      },
    },
  );

  assert.deepEqual(packageJson.dependencies, {
    "@paperclipai/plugin-sdk": "npm:@penclipai/plugin-sdk@2026.428.0",
    "@penclipai/shared": "npm:@penclipai/shared@2026.428.1",
    "@daytonaio/sdk": "^0.171.0",
  });
});

test("resolveTargetPackage includes the workspace diff plugin bootstrap package", () => {
  const pkg = resolveTargetPackage("@penclipai/plugin-workspace-diff");

  assert.equal(pkg.dir, "packages/plugins/plugin-workspace-diff");
});

test("buildPackageForBootstrap runs build from the target package directory", () => {
  const calls = [];
  const built = buildPackageForBootstrap(
    {
      name: "@penclipai/plugin-modal",
      dir: "packages/plugins/sandbox-providers/modal",
      pkg: {
        scripts: {
          build: "tsc",
        },
      },
    },
    {
      resolvePnpmInvocation() {
        return { command: "node", argsPrefix: ["pnpm.cjs"] };
      },
      runChecked(command, args) {
        calls.push({ command, args });
      },
    },
  );

  assert.equal(built, true);
  assert.deepEqual(calls, [
    {
      command: "node",
      args: ["pnpm.cjs", "-C", "packages/plugins/sandbox-providers/modal", "run", "build"],
    },
  ]);
});

test("buildPackageForBootstrap skips packages without a build script", () => {
  const calls = [];
  const built = buildPackageForBootstrap(
    {
      name: "@penclipai/no-build",
      dir: "packages/no-build",
      pkg: {
        scripts: {},
      },
    },
    {
      runChecked(command, args) {
        calls.push({ command, args });
      },
    },
  );

  assert.equal(built, false);
  assert.deepEqual(calls, []);
});
