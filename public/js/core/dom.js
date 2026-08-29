// public/js/core/dom.js
// Helper para crear elementos DOM de forma segura

export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'text') {
      element.textContent = value;
    } else if (key === 'html') {
      element.innerHTML = value;
    } else if (key === 'class') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else {
      element.setAttribute(key, value);
    }
  });

  if (Array.isArray(children)) {
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        element.appendChild(child);
      }
    });
  }

  return element;
}

export function html(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const value = values[i] !== undefined ? values[i] : '';
    return result + str + String(value);
  }, '');
}
