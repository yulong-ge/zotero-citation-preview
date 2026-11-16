const fs = require("node:fs");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
function environment({ request } = {}) {
  const observers = new Set();
  let queued = false;
  function changed() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const observer of [...observers]) observer.callback([]);
    });
  }
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributes = {};
      this.className = "";
      this._text = "";
      this.style = {};
    }
    get classList() {
      return {
        contains: (value) => this.className.split(/\s+/).includes(value),
        add: (value) => {
          if (!this.classList.contains(value)) this.className += " " + value;
        },
        remove: (value) => {
          this.className = this.className
            .split(/\s+/)
            .filter((x) => x !== value)
            .join(" ");
        },
      };
    }
    get textContent() {
      return this._text + this.children.map((x) => x.textContent).join(" ");
    }
    set textContent(value) {
      this._text = String(value);
      this.children = [];
      changed();
    }
    append(...nodes) {
      for (const node of nodes) {
        node.remove();
        node.parentNode = this;
        this.children.push(node);
      }
      changed();
    }
    replaceChildren(...nodes) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this._text = "";
      this.append(...nodes);
    }
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter(
          (x) => x !== this,
        );
        this.parentNode = null;
        changed();
      }
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    contains(node) {
      return this === node || this.children.some((x) => x.contains(node));
    }
    get isConnected() {
      return (
        this === doc.body || this === doc.head || !!this.parentNode?.isConnected
      );
    }
    querySelectorAll(selector) {
      const parts = selector.trim().split(/\s+/);
      const matches = (el, part) =>
        part.startsWith(".")
          ? part
              .slice(1)
              .split(".")
              .every((x) => el.classList.contains(x))
          : el.tagName === part.toUpperCase();
      const descendants = (el) =>
        el.children.flatMap((child) => [child, ...descendants(child)]);
      let roots = [this];
      for (const part of parts)
        roots = roots.flatMap((root) =>
          descendants(root).filter((el) => matches(el, part)),
        );
      return [...new Set(roots)];
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
  }
  const doc = {
    createElement: (tag) => new Element(tag),
    head: new Element("head"),
    body: new Element("body"),
    documentElement: new Element("html"),
    addEventListener() {},
    removeEventListener() {},
  };
  doc.querySelectorAll = (selector) => [
    ...doc.body.querySelectorAll(selector),
    ...doc.head.querySelectorAll(selector),
  ];
  doc.querySelector = (selector) => doc.querySelectorAll(selector)[0] || null;
  const win = (doc.defaultView = {
    performance,
    setTimeout,
    clearTimeout,
    AbortController,
    addEventListener() {},
    removeEventListener() {},
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        observers.add(this);
      }
      disconnect() {
        observers.delete(this);
      }
    },
    DOMParser: class {
      parseFromString(value) {
        return { body: { textContent: value.replace(/<[^>]*>/g, "") } };
      }
    },
  });
  const region = doc.createElement("div");
  region.className = "primary-view";
  doc.body.append(region);
  const view = {
    _onSetOverlayPopup() {},
    _getSelectableOverlay() {},
    _handlePointerMove() {},
    _overlayPopupDelayer: { open() {}, close() {} },
    _selectedOverlay: null,
  };
  const internal = { _primaryView: view, _state: {}, _createView() {} };
  const reader = {
    itemID: 1,
    _internalReader: internal,
    _iframeWindow: { document: doc },
    _initPromise: Promise.resolve(),
  };
  const errors = [],
    urls = [];
  const work = {
    title: ["Diffusion for World Modeling: Visual Details Matter in Atari"],
    author: [{ given: "Eloi", family: "Alonso" }],
    published: { "date-parts": [[2024]] },
    DOI: "10.52202/079017-1873",
    abstract: "<p>Real source abstract fixture.</p>",
    type: "proceedings-article",
  };
  const Zotero = {
    HTTP: {
      request: async (method, url, options) => {
        urls.push(url);
        return request
          ? request(method, url, options)
          : { responseText: JSON.stringify({ message: { items: [work] } }) };
      },
    },
    Reader: {
      _readers: [reader],
      registerEventListener(type, listener) {
        this.listener = listener;
      },
      unregisterEventListener() {
        delete this.listener;
      },
    },
    logError: (error) => errors.push(error),
    launchURL() {},
    getMainWindow: () => win,
  };
  const Cu = {
    waiveXrays: (value) => value,
    unwaiveXrays: (value) => value,
    cloneInto: (value) => structuredClone(value),
  };
  const context = { Zotero, Cu, CitationCore: require("../core.js") };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      process.env.CITATION_PREVIEW_SOURCE || require.resolve("../preview.js"),
      "utf8",
    ),
    context,
  );
  const addon = context.CitationPreview;
  function popup(params) {
    internal._state.primaryViewOverlayPopup = params;
    const host = doc.createElement("div");
    host.className =
      "view-popup " +
      {
        citation: "citation-popup",
        reference: "reference-popup",
        "internal-link": "preview-popup",
      }[params.type];
    const inner = doc.createElement("div");
    inner.className = "inner";
    inner.append(doc.createElement("img"));
    host.append(inner);
    region.append(host);
    return host;
  }
  function close(host) {
    internal._state.primaryViewOverlayPopup = null;
    host.remove();
  }
  return {
    doc,
    win,
    view,
    internal,
    reader,
    Zotero,
    Cu,
    addon,
    errors,
    urls,
    popup,
    close,
    Element,
    observers,
  };
}
const reference = {
  chars: [
    ..."[2] Eloi Alonso et al. Diffusion for World Modeling: Visual Details Matter in Atari. 2024.",
  ].map((c) => ({ c })),
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
module.exports = { environment, reference, tick };
