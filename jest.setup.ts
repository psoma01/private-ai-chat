import '@testing-library/jest-dom';

// Mock scrollIntoView which is not available in jsdom
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = jest.fn();
}
