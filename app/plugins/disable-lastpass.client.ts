import {
  LAST_PASS_ALLOW_PAGE_ATTR,
  LAST_PASS_FORM_PREVENTION_ATTRS,
  LAST_PASS_PREVENTION_ATTRS,
  LAST_PASS_READONLY_ATTR,
  isLastPassAllowlistedElement,
  isLastPassAllowlistedPath,
} from "~/composables/useLastPassPrevention";

const FIELD_SELECTOR = "input, textarea, select";
const SKIP_READONLY_TYPES = new Set([
  "hidden",
  "checkbox",
  "radio",
  "file",
  "submit",
  "button",
  "reset",
  "image",
  "range",
  "color",
]);

const previousValues = new WeakMap<
  HTMLInputElement | HTMLTextAreaElement,
  string
>();
const unlockedFields = new WeakSet<HTMLInputElement | HTMLTextAreaElement>();

function applyAttrs(el: Element, attrs: Record<string, string>): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (el.getAttribute(key) !== value) {
      el.setAttribute(key, value);
    }
  }
}

function isTextField(
  el: Element,
): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function snapshotValue(el: HTMLInputElement | HTMLTextAreaElement): void {
  previousValues.set(el, el.value);
}

function lockUntilGesture(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (unlockedFields.has(el) || el.disabled) {
    return;
  }
  if (el instanceof HTMLInputElement && SKIP_READONLY_TYPES.has(el.type)) {
    return;
  }
  if (el.readOnly) {
    return;
  }
  el.readOnly = true;
  el.setAttribute(LAST_PASS_READONLY_ATTR, "true");
}

function unlockField(el: Element): void {
  if (!isTextField(el) || isLastPassAllowlistedElement(el)) {
    return;
  }
  if (!el.hasAttribute(LAST_PASS_READONLY_ATTR)) {
    return;
  }
  snapshotValue(el);
  el.readOnly = false;
  el.removeAttribute(LAST_PASS_READONLY_ATTR);
  unlockedFields.add(el);
}

function protectField(el: Element): void {
  if (
    !(
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    )
  ) {
    return;
  }
  if (isLastPassAllowlistedElement(el)) {
    return;
  }
  applyAttrs(el, LAST_PASS_PREVENTION_ATTRS);
  if (isTextField(el)) {
    snapshotValue(el);
    lockUntilGesture(el);
  }
}

function protectForm(form: HTMLFormElement): void {
  if (isLastPassAllowlistedElement(form)) {
    return;
  }
  applyAttrs(form, LAST_PASS_FORM_PREVENTION_ATTRS);
}

function processTree(root: ParentNode): void {
  if (root instanceof Element) {
    protectField(root);
    if (root instanceof HTMLFormElement) {
      protectForm(root);
    }
  }
  root.querySelectorAll(FIELD_SELECTOR).forEach((node) => {
    protectField(node);
  });
  root.querySelectorAll("form").forEach((form) => {
    protectForm(form);
  });
}

function syncAllowPage(path: string): void {
  if (isLastPassAllowlistedPath(path)) {
    document.documentElement.setAttribute(LAST_PASS_ALLOW_PAGE_ATTR, "true");
  } else {
    document.documentElement.removeAttribute(LAST_PASS_ALLOW_PAGE_ATTR);
  }
}

function onUntrustedFill(event: Event): void {
  const el = event.target;
  if (!isTextField(el) || isLastPassAllowlistedElement(el)) {
    return;
  }
  if (event.isTrusted) {
    snapshotValue(el);
    return;
  }
  event.stopImmediatePropagation();
  const previous = previousValues.get(el);
  if (previous !== undefined) {
    el.value = previous;
  }
}

function onTrustedUnlock(event: Event): void {
  if (!event.isTrusted) {
    return;
  }
  const el = event.target;
  if (el instanceof Element) {
    unlockField(el);
  }
}

export default defineNuxtPlugin(() => {
  const route = useRoute();
  const router = useRouter();

  syncAllowPage(route.path);
  processTree(document);

  document.addEventListener("input", onUntrustedFill, true);
  document.addEventListener("change", onUntrustedFill, true);
  document.addEventListener("pointerdown", onTrustedUnlock, true);
  document.addEventListener("focusin", onTrustedUnlock, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        protectField(mutation.target);
        if (mutation.target instanceof HTMLFormElement) {
          protectForm(mutation.target);
        }
        continue;
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          processTree(node);
        }
      });
    }
  });

  const observeBody = () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["readonly", "autocomplete", "data-lpignore"],
      });
    }
  };
  observeBody();
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", () => {
      observeBody();
      processTree(document);
    });
  }

  router.afterEach((to) => {
    syncAllowPage(to.path);
    requestAnimationFrame(() => {
      processTree(document);
    });
  });
});
