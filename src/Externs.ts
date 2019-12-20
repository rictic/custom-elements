import {AlreadyConstructedMarkerType} from './AlreadyConstructedMarker.js';
import CustomElementState from './CustomElementState.js';

// These properties are defined with 'declare' in a ts file so that they will
// not be renamed by Closure Compiler.

// Used for both Documents and Nodes which represent documents in the HTML
// Imports polyfill.
declare global {
  interface CustomElementRegistry {
    forcePolyfill?: boolean;
    polyfillWrapFlushCallback?(outer: (fn: () => void) => void): void;
  }

  interface Node {
    __CE_hasRegistry?: boolean;
    __CE_isImportDocument?: boolean;
    __CE_documentLoadHandled?: boolean;
    __CE_patched?: boolean;
    readyState: string;
  }

  interface Element {
    __CE_state?: CustomElementState;
    __CE_definition?: CustomElementDefinition;
    __CE_shadowRoot?: DocumentFragment;
  }
}

export interface CustomElementDefinition {
  localName: string;
  constructorFunction: {new(): HTMLElement};
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  adoptedCallback?(): void;
  attributeChangedCallback?
      (name: string, oldValue?: string|null, newValue?: string|null,
       namespace?: string|null): void;
  observedAttributes: string[];
  constructionStack: Array<HTMLElement|AlreadyConstructedMarkerType>;
}

export declare interface HTMLImportElement extends HTMLLinkElement {
import?: Node;
}
