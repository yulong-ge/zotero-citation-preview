var controller;
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  const scope = { Zotero, Services, Cu: Components.utils, rootURI };
  Services.scriptloader.loadSubScript(rootURI + 'core.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'preview.js', scope);
  controller = scope.CitationPreview;
  Zotero.CitationPreview = controller;
  controller.start();
}
function shutdown() { controller?.stop(); delete Zotero.CitationPreview; controller = null; }
function install() {}
function uninstall() {}
