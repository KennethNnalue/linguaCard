declare global {
  interface Window {
    __Zone_disable_customElements?: boolean;
  }
}

window.__Zone_disable_customElements = true;

export {};
