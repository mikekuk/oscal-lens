const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

test('lazy graph imports current dependencies when older modules are already cached', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-module-cache-'));
  try {
    await fs.cp(path.join(__dirname, '../dist'), directory, {recursive:true});
    const viewsPath = path.join(directory, 'views.mjs');
    const modelPath = path.join(directory, 'graph-model.mjs');
    const views = await fs.readFile(viewsPath, 'utf8');
    const model = await fs.readFile(modelPath, 'utf8');
    // Reproduce an open tab: old unversioned modules remain in its module map
    // even after the deployment replaces their files on the server.
    await fs.writeFile(viewsPath, views.slice(0, views.indexOf('/** Keep file membership explicit')));
    await fs.writeFile(modelPath, model.replace('totalControls: allowed.size, resourceGroups', 'totalControls: allowed.size'));
    const oldViews = await import(pathToFileURL(viewsPath).href);
    const oldModel = await import(pathToFileURL(modelPath).href);
    assert.equal(oldViews.renderGraphControlLists, undefined);
    const graph = {nodes:[], resources:[], occurrences:[]};
    assert.equal(oldModel.projectGraph(graph).resourceGroups, undefined);
    await fs.writeFile(viewsPath, views);
    await fs.writeFile(modelPath, model);
    const renderer = await import(pathToFileURL(path.join(directory, 'graph-view.mjs')).href);
    assert.equal(typeof renderer.mountGraph, 'function');
    const source = await fs.readFile(path.join(directory, 'graph-view.mjs'), 'utf8');
    const modelSpecifier = source.match(/from '(\.\/graph-model\.mjs[^']*)'/)[1];
    const currentModel = await import(new URL(modelSpecifier, pathToFileURL(path.join(directory, 'graph-view.mjs'))).href);
    assert.deepEqual(currentModel.projectGraph(graph).resourceGroups, []);
  } finally {
    await fs.rm(directory, {recursive:true, force:true});
  }
});
