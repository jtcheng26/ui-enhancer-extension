export function isExtensionUiElement(target: HTMLElement) {
  if (target.classList.contains('aui-injected-placeholder')) {
    return true;
  }

  if (target.closest('ai-ui-floating-popup')) {
    return true;
  }

  const rootNode = target.getRootNode();

  return (
    rootNode instanceof ShadowRoot &&
    rootNode.host instanceof HTMLElement &&
    rootNode.host.matches('ai-ui-floating-popup')
  );
}
