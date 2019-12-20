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

import CustomElementInternals from '../CustomElementInternals.js';

import PatchParentNode from './Interface/ParentNode.js';
import Native from './Native.js';

export default function(internals: CustomElementInternals) {
  Document.prototype.createElement = function(
      this: Document, localName: string) {
    // Only create custom elements if this document is associated with the
    // registry.
    if (this.__CE_hasRegistry) {
      const definition = internals.localNameToDefinition(localName);
      if (definition) {
        return new (definition.constructorFunction)();
      }
    }

    const result = /** @type {!Element} */
        (Native.Document_createElement.call(this, localName));
    internals.patchElement(result);
    return result;
  };

  Document.prototype.importNode = function<T extends Node>(
      this: Document, node: T, deep?: boolean): T {
    const clone = Native.Document_importNode.call(this, node, !!deep) as T;
    // Only create custom elements if this document is associated with the
    // registry.
    if (!this.__CE_hasRegistry) {
      internals.patchTree(clone);
    } else {
      internals.patchAndUpgradeTree(clone);
    }
    return clone;
  };

  const NS_HTML = 'http://www.w3.org/1999/xhtml';

  Document.prototype.createElementNS =
      function(this: Document, namespace: string|null, localName: string) {
    // Only create custom elements if this document is associated with the
    // registry.
    if (this.__CE_hasRegistry &&
        (namespace === null || namespace === NS_HTML)) {
      const definition = internals.localNameToDefinition(localName);
      if (definition) {
        return new (definition.constructorFunction)();
      }
    }

    const result =
        Native.Document_createElementNS.call(this, namespace, localName);
    internals.patchElement(result);
    return result;
  } as typeof Document.prototype.createElementNS;

  PatchParentNode(internals, Document.prototype, {
    prepend: Native.Document_prepend,
    append: Native.Document_append,
  });
};
