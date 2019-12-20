/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import {CustomElementState as CEState} from './CustomElementState.js';
import {CustomElementDefinition, HTMLImportElement} from './Externs.js';
import * as Utilities from './Utilities.js';

export default class CustomElementInternals {
  private readonly _localNameToDefinition =
      new Map<string, CustomElementDefinition>();
  private readonly _constructorToDefinition =
      new Map<{new(): unknown}, CustomElementDefinition>();
  private readonly _patchesNode: Array<(node: Node) => void> = [];
  private readonly _patchesElement: Array<(elem: Element) => void> = [];
  private _hasPatches = false;

  setDefinition(localName: string, definition: CustomElementDefinition) {
    this._localNameToDefinition.set(localName, definition);
    this._constructorToDefinition.set(
        definition.constructorFunction, definition);
  }

  localNameToDefinition(localName: string) {
    return this._localNameToDefinition.get(localName);
  }

  constructorToDefinition(constructor: {new(): unknown}) {
    return this._constructorToDefinition.get(constructor);
  }

  addNodePatch(patch: (node: Node) => void) {
    this._hasPatches = true;
    this._patchesNode.push(patch);
  }

  addElementPatch(patch: (element: Element) => void) {
    this._hasPatches = true;
    this._patchesElement.push(patch);
  }

  patchTree(node: Node) {
    if (!this._hasPatches)
      return;

    Utilities.walkDeepDescendantElements(
        node, element => this.patchElement(element));
  }

  patchNode(node: Node) {
    if (!this._hasPatches)
      return;

    if (node.__CE_patched)
      return;
    node.__CE_patched = true;

    for (let i = 0; i < this._patchesNode.length; i++) {
      this._patchesNode[i](node);
    }
  }

  patchElement(element: Element) {
    if (!this._hasPatches)
      return;

    if (element.__CE_patched)
      return;
    element.__CE_patched = true;

    for (let i = 0; i < this._patchesNode.length; i++) {
      this._patchesNode[i](element);
    }

    for (let i = 0; i < this._patchesElement.length; i++) {
      this._patchesElement[i](element);
    }
  }

