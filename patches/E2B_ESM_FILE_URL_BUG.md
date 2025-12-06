# E2B SDK Bug: `getCallerDirectory` doesn't handle ESM `file://` URLs

## Summary

The `getCallerDirectory()` function in the E2B SDK fails when used with ESM modules because `CallSite.getFileName()` returns `file://` URLs in ESM context, but the function passes this directly to `path.dirname()` which doesn't handle URLs.

## Affected Versions

- `e2b@2.8.3` (and likely earlier versions)
- Affects both `dist/index.js` and `dist/index.mjs`

## Environment

- Tested both Node.js 20.x and 24.x (ESM modules)
- TypeScript with `tsx` runner
- Any ESM project using `Template().copy()`

## Reproduction

1. Create an ESM project (`"type": "module"` in package.json)
2. Create a template using the SDK:

```typescript
// template.ts
import { Template } from 'e2b';

export const template = Template()
  .fromNodeImage('20')
  .copy('src/', '/app/src/');
```

3. Build the template:

```typescript
// build.ts
import { Template } from 'e2b';
import { template } from './template';

await Template.build(template, { alias: 'my-template' });
```

4. Run with: `npx tsx build.ts`

## Error

```
Error: ENOENT: no such file or directory, lstat '/path/to/project/file:/path/to/project/src/'
```

Notice the malformed path: `{cwd}/file:{absolute_path}` - the `file:` prefix is incorrectly embedded in the middle of the path.

---

## Root Cause

In `src/template/utils.ts`, the `getCallerDirectory()` function:

```typescript
function getCallerDirectory(depth) {
  const callSites = callsites(depth + 1);
  if (callSites.length === 0) {
    return void 0;
  }
  const fileName = callSites[0].getFileName();  // Returns file:// URL in ESM!
  if (!fileName) {
    return void 0;
  }
  return path.dirname(fileName);  // path.dirname doesn't handle URLs!
}
```

**The problem:**
- In ESM modules, `CallSite.getFileName()` returns a `file://` URL like `file:///Users/user/project/template.ts`
- `path.dirname()` treats this as a regular path string, producing `file:/Users/user/project`
- This malformed path is then used as `fileContextPath` and joined with relative paths, creating invalid paths like `/Users/user/project/file:/Users/user/project/src`

## Fix (Source Level - for PR)

In `src/template/utils.ts`, add the import and update the function:

```typescript
import { fileURLToPath } from 'node:url';

function getCallerDirectory(depth: number): string | undefined {
  const callSites = callsites(depth + 1);
  if (callSites.length === 0) {
    return undefined;
  }

  let fileName = callSites[0].getFileName();
  if (!fileName) {
    return undefined;
  }

  // Handle file:// URLs returned by getFileName() in ESM modules
  if (fileName.startsWith('file:')) {
    fileName = fileURLToPath(fileName);
  }

  return path.dirname(fileName);
}
```

**Why this fix:**
- `CallSite.getFileName()` returns `file://` URLs in ESM context (Node.js behavior)
- `path.dirname()` expects filesystem paths, not URLs
- `fileURLToPath()` is the standard Node.js API for converting `file://` URLs to paths
- The check `startsWith('file:')` ensures backwards compatibility with CommonJS

## Alternative Approaches Considered

### Option 1: Using URL class (Not recommended)

```typescript
if (fileName.startsWith('file:')) {
  fileName = new URL(fileName).pathname;
}
```

**Why not:** On Windows, `file:///C:/path` would produce `/C:/path` with a leading slash. `fileURLToPath()` handles platform differences correctly.

### Option 2: Regex strip (Not recommended)

```typescript
if (fileName.startsWith('file://')) {
  fileName = fileName.replace(/^file:\/\//, '');
}
```

**Why not:**
- Doesn't handle `file:///path` (three slashes) vs `file://host/path` correctly
- Doesn't handle Windows paths (`file:///C:/...`)
- Doesn't handle URL encoding (`%20` for spaces, etc.)

### Option 3: Caching the import (Acceptable but unnecessary)

```typescript
// At module level
let _fileURLToPath: typeof import('url').fileURLToPath | null = null;

function getFileURLToPath() {
  if (!_fileURLToPath) {
    _fileURLToPath = require('url').fileURLToPath;
  }
  return _fileURLToPath;
}

// In function
if (fileName.startsWith('file:')) {
  fileName = getFileURLToPath()(fileName);
}
```

**Why not chosen:** Node.js already caches `require()` calls. The module is only loaded once regardless of how many times `require('url')` is called. This adds complexity without benefit.

**Why not chosen:** `require('url')` is a core Node.js module - it will never fail. The try-catch adds unnecessary complexity.

## Chosen Approach Rationale

The recommended fix uses `fileURLToPath()` because:

1. **Standard API** - It's the Node.js recommended way to convert file URLs to paths
2. **Cross-platform** - Handles Windows, macOS, and Linux correctly
3. **URL decoding** - Automatically decodes `%20` → space, etc.
4. **Minimal** - Single line change, easy to review
5. **Safe** - Only runs when needed (file:// URLs), no impact on CommonJS
6. **Performant** - `require()` is cached, negligible overhead

## Workaround

Until this is fixed upstream, use `patch-package`:

1. Install: `npm install patch-package --save-dev`
2. Add to package.json scripts: `"postinstall": "patch-package"`
3. Apply the fix manually to `node_modules/e2b/dist/index.js` and `index.mjs`
4. Run: `npx patch-package e2b`

## Related

- Node.js ESM documentation on `file://` URLs: https://nodejs.org/api/esm.html#file-urls
- `fileURLToPath` documentation: https://nodejs.org/api/url.html#urlfileurltopathurl
