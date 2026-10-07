const isInputElement = (element: Element | null): boolean =>
  element instanceof HTMLElement &&
  (element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT');

export { isInputElement };
