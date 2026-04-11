import '../../assets/tailwind.css';

import { initializeContentPrototype } from '../content/bootstrap';

export default defineContentScript({
  cssInjectionMode: 'ui',
  matches: ['<all_urls>'],
  main(ctx) {
    void initializeContentPrototype(ctx);
  },
});
