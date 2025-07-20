export default defineNuxtPlugin(() => {
  // Only run on client side
  if (process.client) {
    // Function to disable LastPass and autocomplete for an element
    const disableLastPass = (element: HTMLElement) => {
      if (
        element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.tagName === "SELECT"
      ) {
        // Set autocomplete to off
        element.setAttribute("autocomplete", "off");

        // Set LastPass ignore attributes
        element.setAttribute("data-lpignore", "true");
        element.setAttribute("data-form-type", "other");

        // Additional LastPass prevention
        element.setAttribute("data-lastpass-ignore", "true");
        element.setAttribute("data-1p-ignore", "true");

        // Disable browser autocomplete
        element.setAttribute("autocorrect", "off");
        element.setAttribute("autocapitalize", "off");
        element.setAttribute("spellcheck", "false");
      }

      // Handle UInput components by finding their internal input elements
      // UInput components often have specific class names or data attributes
      const uInputs = element.querySelectorAll(
        "[data-1p-ignore], [data-lpignore], .u-input input, .u-input textarea, .u-input select"
      );
      uInputs.forEach((input) => {
        input.setAttribute("autocomplete", "off");
        input.setAttribute("data-lpignore", "true");
        input.setAttribute("data-form-type", "other");
        input.setAttribute("data-lastpass-ignore", "true");
        input.setAttribute("data-1p-ignore", "true");
        input.setAttribute("autocorrect", "off");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("spellcheck", "false");
      });
    };

    // Function to process all existing inputs
    const processExistingInputs = () => {
      const inputs = document.querySelectorAll("input, textarea, select");
      inputs.forEach(disableLastPass);

      // Also specifically target UInput components
      const uInputComponents = document.querySelectorAll(
        '[class*="u-input"], [class*="UInput"], [class*="ui-input"], [class*="form-input"]'
      );
      uInputComponents.forEach((component) => {
        const internalInputs = component.querySelectorAll(
          "input, textarea, select"
        );
        internalInputs.forEach((input) => {
          input.setAttribute("autocomplete", "off");
          input.setAttribute("data-lpignore", "true");
          input.setAttribute("data-form-type", "other");
          input.setAttribute("data-lastpass-ignore", "true");
          input.setAttribute("data-1p-ignore", "true");
          input.setAttribute("autocorrect", "off");
          input.setAttribute("autocapitalize", "off");
          input.setAttribute("spellcheck", "false");
        });
      });

      // Additional targeting for any input that might be missed
      const allInputs = document.querySelectorAll("input, textarea, select");
      allInputs.forEach((input) => {
        // Check if this input doesn't already have the attributes
        if (!input.hasAttribute("data-lpignore")) {
          input.setAttribute("autocomplete", "off");
          input.setAttribute("data-lpignore", "true");
          input.setAttribute("data-form-type", "other");
          input.setAttribute("data-lastpass-ignore", "true");
          input.setAttribute("data-1p-ignore", "true");
          input.setAttribute("autocorrect", "off");
          input.setAttribute("autocapitalize", "off");
          input.setAttribute("spellcheck", "false");
        }
      });
    };

    // Function to process forms
    const processForms = () => {
      const forms = document.querySelectorAll("form");
      forms.forEach((form) => {
        form.setAttribute("autocomplete", "off");
        form.setAttribute("data-lpignore", "true");
        form.setAttribute("data-form-type", "other");
      });
    };

    // Process existing elements immediately
    processExistingInputs();
    processForms();

    // Watch for new elements being added to the DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;

            // Process the added element
            disableLastPass(element);

            // Process any child inputs
            const childInputs = element.querySelectorAll(
              "input, textarea, select"
            );
            childInputs.forEach(disableLastPass);

            // Process any child forms
            const childForms = element.querySelectorAll("form");
            childForms.forEach((form) => {
              form.setAttribute("autocomplete", "off");
              form.setAttribute("data-lpignore", "true");
              form.setAttribute("data-form-type", "other");
            });
          }
        });
      });
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also run on route changes for SPA navigation
    const router = useRouter();
    router.afterEach(() => {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        processExistingInputs();
        processForms();
      }, 100);
    });
  }
});