  connectTree(root: Node) {
    const elements: Element[] = [];

    Utilities.walkDeepDescendantElements(
        root, element => elements.push(element));

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (element.__CE_state === CEState.custom) {
        this.connectedCallback(element);
      } else {
        this.upgradeElement(element as HTMLElement);
      }
    }
  }

  disconnectTree(root: Node) {
    const elements: Element[] = [];

    Utilities.walkDeepDescendantElements(
        root, element => elements.push(element));

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (element.__CE_state === CEState.custom) {
        this.disconnectedCallback(element);
      }
    }
  }

  /**
   * Upgrades all uncustomized custom elements at and below a root node for
   * which there is a definition. When custom element reaction callbacks are
   * assumed to be called synchronously (which, by the current DOM / HTML spec
   * definitions, they are *not*), callbacks for both elements customized
   * synchronously by the parser and elements being upgraded occur in the same
   * relative order.
   *
   * NOTE: This function, when used to simulate the construction of a tree that
   * is already created but not customized (i.e. by the parser), does *not*
   * prevent the element from reading the 'final' (true) state of the tree. For
   * example, the element, during truly synchronous parsing / construction would
   * see that it contains no children as they have not yet been inserted.
   * However, this function does not modify the tree, the element will
   * (incorrectly) have children. Additionally, self-modification restrictions
   * for custom element constructors imposed by the DOM spec are *not* enforced.
   *
   *
   * The following nested list shows the steps extending down from the HTML
   * spec's parsing section that cause elements to be synchronously created and
   * upgraded:
   *
   * The "in body" insertion mode:
   * https://html.spec.whatwg.org/multipage/syntax.html#parsing-main-inbody
   * - Switch on token:
   *   .. other cases ..
   *   -> Any other start tag
   *      - [Insert an HTML element](below) for the token.
   *
   * Insert an HTML element:
   * https://html.spec.whatwg.org/multipage/syntax.html#insert-an-html-element
   * - Insert a foreign element for the token in the HTML namespace:
   *   https://html.spec.whatwg.org/multipage/syntax.html#insert-a-foreign-element
   *   - Create an element for a token:
   *     https://html.spec.whatwg.org/multipage/syntax.html#create-an-element-for-the-token
   *     - Will execute script flag is true?
   *       - (Element queue pushed to the custom element reactions stack.)
   *     - Create an element:
   *       https://dom.spec.whatwg.org/#concept-create-element
   *       - Sync CE flag is true?
   *         - Constructor called.
   *         - Self-modification restrictions enforced.
   *       - Sync CE flag is false?
   *         - (Upgrade reaction enqueued.)
   *     - Attributes appended to element.
   *       (`attributeChangedCallback` reactions enqueued.)
   *     - Will execute script flag is true?
   *       - (Element queue popped from the custom element reactions stack.
   *         Reactions in the popped stack are invoked.)
   *   - (Element queue pushed to the custom element reactions stack.)
   *   - Insert the element:
   *     https://dom.spec.whatwg.org/#concept-node-insert
   *     - Shadow-including descendants are connected. During parsing
   *       construction, there are no shadow-*excluding* descendants.
   *       However, the constructor may have validly attached a shadow
   *       tree to itself and added descendants to that shadow tree.
   *       (`connectedCallback` reactions enqueued.)
   *   - (Element queue popped from the custom element reactions stack.
   *     Reactions in the popped stack are invoked.)
   *
   * @param {!Node} root
   * @param {{
   *   visitedImports: (!Set<!Node>|undefined),
   *   upgrade: (!function(!Element)|undefined),
   * }=} options
   */
  patchAndUpgradeTree(root: Node, options: {
    visitedImports?: Set<Node>,
    upgrade?: (elem: HTMLElement) => void
  } = {}) {
    const visitedImports = options.visitedImports || new Set();
    const upgrade =
        options.upgrade || (element => this.upgradeElement(element));

    const elements: Element[] = [];

    const gatherElements = (element: Element) => {
      if (element.localName === 'link' &&
          element.getAttribute('rel') === 'import') {
        const importElem = element as HTMLImportElement;
        // The HTML Imports polyfill sets a descendant element of the link to
        // the `import` property, specifically this is *not* a Document.
        const importNode = importElem.import;

        if (importNode instanceof Node) {
          importNode.__CE_isImportDocument = true;
          // Connected links are associated with the registry.
          importNode.__CE_hasRegistry = true;
        }

        if (importNode && importNode.readyState === 'complete') {
          importNode.__CE_documentLoadHandled = true;
        } else {
          // If this link's import root is not available, its contents can't be
          // walked. Wait for 'load' and walk it when it's ready.
          element.addEventListener('load', () => {
            const importNode = importElem.import!;

            if (importNode.__CE_documentLoadHandled)
              return;
            importNode.__CE_documentLoadHandled = true;

            // Clone the `visitedImports` set that was populated sync during
            // the `patchAndUpgradeTree` call that caused this 'load' handler to
            // be added. Then, remove *this* link's import node so that we can
            // walk that import again, even if it was partially walked later
            // during the same `patchAndUpgradeTree` call.
            const clonedVisitedImports = new Set(visitedImports);
            clonedVisitedImports.delete(importNode);

            this.patchAndUpgradeTree(
                importNode, {visitedImports: clonedVisitedImports, upgrade});
          });
        }
      } else {
        elements.push(element);
      }
    };

    // `walkDeepDescendantElements` populates (and internally checks against)
    // `visitedImports` when traversing a loaded import.
    Utilities.walkDeepDescendantElements(root, gatherElements, visitedImports);

    if (this._hasPatches) {
      for (let i = 0; i < elements.length; i++) {
        this.patchElement(elements[i]);
      }
    }

    for (let i = 0; i < elements.length; i++) {
      upgrade(elements[i] as HTMLElement);
    }
  }

  upgradeElement(element: HTMLElement) {
    const currentState = element.__CE_state;
    if (currentState !== undefined)
      return;

    // Prevent elements created in documents without a browsing context from
    // upgrading.
    //
    // https://html.spec.whatwg.org/multipage/custom-elements.html#look-up-a-custom-element-definition
    //   "If document does not have a browsing context, return null."
    //
    // https://html.spec.whatwg.org/multipage/window-object.html#dom-document-defaultview
    //   "The defaultView IDL attribute of the Document interface, on getting,
    //   must return this Document's browsing context's WindowProxy object, if
    //   this Document has an associated browsing context, or null otherwise."
    const ownerDocument = element.ownerDocument!;
    if (!ownerDocument.defaultView &&
        !(ownerDocument.__CE_isImportDocument &&
          ownerDocument.__CE_hasRegistry))
      return;

    const definition = this.localNameToDefinition(element.localName);
    if (!definition)
      return;

    definition.constructionStack.push(element);

    const constructor = definition.constructorFunction;
    try {
      try {
        let result = new (constructor)();
        if (result !== element) {
          throw new Error(
              'The custom element constructor did not produce the element being upgraded.');
        }
      } finally {
        definition.constructionStack.pop();
      }
    } catch (e) {
      element.__CE_state = CEState.failed;
      throw e;
    }

    element.__CE_state = CEState.custom;
    element.__CE_definition = definition;

    if (definition.attributeChangedCallback) {
      const observedAttributes = definition.observedAttributes;
      for (let i = 0; i < observedAttributes.length; i++) {
        const name = observedAttributes[i];
        const value = element.getAttribute(name);
        if (value !== null) {
          this.attributeChangedCallback(element, name, null, value, null);
        }
      }
    }

    if (Utilities.isConnected(element)) {
      this.connectedCallback(element);
    }
  }

  connectedCallback(element: Element) {
    const definition = element.__CE_definition!;
    if (definition.connectedCallback) {
      definition.connectedCallback.call(element);
    }
  }

  disconnectedCallback(element: Element) {
    const definition = element.__CE_definition!;
    if (definition.disconnectedCallback) {
      definition.disconnectedCallback.call(element);
    }
  }

  attributeChangedCallback(
      element: Element, name: string, oldValue?: string|null,
      newValue?: string|null, namespace?: string|null) {
    const definition = element.__CE_definition!;
    if (definition.attributeChangedCallback &&
        definition.observedAttributes.indexOf(name) > -1) {
      definition.attributeChangedCallback.call(
          element, name, oldValue, newValue, namespace);
    }
  }
}
